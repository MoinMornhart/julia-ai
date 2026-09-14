'use strict';

const { execFile } = require('child_process');

// Windows kann Programmen das Mikrofon sperren (Einstellungen → Datenschutz →
// Mikrofon). Dann kommt nur Stille an: Julia hört zu und versteht nichts, ohne
// Fehlermeldung. Vier Schalter – der erste gesperrte zählt.

const BASIS = 'SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\microphone';
const SCHALTER = [
  ['richtlinie', 'HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\AppPrivacy', 'LetAppsAccessMicrophone'],
  ['geraet', `HKLM\\${BASIS}`, 'Value'],
  ['apps', `HKCU\\${BASIS}`, 'Value'],
  ['desktop', `HKCU\\${BASIS}\\NonPackaged`, 'Value'],
];

// Wert aus der Ausgabe von "reg query": "    Value    REG_SZ    Deny".
function regWert(ausgabe, name) {
  for (const z of String(ausgabe || '').split(/\r?\n/)) {
    const m = /^\s+(\S+)\s+REG_\w+\s+(.*?)\s*$/.exec(z);
    if (m && m[1].toLowerCase() === String(name).toLowerCase()) return m[2];
  }
  return null;
}

// werte: { richtlinie, geraet, apps, desktop } – fehlende Werte heißen "erlaubt".
function sperreFinden(werte) {
  const r = String(werte.richtlinie ?? '').trim();
  if (r === '2' || /^0x0*2$/i.test(r)) return 'richtlinie'; // 2 = Apps immer verweigern
  for (const k of ['geraet', 'apps', 'desktop']) if (/^deny$/i.test(String(werte[k] ?? '').trim())) return k;
  return null;
}

function regLesen(pfad, name) {
  return new Promise((resolve) => {
    execFile('reg', ['query', pfad, '/v', name], { windowsHide: true, timeout: 5000 }, (err, aus) => resolve(err ? null : regWert(aus, name)));
  });
}

async function pruefen(lesen = regLesen) {
  if (process.platform !== 'win32' && lesen === regLesen) return null;
  const werte = {};
  for (const [k, pfad, name] of SCHALTER) werte[k] = await lesen(pfad, name);
  return sperreFinden(werte);
}

module.exports = { pruefen, sperreFinden, regWert, SCHALTER };
