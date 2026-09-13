'use strict';

const path = require('path');
const { fileURLToPath } = require('url');

// Härtung nach der Electron-Sicherheitscheckliste
// (https://www.electronjs.org/docs/latest/tutorial/security):
// Nur Julias eigene Seiten dürfen mit dem Hauptprozess reden, Fenster laden
// nichts anderes, und nach außen gehen nur harmlose Links.

// Liegt die Seite im eigenen renderer-Ordner?
function vertrauenswuerdig(url, rendererOrdner) {
  try {
    const u = new URL(String(url));
    if (u.protocol !== 'file:') return false;
    const datei = path.resolve(fileURLToPath(u)).toLowerCase();
    const ordner = path.resolve(rendererOrdner).toLowerCase() + path.sep;
    return datei.startsWith(ordner);
  } catch {
    return false;
  }
}

// Links, die im Standardbrowser bzw. Mailprogramm aufgehen dürfen. Alles andere
// (file:, javascript:, ms-msdt:, search-ms: und sonstige Windows-Protokolle)
// wird blockiert – darüber liefen in der Vergangenheit echte Angriffe.
const ERLAUBTE_PROTOKOLLE = new Set(['https:', 'http:', 'mailto:']);

function externErlaubt(url) {
  try {
    return ERLAUBTE_PROTOKOLLE.has(new URL(String(url)).protocol);
  } catch {
    return false;
  }
}

// Umhüllt ipcMain so, dass Nachrichten von fremden Absendern ignoriert werden
// (Checkliste Punkt 17: "Validate the sender of all IPC messages").
function ipcAbsichern(ipcMain, rendererOrdner, beiAblehnung = () => {}) {
  const pruefen = (e, kanal) => {
    const url = e.senderFrame ? e.senderFrame.url : '';
    if (vertrauenswuerdig(url, rendererOrdner)) return true;
    beiAblehnung(kanal, url);
    return false;
  };
  return {
    handle(kanal, fn) {
      ipcMain.handle(kanal, (e, ...args) => {
        if (!pruefen(e, kanal)) throw new Error('Unbekannter Absender.');
        return fn(e, ...args);
      });
    },
    on(kanal, fn) {
      ipcMain.on(kanal, (e, ...args) => {
        if (pruefen(e, kanal)) fn(e, ...args);
      });
    },
  };
}

// Gilt für jedes Fenster und jede eingebettete Seite, die Electron anlegt.
function fensterHaerten(webContents, { rendererOrdner, oeffnen }) {
  webContents.on('will-navigate', (e, url) => {
    if (!vertrauenswuerdig(url, rendererOrdner)) e.preventDefault();
  });
  webContents.on('will-redirect', (e, url) => {
    if (!vertrauenswuerdig(url, rendererOrdner)) e.preventDefault();
  });
  webContents.on('will-attach-webview', (e) => e.preventDefault());
  webContents.setWindowOpenHandler(({ url }) => {
    if (externErlaubt(url)) oeffnen(url);
    return { action: 'deny' };
  });
}

module.exports = { vertrauenswuerdig, externErlaubt, ipcAbsichern, fensterHaerten, ERLAUBTE_PROTOKOLLE };
