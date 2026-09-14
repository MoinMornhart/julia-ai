'use strict';

const { spawn } = require('child_process');
const readline = require('readline');
const { EventEmitter } = require('events');

// "Hey Julia" (oder "Hey Rainer" – der eigene Name) als Aktivierungswort.
// Nur wenn eingeschaltet. Erkannt wird ausschließlich das Wort, lokal über
// die Windows-Spracherkennung; es wird nichts aufgenommen oder verschickt.
// Eine Diktat-Grammatik läuft als "Füller" mit: Normale Sprache landet dort
// und nicht fälschlich beim Aktivierungswort.

function kodiert(skript) {
  return Buffer.from(skript, 'utf16le').toString('base64');
}

function phrasen(name, sprachcode) {
  const n = String(name || '').replace(/[^\p{L}\p{N} .'’-]/gu, '').replace(/\s+/g, ' ').trim() || 'Julia';
  return sprachcode === 'en' ? [`Hey ${n}`, `Hi ${n}`, `OK ${n}`] : [`Hey ${n}`, `Hallo ${n}`, `Okay ${n}`];
}

const SKRIPT = `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
function Aus($s) { [Console]::Out.WriteLine($s); [Console]::Out.Flush() }
try {
  Add-Type -AssemblyName System.Speech
  $woerter = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($env:JULIA_WECKWOERTER)) | ConvertFrom-Json
  $info = [System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers() | Where-Object { $_.Culture.Name -like ($env:JULIA_KULTUR + '*') } | Select-Object -First 1
  if (-not $info) { Aus 'E KEIN_ERKENNER'; exit 2 }
  $rec = New-Object System.Speech.Recognition.SpeechRecognitionEngine($info)
  $auswahl = New-Object System.Speech.Recognition.Choices
  foreach ($w in $woerter) { $auswahl.Add([string]$w) }
  $gb = New-Object System.Speech.Recognition.GrammarBuilder($auswahl)
  $gb.Culture = $info.Culture
  $wort = New-Object System.Speech.Recognition.Grammar($gb)
  $wort.Name = 'weckwort'
  $rec.LoadGrammar($wort)
  $fueller = New-Object System.Speech.Recognition.DictationGrammar
  $fueller.Name = 'fueller'
  $rec.LoadGrammar($fueller)
  $eingestellt = $false
  if ($env:JULIA_MIKRO -and $env:JULIA_AUDIO_DLL) {
    try {
      Add-Type -Path $env:JULIA_AUDIO_DLL
      $nr = [JuliaAudioGeraete]::EingangNr($env:JULIA_MIKRO)
      if ($nr -ge 0) {
        $strom = New-Object JuliaMikrofon($nr)
        $format = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(16000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
        $rec.SetInputToAudioStream($strom, $format)
        $eingestellt = $true
      } else { Aus 'H MIKRO_FEHLT' }
    } catch { Aus 'H MIKRO_FEHLT' }
  }
  if (-not $eingestellt) { try { $rec.SetInputToDefaultAudioDevice() } catch { Aus 'E KEIN_MIKROFON'; exit 3 } }
  $null = Register-ObjectEvent -InputObject $rec -EventName SpeechRecognized -SourceIdentifier erkannt
  $rec.RecognizeAsync([System.Speech.Recognition.RecognizeMode]::Multiple)
  Aus 'B'
  $schwelle = [double]::Parse($env:JULIA_SCHWELLE, [Globalization.CultureInfo]::InvariantCulture)
  while ($true) {
    $e = Wait-Event -SourceIdentifier erkannt
    Remove-Event -EventIdentifier $e.EventIdentifier
    $r = $e.SourceEventArgs.Result
    if ($r.Grammar.Name -eq 'weckwort' -and $r.Confidence -ge $schwelle) {
      Aus ('W ' + $r.Confidence.ToString([Globalization.CultureInfo]::InvariantCulture) + ' ' + $r.Text)
    }
  }
} catch {
  Aus ('E ' + $_.Exception.Message)
}
`;

class Weckwort extends EventEmitter {
  // dll(): Pfad zur Audio-Hilfe – nur für ein eigenes Mikrofon nötig.
  constructor({ dll } = {}) {
    super();
    this.dll = dll || (async () => '');
    this.proc = null;
    this.schluessel = null;
    this.lauf = 0;
  }

  get laeuft() {
    return !!this.proc;
  }

  async starten({ name, sprachcode, schwelle, mikrofon = '' }) {
    const woerter = phrasen(name, sprachcode);
    const schluessel = JSON.stringify([woerter, sprachcode, schwelle, mikrofon]);
    if (this.proc && this.schluessel === schluessel) return;
    this.stoppen();
    const lauf = ++this.lauf;
    const dllPfad = mikrofon ? await this.dll().catch(() => '') : '';
    if (lauf !== this.lauf) return; // inzwischen neu gestartet oder gestoppt
    this.schluessel = schluessel;
    const p = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', kodiert(SKRIPT)], {
      windowsHide: true,
      env: {
        ...process.env,
        JULIA_WECKWOERTER: Buffer.from(JSON.stringify(woerter), 'utf8').toString('base64'),
        JULIA_KULTUR: sprachcode === 'en' ? 'en' : 'de',
        JULIA_SCHWELLE: String(schwelle),
        JULIA_MIKRO: mikrofon,
        JULIA_AUDIO_DLL: dllPfad,
      },
    });
    this.proc = p;
    readline.createInterface({ input: p.stdout }).on('line', (z) => {
      if (z === 'B') this.emit('bereit', woerter);
      else if (z.startsWith('W ')) {
        const [, sicherheit, ...rest] = z.split(' ');
        this.emit('erkannt', { text: rest.join(' '), sicherheit: Number(sicherheit) });
      } else if (z.startsWith('E ')) this.emit('fehler', z.slice(2).trim());
      else if (z.startsWith('H ')) this.emit('hinweis', z.slice(2).trim());
    });
    p.on('exit', () => {
      if (this.proc !== p) return; // absichtlich gestoppt
      this.proc = null;
      this.schluessel = null;
      // Unerwartet beendet (Gerät weg, Engine abgestürzt …): Bescheid geben,
      // damit das Aktivierungswort von selbst wieder anläuft.
      this.emit('beendet');
    });
  }

  stoppen() {
    this.lauf++;
    if (!this.proc) return;
    const p = this.proc;
    this.proc = null;
    this.schluessel = null;
    p.kill();
  }
}

module.exports = { Weckwort, phrasen };
