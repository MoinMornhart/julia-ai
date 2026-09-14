'use strict';

const { anbieterVon } = require('./anbieter/liste');

// Tagesüberblick für die Startseite: Termine, ungelesene Mails, Erinnerungen,
// PC-Zustand und Kosten. Jeder Teil darf einzeln scheitern (Google offline,
// PowerShell hängt) – die Seite zeigt dann den Rest. Von Mails gehen nur
// Absender und Betreff an die Oberfläche, kein Inhalt.

function mitZeit(versprechen, ms) {
  let timer;
  return Promise.race([
    versprechen,
    new Promise((_, nein) => { timer = setTimeout(() => nein(new Error('Zeitüberschreitung')), ms); }),
  ]).finally(() => clearTimeout(timer));
}

async function teil(f, ms) {
  try {
    return { daten: await mitZeit(Promise.resolve().then(f), ms) };
  } catch (e) {
    return { fehler: e.message };
  }
}

// "Anna Schmidt <anna@example.com>" → "Anna Schmidt"
function absender(von) {
  const s = String(von || '').trim();
  const m = /^"?([^"<]+?)"?\s*<[^>]+>$/.exec(s);
  return (m ? m[1] : s.replace(/^<|>$/g, '')).slice(0, 60);
}

async function ueberblick({ config, erinnerungen, kosten, konten, systemStatus, jetzt = Date.now() }) {
  const google = konten && konten.google && konten.google.verbunden ? konten.google : null;
  const [termine, mails, pc] = await Promise.all([
    google ? teil(async () => (await google.termine({ anzahl: 12 })).map((t) => ({
      titel: t.titel, start: t.start, ende: t.ende, ganztaegig: t.ganztaegig, ort: t.ort || '',
    })), 10000) : { aus: true },
    google ? teil(async () => {
      const r = await google.mailSuchen({ suche: 'is:unread in:inbox', anzahl: 4 });
      return { anzahl: r.gesamt_geschaetzt || r.mails.length, mails: r.mails.map((m) => ({ von: absender(m.von), betreff: String(m.betreff || '').slice(0, 120) })) };
    }, 10000) : { aus: true },
    systemStatus ? teil(() => systemStatus(), 15000) : { aus: true },
  ]);
  const a = anbieterVon(config);
  return {
    jetzt,
    nutzer: config.get('nutzer.name') || '',
    anbieter: a.name,
    modell: config.get('modell'),
    erinnerungen: (erinnerungen ? erinnerungen.alle() : []).slice(0, 5).map((e) => ({ id: e.id, text: e.text, zeit: e.zeit })),
    kosten: { ...(kosten ? kosten.heute() : { usd: 0, anfragen: 0 }), limit: Number(config.get('kosten.tageslimit_usd')) || 0, lokal: !!a.lokal },
    termine,
    mails,
    pc,
  };
}

module.exports = { ueberblick, absender };
