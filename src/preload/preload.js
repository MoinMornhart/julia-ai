'use strict';

const { contextBridge, ipcRenderer, webUtils } = require('electron');

// Die einzige Brücke zwischen Oberfläche und Hauptprozess. Die Fenster sehen
// nur diese Funktionen, kein Node und kein Dateisystem.

const KANAELE = [
  'agent:nutzer', 'agent:start', 'agent:text', 'agent:werkzeug', 'agent:werkzeugFertig',
  'agent:freigabe', 'agent:freigabeErledigt', 'agent:fertig', 'agent:fehler', 'agent:hinweis',
  'zustand', 'pegel', 'sprache:hoert', 'config:geaendert', 'texte:geaendert', 'chat:geleert', 'demo', 'overlay:modus', 'handy:status', 'sync:status', 'ansicht', 'chat:laden', 'verlauf:geaendert', 'routinen:geaendert', 'auswahl:text', 'clips:geaendert', 'zugriff', 'mc:geaendert', 'mc:code', 'erinnerung', 'kosten', 'mikrotest', 'whisper:status', 'piper:status',
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
  mikrofonTest: () => ipcRenderer.invoke('sprache:mikrofontest'),
  whisperStatus: () => ipcRenderer.invoke('whisper:status'),
  whisperLaden: () => ipcRenderer.invoke('whisper:laden'),
  whisperAbbrechen: () => ipcRenderer.invoke('whisper:abbrechen'),
  piperStatus: () => ipcRenderer.invoke('piper:status'),
  piperLaden: () => ipcRenderer.invoke('piper:laden'),
  piperAbbrechen: () => ipcRenderer.invoke('piper:abbrechen'),
  kontenStatus: () => ipcRenderer.invoke('konten:status'),
  googleVerbinden: (daten) => ipcRenderer.invoke('konten:google:verbinden', daten),
  googleTrennen: () => ipcRenderer.invoke('konten:google:trennen'),
  outlookVerbinden: (daten) => ipcRenderer.invoke('konten:outlook:verbinden', { clientId: String((daten && daten.clientId) || '') }),
  outlookTrennen: () => ipcRenderer.invoke('konten:outlook:trennen'),
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
  mcAufgabe: (a) => {
    const d = a || {};
    const text = (v) => (v ? String(v).slice(0, 60) : undefined);
    const zahl = (v) => (v === undefined || v === null || v === '' ? undefined : Number(v));
    return ipcRenderer.invoke('mc:aufgabe', {
      aufgabe: String(d.aufgabe || ''), block: text(d.block), item: text(d.item), tier: text(d.tier),
      anzahl: d.anzahl ? Number(d.anzahl) : undefined, x: zahl(d.x), y: zahl(d.y), z: zahl(d.z),
    });
  },
  mcTrennungWeg: () => ipcRenderer.invoke('mc:trennungweg'),
  overlayVorschau: () => ipcRenderer.invoke('overlay:vorschau'),
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
  syncStatus: () => ipcRenderer.invoke('sync:status'),
  syncCode: () => ipcRenderer.invoke('sync:code'),
  syncBeitreten: (d) => ipcRenderer.invoke('sync:beitreten', { code: String((d && d.code) || ''), adresse: String((d && d.adresse) || '') }),
  syncEntfernen: (id) => ipcRenderer.invoke('sync:entfernen', String(id || '')),
  syncJetzt: () => ipcRenderer.invoke('sync:jetzt'),
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
  overlayMaus: (drin) => ipcRenderer.send('overlay:maus', !!drin),
  overlayAktivieren: () => ipcRenderer.send('overlay:aktivieren'),
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
