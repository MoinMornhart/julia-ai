'use strict';

// Holt das Whisper-Programm (whisper.cpp) nach vendor/whisper:
//   node scripts/whisper-holen.js
// Lädt die feste Release-Datei, prüft die SHA-256-Summe und übernimmt nur,
// was Julia braucht. Die Visual-C++-Laufzeit kommt aus System32.

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const URL = 'https://github.com/ggml-org/whisper.cpp/releases/download/b5130/whisper-bin-x64.zip';
const SHA256 = 'f9ec6c52a2e949b62ab51fa21d0d497958f9e41c3010c157c4e42932d5316f3c';
const ZIEL = path.join(__dirname, '..', 'vendor', 'whisper');
const NOETIG = (name) => name === 'whisper-cli.exe' || name === 'whisper.dll' || /^ggml.*\.dll$/.test(name);
const LAUFZEIT = ['vcruntime140.dll', 'vcruntime140_1.dll', 'msvcp140.dll'];

async function main() {
  const r = await fetch(URL);
  if (!r.ok) throw new Error(`Download fehlgeschlagen (${r.status}).`);
  const zip = Buffer.from(await r.arrayBuffer());
  const summe = crypto.createHash('sha256').update(zip).digest('hex');
  if (summe !== SHA256) throw new Error(`Falsche Prüfsumme: ${summe}`);

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-'));
  try {
    fs.writeFileSync(path.join(tmp, 'w.zip'), zip);
    execFileSync('powershell.exe', ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${path.join(tmp, 'w.zip')}' -DestinationPath '${path.join(tmp, 'x')}' -Force`]);
    const quelle = path.join(tmp, 'x', 'Release');
    fs.mkdirSync(ZIEL, { recursive: true });
    for (const d of fs.readdirSync(quelle).filter(NOETIG)) fs.copyFileSync(path.join(quelle, d), path.join(ZIEL, d));
    for (const d of LAUFZEIT) fs.copyFileSync(path.join(process.env.WINDIR, 'System32', d), path.join(ZIEL, d));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log(`Whisper liegt in ${ZIEL}.`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
