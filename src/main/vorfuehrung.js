'use strict';

const fs = require('fs');
const path = require('path');
const { png } = require('./symbol');

// Vorführmodus für die README: füllt einen getrennten Datenordner mit
// Beispielwerten, zeigt ein Beispielgespräch und nimmt die Fenster auf.
// Start: JULIA_DATEN=<leerer Ordner> JULIA_SCREENSHOTS=<Zielordner> npm start

const warte = (ms) => new Promise((r) => setTimeout(r, ms));

const GESPRAECH = {
  de: [
    { typ: 'nutzer', text: 'Was mache ich hier gerade?' },
    { typ: 'werkzeug', name: 'screenshot', eingabe: '{}', ok: true },
    { typ: 'werkzeug', name: 'fenster_auflisten', eingabe: '{}', ok: true },
    { typ: 'julia', text: 'Zwei Fenster: VS Code mit `server.py` im Fokus, daneben Firefox mit der FastAPI-Doku. Im Terminal steht ein Traceback, `ModuleNotFoundError: uvicorn`. Soll ich das installieren?' },
    { typ: 'nutzer', text: 'ja, mach' },
    { typ: 'werkzeug', name: 'shell', eingabe: '{"befehl":"pip show uvicorn"}', ok: true },
    { typ: 'julia', text: 'Ist im venv des Projekts noch nicht da. Vorschlag: `uvicorn` 0.35 von PyPI, rund 60 KB, keine Dienste, kein Autostart, keine PATH-Änderung.' },
    { typ: 'freigabe', f: { id: 0, art: 'einzeln', werkzeug: 'shell', beschreibung: 'Shell: .venv\\Scripts\\pip install uvicorn', grund: 'Kategorie software', kategorie: 'software' } },
  ],
  en: [
    { typ: 'nutzer', text: 'What am I doing here?' },
    { typ: 'werkzeug', name: 'screenshot', eingabe: '{}', ok: true },
    { typ: 'werkzeug', name: 'fenster_auflisten', eingabe: '{}', ok: true },
    { typ: 'julia', text: 'Two windows: VS Code with `server.py` in focus, next to it Firefox with the FastAPI docs. The terminal shows a traceback, `ModuleNotFoundError: uvicorn`. Should I install it?' },
    { typ: 'nutzer', text: 'yes, go ahead' },
    { typ: 'werkzeug', name: 'shell', eingabe: '{"befehl":"pip show uvicorn"}', ok: true },
    { typ: 'julia', text: 'Not in the project venv yet. Suggestion: `uvicorn` 0.35 from PyPI, about 60 KB, no services, no autostart, no PATH change.' },
    { typ: 'freigabe', f: { id: 0, art: 'einzeln', werkzeug: 'shell', beschreibung: 'Shell: .venv\\Scripts\\pip install uvicorn', grund: 'category software', kategorie: 'software' } },
  ],
};

function geladen(fenster) {
  return new Promise((resolve) => {
    if (!fenster.webContents.isLoading()) resolve();
    else fenster.webContents.once('did-finish-load', resolve);
  });
}

// Nimmt das Fenster so auf, wie es auf dem Bildschirm aussieht – mit den
// Windows-Fensterknöpfen, die capturePage nicht mitzeichnet. Klappt das nicht,
// wird nur der Fensterinhalt aufgenommen.
async function aufnehmenFenster(fenster, datei, { mitRahmen = false } = {}) {
  if (mitRahmen) {
    try {
      const { desktopCapturer, screen } = require('electron');
      fenster.moveTop();
      fenster.focus();
      await warte(500);
      const grenzen = fenster.getBounds();
      const d = screen.getDisplayMatching(grenzen);
      const phys = screen.dipToScreenRect(null, d.bounds);
      const quellen = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: phys.width, height: phys.height } });
      const q = quellen.find((s) => s.display_id === String(d.id));
      if (q && !q.thumbnail.isEmpty()) {
        const f = d.scaleFactor;
        const aus = q.thumbnail.crop({
          x: Math.round((grenzen.x - d.bounds.x) * f),
          y: Math.round((grenzen.y - d.bounds.y) * f),
          width: Math.round(grenzen.width * f),
          height: Math.round(grenzen.height * f),
        });
        fs.writeFileSync(datei, aus.toPNG());
        return;
      }
    } catch { /* unten ohne Rahmen */ }
  }
  const bild = await fenster.webContents.capturePage();
  fs.writeFileSync(datei, bild.toPNG());
}

// Ausgedachte Gespräche für den Verlauf-Screenshot.
function beispielGespraeche(gespraeche, sc) {
  const anzeige = require('./anzeige');
  const en = sc === 'en';
  const n = (text) => [['nutzer', { text }]];
  let z = 0;
  const w = (name, eingabe = '{}') => { z += 1; return [['werkzeug', { id: `b${z}`, name, eingabe }], ['werkzeugFertig', { id: `b${z}`, ok: true }]]; };
  const j = (text) => [['text', { text }], ['fertig', {}]];
  const f = (beschreibung, grund) => { z += 1; return [['freigabe', { id: z, art: 'einzeln', beschreibung, grund }], ['freigabeErledigt', { id: z, ja: true }]]; };
  const liste = en ? [
    [5, [...n('How full is the disk?'), ...w('systemstatus'), ...j('C: is **82 %** full, 171 GB free. The biggest chunk is `Downloads` with 64 GB – want me to tidy up there?')]],
    [95, [...n('Tell Anna that Friday 2 pm works'), ...w('kontakte_suchen', '{"name":"Anna"}'), ...f('Send email\nTo: anna@example.com\nSubject: Re: Friday?\n\nWorks for me, see you Friday at 2 pm!', 'category message'), ...w('mail_senden'), ...j('✓ Done: reply sent to Anna.')]],
    [60 * 26, [...n('Install 7-Zip for me'), ...w('shell', '{"befehl":"winget list 7zip"}'), ...f('Shell: winget install 7zip.7zip', 'category software'), ...w('shell', '{"befehl":"winget install 7zip.7zip"}'), ...j('Installed – `7z` reports version 24.08.')]],
    [60 * 24 * 4, [...n('Remind me about the call at 3 pm'), ...w('erinnerung_setzen', '{"zeitpunkt":"15:00"}'), ...j('Will do – the reminder comes at 3:00 pm.')]],
  ] : [
    [5, [...n('Wie voll ist die Platte?'), ...w('systemstatus'), ...j('C: ist zu **82 %** voll, 171 GB frei. Der größte Brocken ist `Downloads` mit 64 GB – soll ich dort aufräumen?')]],
    [95, [...n('Sag Anna, dass Freitag 14 Uhr passt'), ...w('kontakte_suchen', '{"name":"Anna"}'), ...f('E-Mail senden\nAn: anna@example.com\nBetreff: Re: Freitag?\n\nPasst, bis Freitag um 14 Uhr!', 'Kategorie nachricht'), ...w('mail_senden'), ...j('✓ Erledigt: Zusage an Anna gesendet.')]],
    [60 * 26, [...n('Installier mir 7-Zip'), ...w('shell', '{"befehl":"winget list 7zip"}'), ...f('Shell: winget install 7zip.7zip', 'Kategorie software'), ...w('shell', '{"befehl":"winget install 7zip.7zip"}'), ...j('Installiert – `7z` meldet Version 24.08.')]],
    [60 * 24 * 4, [...n('Erinner mich um 15 Uhr an den Anruf'), ...w('erinnerung_setzen', '{"zeitpunkt":"15:00"}'), ...j('Mach ich – um 15:00 kommt die Erinnerung.')]],
  ];
  const jetzt = Date.now();
  for (const [minuten, schritte] of liste) {
    const v = [];
    for (const [art, d] of schritte) anzeige.anwenden(v, art, d);
    gespraeche.speichern({ id: gespraeche.neueId(), anzeige: v, verlauf: [], zeit: jetzt - minuten * 60000 });
  }
}

async function aufnehmen({ ziel, config, chatFenster, einstellungenOeffnen, zustandSetzen, orb, overlayZeigen, overlayVerstecken, gespraeche }) {
  fs.mkdirSync(ziel, { recursive: true });
  const sc = config.get('sprachcode');
  if (gespraeche && !gespraeche.liste().length) beispielGespraeche(gespraeche, sc);
  if (!config.get('nutzer.name')) config.set('nutzer.name', 'Philip');
  if (!config.get('arbeitsverzeichnisse').length) {
    config.set('arbeitsverzeichnisse', ['C:\\Users\\philip\\Projekte', 'C:\\Users\\philip\\Downloads']);
  }
  config.set('einrichtung_fertig', true);

  fs.writeFileSync(path.join(ziel, 'logo.png'), png(256));

  await geladen(chatFenster);
  chatFenster.show();
  chatFenster.webContents.send('ansicht', 'start');
  await warte(2200);
  await aufnehmenFenster(chatFenster, path.join(ziel, `start-${sc}.png`), { mitRahmen: true });
  if (gespraeche) {
    chatFenster.webContents.send('ansicht', 'verlauf');
    await warte(1800);
    await aufnehmenFenster(chatFenster, path.join(ziel, `verlauf-${sc}.png`), { mitRahmen: true });
  }
  chatFenster.webContents.send('demo', GESPRAECH[sc] || GESPRAECH.de);
  await warte(1200);
  await aufnehmenFenster(chatFenster, path.join(ziel, `chat-${sc}.png`), { mitRahmen: true });
  chatFenster.hide();

  if (overlayZeigen) {
    const o = overlayZeigen({ passiv: false });
    await geladen(o);
    await warte(500);
    o.webContents.send('demo', (GESPRAECH[sc] || GESPRAECH.de).slice(0, 4));
    await warte(1200);
    await aufnehmenFenster(o, path.join(ziel, `overlay-${sc}.png`));
    overlayVerstecken();
  }

  const einst = einstellungenOeffnen(false);
  await geladen(einst);
  einst.show();
  await warte(2500);
  await aufnehmenFenster(einst, path.join(ziel, `einstellungen-${sc}.png`), { mitRahmen: true });
  await einst.webContents.executeJavaScript("document.getElementById('kontoGoogle').closest('section').scrollIntoView({ block: 'start' })");
  await warte(500);
  await aufnehmenFenster(einst, path.join(ziel, `verbindungen-${sc}.png`), { mitRahmen: true });
  einst.destroy();

  if (sc === 'de') {
    config.set('blase.monitor', 0);
    config.set('blase.an', true);
    await warte(600);
    const o = orb();
    await geladen(o);
    for (const z of ['idle', 'listening', 'thinking', 'speaking']) {
      zustandSetzen(z);
      await warte(1600);
      await aufnehmenFenster(o, path.join(ziel, `blase-${z}.png`));
    }
    config.set('blase.an', false);
  }
}

// Beispiel-Tagesüberblick für die Screenshots – ausgedachte Termine und Mails.
function beispielUeberblick(config) {
  const en = config.get('sprachcode') === 'en';
  const heute = (h, m) => { const d = new Date(); d.setHours(h, m, 0, 0); return d; };
  const morgen = (h, m) => { const d = heute(h, m); d.setDate(d.getDate() + 1); return d; };
  const bis = (d, min) => new Date(d.getTime() + min * 60000).toISOString();
  const spaet = new Date().getHours() >= 17;
  const t = (d, titel, ort = '', min = 60) => ({ titel, start: d.toISOString(), ende: bis(d, min), ganztaegig: false, ort });
  const termine = en
    ? [t(heute(spaet ? 19 : 10, 0), 'Stand-up with the team', 'Teams'), t(heute(spaet ? 20 : 14, 30), 'Call with the garage'), t(heute(spaet ? 21 : 18, 30), 'Training', 'Gym'), t(morgen(9, 0), 'Dentist', 'Main Street 12')]
    : [t(heute(spaet ? 19 : 10, 0), 'Stand-up mit dem Team', 'Teams'), t(heute(spaet ? 20 : 14, 30), 'Anruf Werkstatt'), t(heute(spaet ? 21 : 18, 30), 'Training', 'Halle Süd'), t(morgen(9, 0), 'Zahnarzt', 'Hauptstraße 12')];
  const jetzt = Date.now();
  return {
    jetzt,
    nutzer: config.get('nutzer.name') || 'Philip',
    anbieter: 'Anthropic (Claude)',
    modell: config.get('modell'),
    erinnerungen: en
      ? [{ id: 'a', text: 'Pizza out of the oven', zeit: jetzt + 18 * 60000 }, { id: 'b', text: 'Call Mum back', zeit: jetzt + 150 * 60000 }]
      : [{ id: 'a', text: 'Pizza aus dem Ofen', zeit: jetzt + 18 * 60000 }, { id: 'b', text: 'Mama zurückrufen', zeit: jetzt + 150 * 60000 }],
    kosten: { usd: 0.42, anfragen: 17, limit: 10, lokal: false },
    termine: { daten: termine },
    mails: {
      daten: {
        anzahl: 3,
        mails: en
          ? [{ von: 'Anna Schmidt', betreff: 'Does Friday 2 pm work?' }, { von: 'Telekom', betreff: 'Your September invoice' }, { von: 'GitHub', betreff: '[julia-ai] Release v1.2.0' }]
          : [{ von: 'Anna Schmidt', betreff: 'Passt Freitag 14 Uhr?' }, { von: 'Telekom', betreff: 'Ihre Rechnung für September' }, { von: 'GitHub', betreff: '[julia-ai] Release v1.2.0' }],
      },
    },
    pc: {
      daten: {
        akku: { prozent: 84, am_netz: true },
        ram_gesamt_gb: 32,
        ram_frei_gb: 13.4,
        laufwerke: [{ laufwerk: 'C:', groesse_gb: 953.9, frei_gb: 171.2, frei_prozent: 18 }, { laufwerk: 'D:', groesse_gb: 1863, frei_gb: 1204, frei_prozent: 65 }],
      },
    },
  };
}

module.exports = { aufnehmen, GESPRAECH, beispielUeberblick };
