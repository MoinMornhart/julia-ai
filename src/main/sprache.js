'use strict';

const { spawn } = require('child_process');
const readline = require('readline');
const { EventEmitter } = require('events');

// Spracherkennung und Sprachausgabe über die Windows-eigene Sprach-Engine
// (System.Speech). Läuft offline und braucht keinen zusätzlichen Schlüssel.

function kodiert(skript) {
  return Buffer.from(skript, 'utf16le').toString('base64');
}

function powershell(skript, env) {
  return spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', kodiert(skript)], {
    windowsHide: true,
    env: { ...process.env, ...env },
  });
}

const ERKENNEN = `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
function Aus($s) { [Console]::Out.WriteLine($s); [Console]::Out.Flush() }
try {
  Add-Type -AssemblyName System.Speech
  $info = [System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers() | Where-Object { $_.Culture.Name -like ($env:JULIA_KULTUR + '*') } | Select-Object -First 1
  if (-not $info) { Aus 'E KEIN_ERKENNER'; exit 2 }
  $rec = New-Object System.Speech.Recognition.SpeechRecognitionEngine($info)
  $rec.LoadGrammar((New-Object System.Speech.Recognition.DictationGrammar))
  $rec.SetInputToDefaultAudioDevice()
  $rec.InitialSilenceTimeout = [TimeSpan]::FromSeconds(8)
  $rec.EndSilenceTimeout = [TimeSpan]::FromSeconds(1.0)
  $rec.EndSilenceTimeoutAmbiguous = [TimeSpan]::FromSeconds(1.5)
  $null = Register-ObjectEvent -InputObject $rec -EventName AudioLevelUpdated -SourceIdentifier pegel
  $null = Register-ObjectEvent -InputObject $rec -EventName SpeechRecognized -SourceIdentifier erkannt
  $null = Register-ObjectEvent -InputObject $rec -EventName RecognizeCompleted -SourceIdentifier fertig
  $rec.RecognizeAsync([System.Speech.Recognition.RecognizeMode]::Single)
  $text = ''
  $ende = $false
  while (-not $ende) {
    $e = Wait-Event -Timeout 30
    if (-not $e) { break }
    Remove-Event -EventIdentifier $e.EventIdentifier
    switch ($e.SourceIdentifier) {
      'pegel'   { Aus ('L ' + $e.SourceEventArgs.AudioLevel) }
      'erkannt' { $text = $e.SourceEventArgs.Result.Text }
      'fertig'  { $ende = $true }
    }
  }
  Aus ('T ' + $text)
} catch {
  Aus ('E ' + $_.Exception.Message)
}
`;

const SPRECHEN = `
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
Add-Type -AssemblyName System.Speech
$text = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($env:JULIA_TEXT))
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
$stimmen = $s.GetInstalledVoices() | Where-Object { $_.Enabled } | ForEach-Object { $_.VoiceInfo }
$wahl = $stimmen | Where-Object { $_.Name -eq $env:JULIA_STIMME -and $_.Culture.Name -like ($env:JULIA_KULTUR + '*') } | Select-Object -First 1
if (-not $wahl) { $wahl = $stimmen | Where-Object { $_.Culture.Name -like ($env:JULIA_KULTUR + '*') } | Select-Object -First 1 }
if ($wahl) { $s.SelectVoice($wahl.Name) }
$s.Rate = [int]$env:JULIA_TEMPO
$s.SetOutputToDefaultAudioDevice()
$null = Register-ObjectEvent -InputObject $s -EventName VisemeReached -SourceIdentifier vis
$null = Register-ObjectEvent -InputObject $s -EventName SpeakCompleted -SourceIdentifier fertig
$null = $s.SpeakAsync($text)
while ($true) {
  $e = Wait-Event -Timeout 300
  if (-not $e) { break }
  Remove-Event -EventIdentifier $e.EventIdentifier
  if ($e.SourceIdentifier -eq 'fertig') { break }
  [Console]::Out.WriteLine('V ' + $e.SourceEventArgs.Viseme)
  [Console]::Out.Flush()
}
`;

const STIMMEN = `
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
Add-Type -AssemblyName System.Speech
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
$s.GetInstalledVoices() | Where-Object { $_.Enabled } | ForEach-Object { [Console]::Out.WriteLine($_.VoiceInfo.Culture.Name + [char]9 + $_.VoiceInfo.Name) }
`;

// Aus Markdown wird vorlesbarer Text: Code und Tabellen fliegen raus.
function fuerSprache(text, sprachcode = 'de') {
  const codeHinweis = sprachcode === 'en' ? ' (code is in the chat) ' : ' (Code steht im Chat) ';
  return String(text || '')
    .replace(/```[\s\S]*?```/g, codeHinweis)
    .replace(/^\|.*\|$/gm, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^#+\s*/gm, '')
    .replace(/^\s*[-*]\s+/gm, '')
    .replace(/[*_~>]/g, '')
    .replace(/✓/g, '')
    .replace(/⚠/g, '')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

class Sprache extends EventEmitter {
  constructor() {
    super();
    this.hoeren = null;
    this.sprechenProc = null;
  }

  get hoertZu() { return !!this.hoeren; }
  get sprichtGerade() { return !!this.sprechenProc; }

  // Nimmt einen Satz auf. Liefert den erkannten Text ('' bei Stille oder Abbruch).
  zuhoeren(sprachcode = 'de') {
    if (this.hoeren) return Promise.resolve('');
    const kultur = sprachcode === 'en' ? 'en' : 'de';
    return new Promise((resolve, reject) => {
      const p = powershell(ERKENNEN, { JULIA_KULTUR: kultur });
      this.hoeren = p;
      let text = '';
      let fehler = null;
      readline.createInterface({ input: p.stdout }).on('line', (z) => {
        if (z.startsWith('L ')) this.emit('pegel', Math.min(1, Number(z.slice(2)) / 100));
        else if (z.startsWith('T ')) text = z.slice(2).trim();
        else if (z.startsWith('E ')) fehler = z.slice(2).trim();
      });
      p.on('exit', () => {
        this.hoeren = null;
        this.emit('pegel', 0);
        if (fehler === 'KEIN_ERKENNER') {
          reject(new Error(kultur === 'en'
            ? 'No English speech recognizer is installed. Add one under Windows Settings > Time & language > Speech.'
            : 'Für Deutsch ist keine Spracherkennung installiert. Unter Windows-Einstellungen > Zeit und Sprache > Spracherkennung nachrüsten.'));
        } else if (fehler) reject(new Error(fehler));
        else resolve(text);
      });
    });
  }

  zuhoerenAbbrechen() {
    if (this.hoeren) this.hoeren.kill();
  }

  sprechen(text, { stimme, tempo = 0, sprachcode = 'de' } = {}) {
    this.stumm();
    const sauber = fuerSprache(text, sprachcode);
    if (!sauber) return Promise.resolve();
    return new Promise((resolve) => {
      const p = powershell(SPRECHEN, {
        JULIA_TEXT: Buffer.from(sauber, 'utf8').toString('base64'),
        JULIA_STIMME: stimme || '',
        JULIA_TEMPO: String(tempo),
        JULIA_KULTUR: sprachcode === 'en' ? 'en' : 'de',
      });
      this.sprechenProc = p;
      readline.createInterface({ input: p.stdout }).on('line', (z) => {
        if (!z.startsWith('V ')) return;
        const vis = Number(z.slice(2));
        this.emit('pegel', vis === 0 ? 0.08 : 0.45 + Math.random() * 0.55);
      });
      p.on('exit', () => {
        if (this.sprechenProc === p) this.sprechenProc = null;
        this.emit('pegel', 0);
        resolve();
      });
    });
  }

  stumm() {
    if (this.sprechenProc) {
      this.sprechenProc.kill();
      this.sprechenProc = null;
    }
  }

  stimmen() {
    return new Promise((resolve) => {
      const p = powershell(STIMMEN);
      let aus = '';
      p.stdout.on('data', (d) => { aus += d; });
      p.on('exit', () => {
        resolve(aus.split(/\r?\n/).filter(Boolean).map((z) => {
          const [kultur, name] = z.split('\t');
          return { kultur, name };
        }));
      });
    });
  }
}

module.exports = { Sprache, fuerSprache };
