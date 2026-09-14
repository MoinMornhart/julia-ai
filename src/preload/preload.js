'use strict';

const { contextBridge, ipcRenderer, webUtils } = require('electron');

// Die einzige Brücke zwischen Oberfläche und Hauptprozess. Die Fenster sehen
// nur diese Funktionen, kein Node und kein Dateisystem.

const KANAELE = [
  'agent:nutzer', 'agent:start', 'agent:text', 'agent:werkzeug', 'agent:werkzeugFertig',
  'agent:freigabe', 'agent:freigabeErledigt', 'agent:fertig', 'agent:fehler', 'agent:hinweis',
  'zustand', 'pegel', 'sprache:hoert', 'config:geaendert', 'texte:geaendert', 'chat:geleert', 'demo', 'overlay:modus', 'handy:status', 'ansicht', 'chat:laden', 'verlauf:geaendert', 'routinen:geaendert', 'auswahl:text', 'clips:geaendert', 'zugriff', 'mc:geaendert', 'mc:code', 'erinnerung', 'kosten',
];

contextBridge.exposeInMainWorld('julia', {
  texte: () => ipcRenderer.invoke('texte'),
  config: () => ipcRenderer.invoke('config:lesen'),
  setzen: (schluessel, wert) => ipcRenderer.invoke('config:setzen', schluessel, wert),
  alleFreigeben: (an) => ipcRenderer.invoke('freigabe:immer', !!an),
  fremdFreigeben: (an) => ipcRenderer.invoke('freigabe:fremd', !!an),
  schluesselSetzen: (s) => ipcRenderer.invoke('schluessel:setzen', s),
  anbieterSetzen: (id) => ipcRenderer.invoke('anbieter:setzen', id),
  modelleLaden: () => ipcRenderer.invoke('anbieter:modelle'),
  ordnerWaehlen: () => ipcRenderer.invoke('ordner:waehlen'),
  stimmen: () => ipcRenderer.invoke('stimmen'),
  audioGeraete: () => ipcRenderer.invoke('audio:geraete'),
  spracheTesten: () => ipcRenderer.invoke('sprache:testen'),
  kontenStatus: () => ipcRenderer.invoke('konten:status'),
  googleVerbinden: (daten) => ipcRenderer.invoke('konten:google:verbinden', daten),
  googleTrennen: () => ipcRenderer.invoke('konten:google:trennen'),
  kostenHeute: () => ipcRenderer.invoke('kosten:heute'),
  startUeberblick: (neu) => ipcRenderer.invoke('start:ueberblick', !!neu),
  verlaufListe: (suche) => ipcRenderer.invoke('verlauf:liste', String(suche || '')),
  verlaufLesen: (id) => ipcRenderer.invoke('verlauf:lesen', String(id)),
  verlaufFortsetzen: (id) => ipcRenderer.invoke('verlauf:fortsetzen', String(id)),
  verlaufLoeschen: (id) => ipcRenderer.invoke('verlauf:loeschen', String(id)),
  verlaufAlleLoeschen: () => ipcRenderer.invoke('verlauf:alle_loeschen'),
  codeUebersicht: () => ipcRenderer.invoke('code:uebersicht'),
  codeDetails: (p) => ipcRenderer.invoke('code:details', String(p)),
  codeDiff: (p, datei) => ipcRenderer.invoke('code:diff', String(p), String(datei)),
  codeHinzufuegen: () => ipcRenderer.invoke('code:hinzufuegen'),
  codeEntfernen: (p) => ipcRenderer.invoke('code:entfernen', String(p)),
  codeOeffnen: (p, wie) => ipcRenderer.invoke('code:oeffnen', String(p), String(wie || '')),
  clipsListe: () => ipcRenderer.invoke('clips:liste'),
  clipAufnehmen: () => ipcRenderer.invoke('clips:aufnehmen'),
  clipsOrdner: () => ipcRenderer.invoke('clips:ordner'),
  clipZeigen: (p) => ipcRenderer.invoke('clips:zeigen', String(p)),
  clipLoeschen: (p) => ipcRenderer.invoke('clips:loeschen', String(p)),
  clipUmbenennen: (p, name) => ipcRenderer.invoke('clips:umbenennen', String(p), String(name)),
  clipsWindows: () => ipcRenderer.invoke('clips:windows'),
  mcStatus: () => ipcRenderer.invoke('mc:status'),
  mcBeitreten: (d) => ipcRenderer.invoke('mc:beitreten', { adresse: String((d && d.adresse) || ''), spieler: String((d && d.spieler) || '') }),
  mcVerlassen: () => ipcRenderer.invoke('mc:verlassen'),
  mcAufgabe: (a) => ipcRenderer.invoke('mc:aufgabe', {
    aufgabe: String((a && a.aufgabe) || ''), block: a && a.block ? String(a.block) : undefined, anzahl: a && a.anzahl ? Number(a.anzahl) : undefined,
  }),
  mcChat: (text) => ipcRenderer.invoke('mc:chat', String(text || '')),
  mcKontoVerbinden: () => ipcRenderer.invoke('mc:konto:verbinden'),
  mcKontoAbmelden: () => ipcRenderer.invoke('mc:konto:abmelden'),
  routinenListe: () => ipcRenderer.invoke('routinen:liste'),
  routineSpeichern: (r) => ipcRenderer.invoke('routinen:speichern', r),
  routineLoeschen: (id) => ipcRenderer.invoke('routinen:loeschen', String(id)),
  routineStarten: (id) => ipcRenderer.invoke('routinen:starten', String(id)),
  handyStatus: () => ipcRenderer.invoke('handy:status'),
  handyKoppeln: () => ipcRenderer.invoke('handy:koppeln'),
  handyTrennen: () => ipcRenderer.invoke('handy:trennen'),
  einrichtungFertig: () => ipcRenderer.invoke('einrichtung:fertig'),
  status: () => ipcRenderer.invoke('chat:status'),
  senden: (text, pfade) => ipcRenderer.invoke('chat:senden', text, Array.isArray(pfade) ? pfade : []),
  // Pfad einer hineingezogenen Datei (Electron gibt ihn der Seite nicht direkt).
  dateiPfad: (datei) => { try { return webUtils.getPathForFile(datei) || ''; } catch { return ''; } },
  kopieren: (text) => ipcRenderer.invoke('zwischenablage:schreiben', String(text || '')),
  blaseMaus: (ueber) => ipcRenderer.send('blase:maus', !!ueber),
  blaseZiehen: (dx, dy) => ipcRenderer.send('blase:ziehen', Number(dx) || 0, Number(dy) || 0),
  blaseAbgelegt: () => ipcRenderer.send('blase:abgelegt'),
  blaseDoppelklick: () => ipcRenderer.send('blase:doppelklick'),
  blaseHoehe: (h) => ipcRenderer.send('blase:hoehe', Number(h) || 0),
  zugriffMaus: (ueber) => ipcRenderer.send('zugriff:maus', !!ueber),
  zugriffStopp: () => ipcRenderer.send('zugriff:stopp'),
  auswahlAktion: (aktion, frage) => ipcRenderer.invoke('auswahl:aktion', String(aktion), String(frage || '')),
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
