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

async function aufnehmenFenster(fenster, datei) {
  const bild = await fenster.webContents.capturePage();
  fs.writeFileSync(datei, bild.toPNG());
}

async function aufnehmen({ ziel, config, chatFenster, einstellungenOeffnen, zustandSetzen, orb }) {
  fs.mkdirSync(ziel, { recursive: true });
  const sc = config.get('sprachcode');
  if (!config.get('nutzer.name')) config.set('nutzer.name', 'Philip');
  if (!config.get('arbeitsverzeichnisse').length) {
    config.set('arbeitsverzeichnisse', ['C:\\Users\\philip\\Projekte', 'C:\\Users\\philip\\Downloads']);
  }
  config.set('einrichtung_fertig', true);

  fs.writeFileSync(path.join(ziel, 'logo.png'), png(256));

  await geladen(chatFenster);
  chatFenster.show();
  chatFenster.webContents.send('demo', GESPRAECH[sc] || GESPRAECH.de);
  await warte(1200);
  await aufnehmenFenster(chatFenster, path.join(ziel, `chat-${sc}.png`));
  chatFenster.hide();

  const einst = einstellungenOeffnen(false);
  await geladen(einst);
  einst.show();
  await warte(2500);
  await aufnehmenFenster(einst, path.join(ziel, `einstellungen-${sc}.png`));
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

module.exports = { aufnehmen, GESPRAECH };
