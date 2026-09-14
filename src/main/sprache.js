'use strict';

const os = require('os');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
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
# Für Whisper: genau den gesprochenen Ton als WAV-Datei ablegen.
function Ton($r) { if ($env:JULIA_WAV -and $r -and $r.Audio) { $fs = [System.IO.File]::Create($env:JULIA_WAV); try { $r.Audio.WriteToWaveStream($fs) } finally { $fs.Close() }; Aus 'W' } }
try {
  Add-Type -AssemblyName System.Speech
  $info = [System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers() | Where-Object { $_.Culture.Name -like ($env:JULIA_KULTUR + '*') } | Select-Object -First 1
  if (-not $info) { Aus 'E KEIN_ERKENNER'; exit 2 }
  $rec = New-Object System.Speech.Recognition.SpeechRecognitionEngine($info)
  $rec.LoadGrammar((New-Object System.Speech.Recognition.DictationGrammar))
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
  $rec.InitialSilenceTimeout = [TimeSpan]::FromSeconds(8)
  $rec.EndSilenceTimeout = [TimeSpan]::FromSeconds(1.0)
  $rec.EndSilenceTimeoutAmbiguous = [TimeSpan]::FromSeconds(1.5)
  $null = Register-ObjectEvent -InputObject $rec -EventName AudioLevelUpdated -SourceIdentifier pegel
  $null = Register-ObjectEvent -InputObject $rec -EventName SpeechRecognized -SourceIdentifier erkannt
  $null = Register-ObjectEvent -InputObject $rec -EventName SpeechRecognitionRejected -SourceIdentifier abgelehnt
  $null = Register-ObjectEvent -InputObject $rec -EventName RecognizeCompleted -SourceIdentifier fertig
  $rec.RecognizeAsync([System.Speech.Recognition.RecognizeMode]::Single)
  $text = ''
  $ende = $false
  while (-not $ende) {
    $e = Wait-Event -Timeout 30
    if (-not $e) { break }
    Remove-Event -EventIdentifier $e.EventIdentifier
    switch ($e.SourceIdentifier) {
      'pegel'     { Aus ('L ' + $e.SourceEventArgs.AudioLevel) }
      'erkannt'   { $text = $e.SourceEventArgs.Result.Text; Ton $e.SourceEventArgs.Result }
      'abgelehnt' { Ton $e.SourceEventArgs.Result }
      'fertig'    { $ende = $true }
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
# Eigener Lautsprecher gewählt: erst in den Speicher sprechen, dann dort abspielen.
$nr = -1
if ($env:JULIA_LAUTSPRECHER -and $env:JULIA_AUDIO_DLL) {
  try { Add-Type -Path $env:JULIA_AUDIO_DLL; $nr = [JuliaAudioGeraete]::AusgangNr($env:JULIA_LAUTSPRECHER) } catch { $nr = -1 }
}
if ($nr -ge 0) {
  $ms = New-Object System.IO.MemoryStream
  $s.SetOutputToWaveStream($ms)
  $s.Speak($text)
  [Console]::Out.WriteLine('P'); [Console]::Out.Flush()
  [JuliaLautsprecher]::Abspielen($ms.ToArray(), $nr)
  exit 0
}
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

const ERKENNER = `
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
Add-Type -AssemblyName System.Speech
[System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers() | ForEach-Object { [Console]::Out.WriteLine($_.Culture.Name) }
`;

// Für den Minecraft-Voice-Chat: Sprache aus einer Aufnahme erkennen …
const ERKENNEN_DATEI = `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
try {
  Add-Type -AssemblyName System.Speech
  $info = [System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers() | Where-Object { $_.Culture.Name -like ($env:JULIA_KULTUR + '*') } | Select-Object -First 1
  if (-not $info) { [Console]::Out.WriteLine('E KEIN_ERKENNER'); exit 2 }
  $rec = New-Object System.Speech.Recognition.SpeechRecognitionEngine($info)
  $rec.LoadGrammar((New-Object System.Speech.Recognition.DictationGrammar))
  $rec.SetInputToWaveFile($env:JULIA_DATEI)
  $teile = New-Object System.Collections.Generic.List[string]
  $null = Register-ObjectEvent -InputObject $rec -EventName SpeechRecognized -SourceIdentifier erkannt
  $null = Register-ObjectEvent -InputObject $rec -EventName RecognizeCompleted -SourceIdentifier fertig
  $rec.RecognizeAsync([System.Speech.Recognition.RecognizeMode]::Multiple)
  $ende = $false
  while (-not $ende) {
    $e = Wait-Event -Timeout 30
    if (-not $e) { break }
    Remove-Event -EventIdentifier $e.EventIdentifier
    if ($e.SourceIdentifier -eq 'erkannt') { $teile.Add($e.SourceEventArgs.Result.Text) } else { $ende = $true }
  }
  $rec.Dispose()
  [Console]::Out.WriteLine('T ' + ($teile -join ' '))
} catch {
  [Console]::Out.WriteLine('E ' + $_.Exception.Message)
}
`;

// … und Text als Aufnahme sprechen (48 kHz, mono, 16 Bit) statt über die Lautsprecher.
const SPRECHEN_DATEI = `
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
Add-Type -AssemblyName System.Speech
$text = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($env:JULIA_TEXT))
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
$stimmen = $s.GetInstalledVoices() | Where-Object { $_.Enabled } | ForEach-Object { $_.VoiceInfo }
$wahl = $stimmen | Where-Object { $_.Name -eq $env:JULIA_STIMME -and $_.Culture.Name -like ($env:JULIA_KULTUR + '*') } | Select-Object -First 1
if (-not $wahl) { $wahl = $stimmen | Where-Object { $_.Culture.Name -like ($env:JULIA_KULTUR + '*') } | Select-Object -First 1 }
if ($wahl) { $s.SelectVoice($wahl.Name) }
$s.Rate = [int]$env:JULIA_TEMPO
$format = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(48000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
$s.SetOutputToWaveFile($env:JULIA_DATEI, $format)
$s.Speak($text)
$s.SetOutputToNull()
$s.Dispose()
[Console]::Out.WriteLine('OK')
`;

function tempDatei(endung) {
  return path.join(os.tmpdir(), `julia-${crypto.randomBytes(6).toString('hex')}${endung}`);
}

// PowerShell-Skript laufen lassen, Ausgabezeilen einsammeln.
function ausfuehren(skript, env, zeitMs = 60000) {
  return new Promise((resolve) => {
    const p = powershell(skript, env);
    const zeilen = [];
    readline.createInterface({ input: p.stdout }).on('line', (z) => zeilen.push(z));
    const t = setTimeout(() => p.kill(), zeitMs);
    p.on('exit', () => { clearTimeout(t); resolve(zeilen); });
  });
}

// WAV mit 16-Bit-PCM, mono.
function wavBauen(pcm, rate) {
  const kopf = Buffer.alloc(44);
  kopf.write('RIFF', 0, 'ascii');
  kopf.writeUInt32LE(36 + pcm.length, 4);
  kopf.write('WAVE', 8, 'ascii');
  kopf.write('fmt ', 12, 'ascii');
  kopf.writeUInt32LE(16, 16);
  kopf.writeUInt16LE(1, 20);
  kopf.writeUInt16LE(1, 22);
  kopf.writeUInt32LE(rate, 24);
  kopf.writeUInt32LE(rate * 2, 28);
  kopf.writeUInt16LE(2, 32);
  kopf.writeUInt16LE(16, 34);
  kopf.write('data', 36, 'ascii');
  kopf.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([kopf, pcm]);
}

function wavLesen(buf) {
  if (buf.length < 12 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') throw new Error('Keine WAV-Datei.');
  let o = 12;
  let fmt = null;
  while (o + 8 <= buf.length) {
    const id = buf.toString('ascii', o, o + 4);
    const n = buf.readUInt32LE(o + 4);
    const inhalt = buf.subarray(o + 8, Math.min(buf.length, o + 8 + n));
    if (id === 'fmt ') fmt = { kanaele: inhalt.readUInt16LE(2), rate: inhalt.readUInt32LE(4), bits: inhalt.readUInt16LE(14) };
    if (id === 'data') {
      if (!fmt) throw new Error('WAV ohne Format.');
      return { ...fmt, pcm: Buffer.from(inhalt) };
    }
    o += 8 + n + (n % 2);
  }
  throw new Error('WAV ohne Daten.');
}

// 48 kHz → 16 kHz: je drei Werte mitteln (reicht für die Spracherkennung).
function herunter48auf16(pcm) {
  const n = Math.floor(pcm.length / 6);
  const out = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) {
    const a = pcm.readInt16LE(i * 6);
    const b = pcm.readInt16LE(i * 6 + 2);
    const c = pcm.readInt16LE(i * 6 + 4);
    out.writeInt16LE(Math.round((a + b + c) / 3), i * 2);
  }
  return out;
}

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
  // dll(): Pfad zur Audio-Hilfe (win/audio.cs) – nur nötig, wenn ein eigenes
  // Mikrofon oder ein eigener Lautsprecher gewählt ist.
  constructor({ dll } = {}) {
    super();
    this.dll = dll || (async () => '');
    this.hoeren = null;
    this.sprechenProc = null;
  }

  get hoertZu() { return !!this.hoeren; }
  get sprichtGerade() { return !!this.sprechenProc; }

  // Nimmt einen Satz auf. Liefert den erkannten Text ('' bei Stille oder Abbruch).
  // Fehlt das gewählte Mikrofon, hört Julia über das Windows-Standardgerät.
  // whisper(wav): schreibt den aufgenommenen Ton genauer auf; ohne bleibt es
  // beim Text der Windows-Erkennung.
  async zuhoeren(sprachcode = 'de', { mikrofon = '', whisper = null } = {}) {
    if (this.hoeren) return '';
    const kultur = sprachcode === 'en' ? 'en' : 'de';
    const dllPfad = mikrofon ? await this.dll().catch(() => '') : '';
    const wav = whisper ? tempDatei('.wav') : '';
    return new Promise((resolve, reject) => {
      const p = powershell(ERKENNEN, { JULIA_KULTUR: kultur, JULIA_MIKRO: mikrofon, JULIA_AUDIO_DLL: dllPfad, JULIA_WAV: wav });
      this.hoeren = p;
      this.emit('mikrofon', true);
      let text = '';
      let fehler = null;
      readline.createInterface({ input: p.stdout }).on('line', (z) => {
        if (z.startsWith('L ')) this.emit('pegel', Math.min(1, Number(z.slice(2)) / 100));
        else if (z.startsWith('T ')) text = z.slice(2).trim();
        else if (z.startsWith('E ')) fehler = z.slice(2).trim();
        else if (z.startsWith('H ')) this.emit('hinweis', z.slice(2).trim());
      });
      p.on('close', async () => {
        this.hoeren = null;
        this.emit('pegel', 0);
        this.emit('mikrofon', false);
        if (fehler && wav) fs.rmSync(wav, { force: true });
        if (fehler === 'KEIN_MIKROFON') {
          // Per Remotedesktop gibt es nur ein Mikrofon, wenn der Client es durchreicht.
          const rdp = /^RDP-/i.test(process.env.SESSIONNAME || '');
          reject(new Error(kultur === 'en'
            ? (rdp
              ? 'No microphone: you are connected via Remote Desktop and your microphone is not passed through. In the Remote Desktop client, open Local Resources → Remote audio → Settings, choose "Record from this computer" and reconnect.'
              : 'No microphone found. Please connect one or pick it as the default recording device in the Windows sound settings.')
            : (rdp
              ? 'Kein Mikrofon: Du bist per Remotedesktop verbunden, und dein Mikrofon wird nicht durchgereicht. Im Remotedesktop-Client unter „Lokale Ressourcen“ → „Remoteaudio“ → „Einstellungen“ die Option „Von diesem Computer aufzeichnen“ wählen und neu verbinden.'
              : 'Kein Mikrofon gefunden. Bitte eines anschließen oder in den Windows-Soundeinstellungen als Standard-Aufnahmegerät wählen.')));
        } else if (fehler === 'KEIN_ERKENNER') {
          reject(new Error(kultur === 'en'
            ? 'No English speech recognizer is installed. Add one under Windows Settings > Time & language > Speech.'
            : 'Für Deutsch ist keine Spracherkennung installiert. Unter Windows-Einstellungen > Zeit und Sprache > Spracherkennung nachrüsten.'));
        } else if (fehler) reject(new Error(fehler));
        else resolve((await this._whisperText(wav, whisper)).text ?? text);
      });
    });
  }

  zuhoerenAbbrechen() {
    if (this.hoeren) this.hoeren.kill();
  }

  // Mikrofon-Test in den Einstellungen: nimmt wie zuhoeren() einen Satz auf,
  // meldet aber zusätzlich den höchsten Pegel und alle Hinweise – so sieht
  // man, ob überhaupt Ton ankommt.
  async mikrofonTesten(sprachcode = 'de', { mikrofon = '', whisper = null } = {}) {
    if (this.hoeren) throw new Error('beschaeftigt');
    const kultur = sprachcode === 'en' ? 'en' : 'de';
    let dllFehler = '';
    const dllPfad = mikrofon ? await this.dll().catch((e) => { dllFehler = e.message; return ''; }) : '';
    const wav = whisper ? tempDatei('.wav') : '';
    const beginn = Date.now();
    return new Promise((resolve) => {
      const r = { pegel: 0, text: '', fehler: dllFehler ? `Audio-Hilfe: ${dllFehler}` : '', hinweise: [], sekunden: 0, windows: '', whisper: null };
      const p = powershell(ERKENNEN, { JULIA_KULTUR: kultur, JULIA_MIKRO: mikrofon, JULIA_AUDIO_DLL: dllPfad, JULIA_WAV: wav });
      this.hoeren = p;
      readline.createInterface({ input: p.stdout }).on('line', (z) => {
        if (z.startsWith('L ')) {
          const n = Number(z.slice(2));
          if (Number.isFinite(n)) r.pegel = Math.max(r.pegel, n);
          this.emit('pegel', Math.min(1, (n || 0) / 100));
        } else if (z.startsWith('T ')) r.text = z.slice(2).trim();
        else if (z.startsWith('E ')) r.fehler = z.slice(2).trim();
        else if (z.startsWith('H ')) r.hinweise.push(z.slice(2).trim());
      });
      let fertig = false;
      const ende = async () => {
        if (fertig) return;
        fertig = true;
        this.hoeren = null;
        this.emit('pegel', 0);
        r.sekunden = Math.round((Date.now() - beginn) / 100) / 10;
        r.windows = r.text;
        if (wav) {
          const w = await this._whisperText(wav, whisper);
          if (w.text !== null) r.text = w.text;
          if (w.text !== null || w.fehler) r.whisper = { sekunden: w.sekunden, fehler: w.fehler || '' };
        }
        resolve(r);
      };
      p.on('error', (e) => { r.fehler = r.fehler || e.message; ende(); });
      p.on('close', ende);
    });
  }

  // Whisper schreibt den abgelegten Ton auf. text: null heißt "nicht geklappt,
  // nimm den Windows-Text". Die WAV-Datei wird in jedem Fall gelöscht.
  async _whisperText(wav, whisper) {
    const beginn = Date.now();
    const dauer = () => Math.round((Date.now() - beginn) / 100) / 10;
    try {
      if (!wav || !whisper || !fs.existsSync(wav) || fs.statSync(wav).size <= 44) return { text: null };
      this.emit('schreibt', true);
      const t = await whisper(wav);
      return { text: typeof t === 'string' ? t : null, sekunden: dauer() };
    } catch (e) {
      this.emit('whisperFehler', e.message);
      return { text: null, fehler: e.message, sekunden: dauer() };
    } finally {
      this.emit('schreibt', false);
      if (wav) fs.rmSync(wav, { force: true });
    }
  }

  // Installierte Windows-Spracherkenner, z. B. ['de-DE', 'en-US'].
  erkenner() {
    return new Promise((resolve) => {
      const p = powershell(ERKENNER);
      let aus = '';
      p.stdout.on('data', (d) => { aus += d; });
      p.on('error', () => resolve([]));
      p.on('close', () => resolve(aus.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)));
    });
  }

  async sprechen(text, { stimme, tempo = 0, sprachcode = 'de', lautsprecher = '' } = {}) {
    this.stumm();
    const sauber = fuerSprache(text, sprachcode);
    if (!sauber) return;
    const dllPfad = lautsprecher ? await this.dll().catch(() => '') : '';
    await new Promise((resolve) => {
      const p = powershell(SPRECHEN, {
        JULIA_TEXT: Buffer.from(sauber, 'utf8').toString('base64'),
        JULIA_STIMME: stimme || '',
        JULIA_TEMPO: String(tempo),
        JULIA_KULTUR: sprachcode === 'en' ? 'en' : 'de',
        JULIA_LAUTSPRECHER: lautsprecher,
        JULIA_AUDIO_DLL: dllPfad,
      });
      this.sprechenProc = p;
      this.emit('lautsprecher', true);
      let wippen = null;
      readline.createInterface({ input: p.stdout }).on('line', (z) => {
        // Eigener Lautsprecher: keine Viseme während der Wiedergabe – die Blase wippt trotzdem.
        if (z === 'P') { wippen = setInterval(() => this.emit('pegel', 0.3 + Math.random() * 0.6), 130); return; }
        if (!z.startsWith('V ')) return;
        const vis = Number(z.slice(2));
        this.emit('pegel', vis === 0 ? 0.08 : 0.45 + Math.random() * 0.55);
      });
      p.on('exit', () => {
        clearInterval(wippen);
        if (this.sprechenProc === p) this.sprechenProc = null;
        this.emit('pegel', 0);
        this.emit('lautsprecher', false);
        resolve();
      });
    });
  }

  // Text als Audio (48 kHz, mono, 16 Bit) – für den Minecraft-Voice-Chat.
  async alsAudio(text, { stimme, tempo = 0, sprachcode = 'de' } = {}) {
    const sauber = fuerSprache(text, sprachcode);
    if (!sauber) return Buffer.alloc(0);
    const datei = tempDatei('.wav');
    try {
      await ausfuehren(SPRECHEN_DATEI, {
        JULIA_TEXT: Buffer.from(sauber, 'utf8').toString('base64'),
        JULIA_STIMME: stimme || '',
        JULIA_TEMPO: String(tempo),
        JULIA_KULTUR: sprachcode === 'en' ? 'en' : 'de',
        JULIA_DATEI: datei,
      });
      const w = wavLesen(fs.readFileSync(datei));
      return w.rate === 48000 && w.kanaele === 1 && w.bits === 16 ? w.pcm : Buffer.alloc(0);
    } catch {
      return Buffer.alloc(0);
    } finally {
      fs.rmSync(datei, { force: true });
    }
  }

  // Erkennt, was in einer Aufnahme (48 kHz, mono, 16 Bit) gesagt wurde –
  // etwa im Minecraft-Voice-Chat. Die Aufnahme liegt nur kurz als Temp-Datei.
  async erkennenAus(pcm48k, sprachcode = 'de', { whisper = null } = {}) {
    const datei = tempDatei('.wav');
    fs.writeFileSync(datei, wavBauen(herunter48auf16(pcm48k), 16000));
    try {
      if (whisper) {
        try {
          const t = await whisper(datei);
          if (typeof t === 'string') return t;
        } catch (e) {
          this.emit('whisperFehler', e.message);
        }
      }
      const zeilen = await ausfuehren(ERKENNEN_DATEI, { JULIA_KULTUR: sprachcode === 'en' ? 'en' : 'de', JULIA_DATEI: datei });
      const t = zeilen.find((z) => z.startsWith('T '));
      const e = zeilen.find((z) => z.startsWith('E '));
      if (!t && e) throw new Error(e.slice(2).trim());
      return t ? t.slice(2).trim() : '';
    } finally {
      fs.rmSync(datei, { force: true });
    }
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

module.exports = { Sprache, fuerSprache, wavBauen, wavLesen, herunter48auf16 };
