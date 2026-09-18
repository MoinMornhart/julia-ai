'use strict';

const fs = require('fs');
const path = require('path');
const { dateiLaden } = require('./laden');

// ffmpeg bei Bedarf laden (wie Whisper/Piper), statt ~80 MB in den Installer zu
// packen. Die Binary kommt aus dem geprüften ffmpeg-static-GitHub-Release und
// wird gegen feste Größe + SHA-256 abgesichert; erst dann liegt sie im
// Datenordner und Julia kann Videos schneiden – ohne dass der Nutzer selbst
// etwas installieren muss.

const FFMPEG = {
  url: 'https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1/ffmpeg-win32-x64',
  groesse: 82797568,
  sha256: '04e1307997530f9cf2fe35cba2ca7e8875ca91da02f89d6c7243df819c94ad00',
};

// Zielpfad der mitgeladenen ffmpeg-Binary im Datenordner.
function ffmpegZiel(datenOrdner) {
  return path.join(datenOrdner, 'ffmpeg', 'ffmpeg.exe');
}

// Ist die heruntergeladene Binary da? Gibt den Pfad zurück oder '' (fsx: Tests).
function heruntergeladen(datenOrdner, { fsx = fs } = {}) {
  const ziel = ffmpegZiel(datenOrdner);
  try { return fsx.existsSync(ziel) ? ziel : ''; } catch { return ''; }
}

// Besten ffmpeg-Pfad wählen: 1) vom Nutzer gesetzt (falls vorhanden),
// 2) heruntergeladen, 3) „ffmpeg" aus dem PATH als letzter Versuch.
function aufgeloest(datenOrdner, gesetzt, { fsx = fs } = {}) {
  try { if (gesetzt && fsx.existsSync(gesetzt)) return gesetzt; } catch { /* weiter */ }
  const dl = heruntergeladen(datenOrdner, { fsx });
  if (dl) return dl;
  return 'ffmpeg';
}

// „Bereit" = ffmpeg sicher nutzbar (gesetzt oder heruntergeladen). PATH-ffmpeg
// zählt hier NICHT als bereit, weil wir seine Existenz nicht sicher kennen.
function bereit(datenOrdner, gesetzt, { fsx = fs } = {}) {
  try { if (gesetzt && fsx.existsSync(gesetzt)) return true; } catch { /* weiter */ }
  return !!heruntergeladen(datenOrdner, { fsx });
}

// Lädt ffmpeg in den Datenordner (geprüft) und gibt den Zielpfad zurück.
async function herunterladen({ datenOrdner, holen, signal, fortschritt = () => {} }) {
  const ziel = ffmpegZiel(datenOrdner);
  await dateiLaden({ holen, url: FFMPEG.url, ziel, groesse: FFMPEG.groesse, sha256: FFMPEG.sha256, signal, fortschritt });
  return ziel;
}

module.exports = { FFMPEG, ffmpegZiel, heruntergeladen, aufgeloest, bereit, herunterladen };
