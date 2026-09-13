'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// Die einzige Brücke zwischen Oberfläche und Hauptprozess. Die Fenster sehen
// nur diese Funktionen, kein Node und kein Dateisystem.

const KANAELE = [
  'agent:nutzer', 'agent:start', 'agent:text', 'agent:werkzeug', 'agent:werkzeugFertig',
  'agent:freigabe', 'agent:freigabeErledigt', 'agent:fertig', 'agent:fehler', 'agent:hinweis',
  'zustand', 'pegel', 'sprache:hoert', 'config:geaendert', 'texte:geaendert', 'chat:geleert', 'demo', 'handy:status',
];

contextBridge.exposeInMainWorld('julia', {
  texte: () => ipcRenderer.invoke('texte'),
  config: () => ipcRenderer.invoke('config:lesen'),
  setzen: (schluessel, wert) => ipcRenderer.invoke('config:setzen', schluessel, wert),
  schluesselSetzen: (s) => ipcRenderer.invoke('schluessel:setzen', s),
  ordnerWaehlen: () => ipcRenderer.invoke('ordner:waehlen'),
  stimmen: () => ipcRenderer.invoke('stimmen'),
  kontenStatus: () => ipcRenderer.invoke('konten:status'),
  googleVerbinden: (daten) => ipcRenderer.invoke('konten:google:verbinden', daten),
  googleTrennen: () => ipcRenderer.invoke('konten:google:trennen'),
  handyStatus: () => ipcRenderer.invoke('handy:status'),
  handyVerbinden: (token) => ipcRenderer.invoke('handy:verbinden', token),
  handyTrennen: () => ipcRenderer.invoke('handy:trennen'),
  einrichtungFertig: () => ipcRenderer.invoke('einrichtung:fertig'),
  status: () => ipcRenderer.invoke('chat:status'),
  senden: (text) => ipcRenderer.invoke('chat:senden', text),
  abbrechen: () => ipcRenderer.send('chat:abbrechen'),
  neu: () => ipcRenderer.send('chat:neu'),
  sprechen: () => ipcRenderer.send('sprache:umschalten'),
  freigabe: (id, ja) => ipcRenderer.send('freigabe:antwort', { id, ja }),
  einstellungen: () => ipcRenderer.send('fenster:einstellungen'),
  schliessen: () => ipcRenderer.send('fenster:schliessen'),
  on: (kanal, rueckruf) => {
    if (!KANAELE.includes(kanal)) throw new Error(`Unbekannter Kanal ${kanal}`);
    const f = (_e, daten) => rueckruf(daten);
    ipcRenderer.on(kanal, f);
    return () => ipcRenderer.removeListener(kanal, f);
  },
});
