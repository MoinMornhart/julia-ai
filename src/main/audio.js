'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

// Hilfsbibliothek für die Gerätewahl (win/audio.cs). Wird einmal kompiliert
// und als DLL im Temp-Ordner zwischengespeichert – so kostet die Wahl eines
// Mikrofons beim Sprechen keine zusätzliche Zeit. Der Quelltext geht als
// Umgebungsvariable an PowerShell, damit es auch aus app.asar heraus klappt.

const QUELLE = path.join(__dirname, 'win', 'audio.cs');
let dllVersprechen = null;

function kodiert(skript) {
  return Buffer.from(skript, 'utf16le').toString('base64');
}

function powershell(skript, env = {}) {
  return spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', kodiert(skript)], {
    windowsHide: true,
    env: { ...process.env, ...env },
  });
}

function ausfuehren(skript, env) {
  return new Promise((resolve, reject) => {
    const p = powershell(skript, env);
    let aus = '';
    let err = '';
    p.stdout.on('data', (d) => { aus += d; });
    p.stderr.on('data', (d) => { err += d; });
    p.on('error', reject);
    p.on('exit', (code) => (code === 0 ? resolve(aus) : reject(new Error(err.trim().slice(-400) || `PowerShell ${code}`))));
  });
}

const KOMPILIEREN = `
$ErrorActionPreference = 'Stop'
$quelle = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($env:JULIA_AUDIO_QUELLE))
Add-Type -TypeDefinition $quelle -OutputAssembly $env:JULIA_AUDIO_DLL -OutputType Library
`;

// Pfad zur fertigen DLL (kompiliert beim ersten Mal).
function dll() {
  if (!dllVersprechen) {
    dllVersprechen = (async () => {
      const quelle = fs.readFileSync(QUELLE, 'utf8');
      const hash = crypto.createHash('sha256').update(quelle).digest('hex').slice(0, 16);
      const ziel = path.join(os.tmpdir(), `julia-audio-${hash}.dll`);
      if (fs.existsSync(ziel)) return ziel;
      await ausfuehren(KOMPILIEREN, { JULIA_AUDIO_QUELLE: Buffer.from(quelle, 'utf8').toString('base64'), JULIA_AUDIO_DLL: ziel });
      if (!fs.existsSync(ziel)) throw new Error('Audio-Hilfe ließ sich nicht kompilieren.');
      return ziel;
    })().catch((e) => { dllVersprechen = null; throw e; });
  }
  return dllVersprechen;
}

const GERAETE = `
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
Add-Type -Path $env:JULIA_AUDIO_DLL
@{ ein = @([JuliaAudioGeraete]::Eingaenge()); aus = @([JuliaAudioGeraete]::Ausgaenge()) } | ConvertTo-Json -Compress
`;

async function geraete() {
  const pfad = await dll();
  const j = JSON.parse((await ausfuehren(GERAETE, { JULIA_AUDIO_DLL: pfad })).trim() || '{}');
  const liste = (x) => (Array.isArray(x) ? x : x ? [x] : []).map(String).filter(Boolean);
  return { eingaenge: liste(j.ein), ausgaenge: liste(j.aus) };
}

module.exports = { dll, geraete };
