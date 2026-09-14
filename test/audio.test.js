'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

// Das gewählte Mikrofon (win/audio.cs) muss der Windows-Spracherkennung immer
// so viel Ton liefern, wie sie verlangt – eine kürzere Antwort hält sie für das
// Ende des Datenstroms und hört nicht mehr zu. Getestet ohne echtes Mikrofon:
// Die Warteschlange wird direkt mit drei 100-ms-Stücken gefüllt.

const SKRIPT = `
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition (Get-Content $env:JULIA_QUELLE -Raw -Encoding UTF8) -OutputAssembly $env:JULIA_DLL -OutputType Library
Add-Type -Path $env:JULIA_DLL
$t = [JuliaMikrofon]
$m = [System.Runtime.Serialization.FormatterServices]::GetUninitializedObject($t)
$q = New-Object 'System.Collections.Concurrent.BlockingCollection[byte[]]' 600
$t.GetField('schlange', [System.Reflection.BindingFlags]'NonPublic,Instance').SetValue($m, $q)
for ($i = 0; $i -lt 3; $i++) { $b = New-Object byte[] 3200; for ($j = 0; $j -lt 3200; $j++) { $b[$j] = [byte](($i * 7 + $j) % 251) }; [void]$q.TryAdd($b) }
$ziel = New-Object byte[] 8000
$n = $m.Read($ziel, 0, 8000)
$rest = New-Object byte[] 1600
$n2 = $m.Read($rest, 0, 1600)
@{ n = $n; a = [int]$ziel[0]; b = [int]$ziel[3200]; c = [int]$ziel[7999]; n2 = $n2; d = [int]$rest[1599] } | ConvertTo-Json -Compress
`;

test('Gewähltes Mikrofon liefert der Spracherkennung immer die volle Menge', { skip: process.platform !== 'win32' }, () => {
  const ordner = fs.mkdtempSync(path.join(os.tmpdir(), 'julia-audio-test-'));
  try {
    const aus = execFileSync('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', SKRIPT], {
      env: { ...process.env, JULIA_QUELLE: path.join(__dirname, '..', 'src', 'main', 'win', 'audio.cs'), JULIA_DLL: path.join(ordner, 'audio.dll') },
      encoding: 'utf8',
      windowsHide: true,
      timeout: 90000,
    });
    const r = JSON.parse(aus.trim().split(/\r?\n/).pop());
    assert.equal(r.n, 8000, 'eine Anfrage über mehrere Stücke hinweg wird ganz gefüllt');
    assert.deepEqual([r.a, r.b, r.c], [0, 7, (2 * 7 + 1599) % 251], 'in der richtigen Reihenfolge');
    assert.equal(r.n2, 1600);
    assert.equal(r.d, (2 * 7 + 3199) % 251, 'nichts geht verloren');
  } finally {
    fs.rmSync(ordner, { recursive: true, force: true });
  }
});
