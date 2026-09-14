'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Lädt eine Datei und prüft sie gegen feste Größe und SHA-256-Summe. Erst wenn
// beides stimmt, liegt sie unter ihrem Namen – vorher heißt sie ".teil" und
// wird bei jedem Fehler gelöscht. Für Whisper-Modelle, Piper und Stimmen.
async function dateiLaden({ holen, url, ziel, groesse, sha256, signal, fortschritt = () => {} }) {
  const teil = `${ziel}.teil`;
  try {
    fs.mkdirSync(path.dirname(ziel), { recursive: true });
    const antwort = await holen(url, { signal, headers: { 'User-Agent': 'Julia-AI' } });
    if (!antwort.ok || !antwort.body) throw new Error(`Download fehlgeschlagen (${antwort.status}).`);
    const hash = crypto.createHash('sha256');
    const datei = fs.createWriteStream(teil);
    let n = 0;
    try {
      for await (const stueck of antwort.body) {
        const b = Buffer.from(stueck);
        n += b.length;
        if (n > groesse) throw new Error('Die Datei ist größer als erwartet – ich breche ab.');
        hash.update(b);
        if (!datei.write(b)) await new Promise((ok) => datei.once('drain', ok));
        fortschritt(n);
      }
    } finally {
      await new Promise((ok) => datei.end(ok));
    }
    if (n !== groesse || hash.digest('hex') !== sha256) throw new Error('Die Prüfsumme stimmt nicht – ich benutze die Datei nicht.');
    fs.renameSync(teil, ziel);
  } catch (e) {
    fs.rmSync(teil, { force: true });
    throw e;
  }
}

module.exports = { dateiLaden };
