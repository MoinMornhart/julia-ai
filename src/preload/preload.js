'use strict';

const { contextBridge, ipcRenderer, webUtils } = require('electron');

// Die einzige Brücke zwischen Oberfläche und Hauptprozess. Die Fenster sehen
// nur diese Funktionen, kein Node und kein Dateisystem.

const KANAELE = [
  'agent:nutzer', 'agent:start', 'agent:text', 'agent:denken', 'agent:werkzeug', 'agent:werkzeugFertig',
  'agent:freigabe', 'agent:freigabeErledigt', 'agent:geheimnisFrage', 'agent:geheimnisErledigt', 'agent:fertig', 'agent:fehler', 'agent:hinweis',
  'zustand', 'pegel', 'sprache:hoert', 'sprache:teil', 'config:geaendert', 'texte:geaendert', 'chat:geleert', 'demo', 'overlay:modus', 'sync:status', 'appserver:status', 'ansicht', 'chat:laden', 'verlauf:geaendert', 'routinen:geaendert', 'auswahl:text', 'clips:geaendert', 'zugriff', 'mc:geaendert', 'mc:code', 'erinnerung', 'kosten', 'mikrotest', 'whisper:status', 'piper:status', 'mcp:status', 'system:zeile',
];

contextBridge.exposeInMainWorld('julia', {
  texte: () => ipcRenderer.invoke('texte'),
  config: () => ipcRenderer.invoke('config:lesen'),
  // Aufgefangene Startprobleme (z. B. hängender IPC) ins Start-Logbuch melden,
  // damit „UI bleibt leer" sichtbar wird, statt spurlos zu verschwinden.
  melden: (art, text) => fehlerMelden(String(art || 'melden'), text, '', 0),
  setzen: (schluessel, wert) => ipcRenderer.invoke('config:setzen', schluessel, wert),
  alleFreigeben: (an) => ipcRenderer.invoke('freigabe:immer', !!an),
  fremdFreigeben: (an) => ipcRenderer.invoke('freigabe:fremd', !!an),
  schluesselSetzen: (s) => ipcRenderer.invoke('schluessel:setzen', s),
  anbieterSetzen: (id) => ipcRenderer.invoke('anbieter:setzen', id),
  modelleLaden: () => ipcRenderer.invoke('anbieter:modelle'),
  werkzeuge: () => ipcRenderer.invoke('werkzeuge:liste'),
  boostStatus: () => ipcRenderer.invoke('boost:status'),
  boostProzesse: (sortierung) => ipcRenderer.invoke('boost:prozesse', String(sortierung || 'ram')),
  boostDoppelte: (pfad) => ipcRenderer.invoke('boost:doppelte', String(pfad || '')),
  boostBremsen: (pid, name, an) => ipcRenderer.invoke('boost:bremsen', Number(pid) || 0, String(name || ''), !!an),
  rollenLesen: () => ipcRenderer.invoke('rollen:lesen'),
  rollenSpeichern: (rollen, aktiv) => ipcRenderer.invoke('rollen:speichern', rollen, aktiv),
  geheimnisse: () => ipcRenderer.invoke('geheimnisse:liste'),
  geheimnisSetzen: (name, wert) => ipcRenderer.invoke('geheimnisse:setzen', String(name || ''), String(wert || '')),
  geheimnisLoeschen: (name) => ipcRenderer.invoke('geheimnisse:loeschen', String(name || '')),
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
  mcZiel: (text) => ipcRenderer.invoke('mc:ziel', String(text || '').slice(0, 1000)),
  mcZielStopp: () => ipcRenderer.invoke('mc:ziel:stopp'),
  mcGruppeBeitreten: (id, passwort, merken) => ipcRenderer.invoke('mc:gruppe:beitreten', String(id || ''), String(passwort || '').slice(0, 512), !!merken),
  mcGruppeVerlassen: () => ipcRenderer.invoke('mc:gruppe:verlassen'),
  mcGruppeVergessen: () => ipcRenderer.invoke('mc:gruppe:vergessen'),
  overlayVorschau: () => ipcRenderer.invoke('overlay:vorschau'),
  mcpStatus: () => ipcRenderer.invoke('mcp:status'),
  mcpHinzufuegen: (d) => {
    const x = d || {};
    const s = (v, max) => String(v || '').slice(0, max);
    return ipcRenderer.invoke('mcp:hinzufuegen', {
      name: s(x.name, 60), art: x.art === 'http' ? 'http' : 'stdio', befehl: s(x.befehl, 1000), url: s(x.url, 500), umgebung: s(x.umgebung, 8000), vertraut: x.vertraut === true,
    });
  },
  mcpEntfernen: (id) => ipcRenderer.invoke('mcp:entfernen', String(id || '')),
  mcpSchalten: (id, an) => ipcRenderer.invoke('mcp:schalten', String(id || ''), !!an),
  mcpNeu: (id) => ipcRenderer.invoke('mcp:neu', String(id || '')),
  vibeworksStatus: () => ipcRenderer.invoke('vibeworks:status'),
  vibeworksKonto: () => ipcRenderer.invoke('vibeworks:konto'),
  vibeworksAnmelden: (schluessel) => ipcRenderer.invoke('vibeworks:anmelden', String(schluessel || '')),
  vibeworksAbmelden: () => ipcRenderer.invoke('vibeworks:abmelden'),
  vibeworksGeraetStart: (basis) => ipcRenderer.invoke('vibeworks:geraetStart', String(basis || '')),
  vibeworksGeraetWarten: () => ipcRenderer.invoke('vibeworks:geraetWarten'),
  reparaturStatus: () => ipcRenderer.invoke('reparatur:status'),
  reparaturSoftware: (an) => ipcRenderer.invoke('reparatur:software', !!an),
  reparaturTreiber: (url) => ipcRenderer.invoke('reparatur:treiber', String(url || '')),
  mcChat: (text) => ipcRenderer.invoke('mc:chat', String(text || '')),
  mcKontoVerbinden: () => ipcRenderer.invoke('mc:konto:verbinden'),
  mcKontoAbmelden: () => ipcRenderer.invoke('mc:konto:abmelden'),
  routinenListe: () => ipcRenderer.invoke('routinen:liste'),
  routineSpeichern: (r) => ipcRenderer.invoke('routinen:speichern', r),
  routineLoeschen: (id) => ipcRenderer.invoke('routinen:loeschen', String(id)),
  routineStarten: (id) => ipcRenderer.invoke('routinen:starten', String(id)),
  syncStatus: () => ipcRenderer.invoke('sync:status'),
  syncCode: () => ipcRenderer.invoke('sync:code'),
  syncBeitreten: (d) => ipcRenderer.invoke('sync:beitreten', { code: String((d && d.code) || ''), adresse: String((d && d.adresse) || '') }),
  syncEntfernen: (id) => ipcRenderer.invoke('sync:entfernen', String(id || '')),
  syncJetzt: () => ipcRenderer.invoke('sync:jetzt'),
  jarvisSetzen: (an) => ipcRenderer.invoke('jarvis:setzen', !!an),
  appserverStatus: () => ipcRenderer.invoke('appserver:status'),
  appserverKoppeln: () => ipcRenderer.invoke('appserver:koppeln'),
  appserverTrennen: () => ipcRenderer.invoke('appserver:trennen'),
  appsStatus: () => ipcRenderer.invoke('apps:status'),
  appsVerbinden: (id, daten) => ipcRenderer.invoke('apps:verbinden', String(id || ''), daten || {}),
  appsTrennen: (welche) => ipcRenderer.invoke('apps:trennen', String(welche || '')),
  appsOeffnen: (welche) => ipcRenderer.invoke('apps:oeffnen', String(welche || '')),
  minecraftLogbuchOeffnen: () => ipcRenderer.invoke('minecraft:logbuchOeffnen'),
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
  // Antwort auf „KI fragt nach geheimem Wert": der Wert geht direkt an den
  // Hauptprozess (verschlüsselt abgelegt), nie über den Agenten/die KI.
  geheimnisEingabe: (daten) => ipcRenderer.send('geheimnis:eingabe', daten || {}),
  einstellungen: () => ipcRenderer.send('fenster:einstellungen'),
  schliessen: () => ipcRenderer.send('fenster:schliessen'),
  on: (kanal, rueckruf) => {
    if (!KANAELE.includes(kanal)) throw new Error(`Unbekannter Kanal ${kanal}`);
    const f = (_e, daten) => rueckruf(daten);
    ipcRenderer.on(kanal, f);
    return () => ipcRenderer.removeListener(kanal, f);
  },
});

// Fehlersystem: unbehandelte Fehler der Oberfläche ins Start-Logbuch melden,
// damit ein „UI lädt nicht" (Issue #3) sichtbar wird. Läuft in jedem Fenster.
function fehlerMelden(art, nachricht, quelle, zeile) {
  try {
    ipcRenderer.send('diagnose:rendererFehler', {
      art,
      nachricht: String(nachricht == null ? '' : (nachricht.message || nachricht)).slice(0, 500),
      quelle: String(quelle || '').slice(0, 200),
      zeile: Number(zeile) || 0,
      seite: (typeof location !== 'undefined' && location.pathname) || '',
    });
  } catch { /* Melden darf nie selbst stören */ }
}
if (typeof window !== 'undefined' && window.addEventListener) {
  window.addEventListener('error', (e) => fehlerMelden('fehler', e.error || e.message, e.filename, e.lineno));
  window.addEventListener('unhandledrejection', (e) => fehlerMelden('promise', e.reason, '', 0));

  // UI-Healthcheck (Issue #45): Manchmal startet ein Fenster, aber die Oberfläche
  // bleibt „leer"/unstyled (Knöpfe und Layout fehlen), weil das CSS nicht griff
  // oder der Inhalt nicht aufgebaut wurde. Kurz nach dem Laden prüfen wir, ob
  // überhaupt Stil (Stylesheets) und Inhalt (Elemente im Body) da sind. Ist die
  // Oberflaeche leer, wird das ins Logbuch gemeldet und EINMAL neu geladen
  // (Selbstheilung); klappt es dann immer noch nicht, nur melden – keine Schleife.
  //
  // WICHTIG (Issue #55/#3): erst NACH dem Start-Zeitlimit prüfen. Der Renderer
  // füllt die Beschriftungen zur Not per Ersatz (chat.js, ~8 s). Prüfte der
  // Healthcheck früher, meldete er fälschlich „leer" und die Selbstheilung
  // startete neu, BEVOR der Ersatz greifen konnte – eine Neustart-Schleife. Darum
  // deutlich später als das Init-Zeitlimit prüfen.
  window.addEventListener('load', () => {
    setTimeout(() => {
      let leer = false;
      let grund = '';
      try {
        const b = document.body;
        const ohneStil = !document.styleSheets || document.styleSheets.length === 0;
        const ohneInhalt = !b || b.childElementCount === 0;
        // Zusätzlich (Issue #26/#45): Das HTML ist zwar da, aber die Beschriftungen
        // werden erst per Skript gefüllt. Hängt der Start-IPC, bleiben alle
        // Navigations-Texte leer – für den Nutzer „keine Elemente", ohne Fehler.
        const beschriftet = document.querySelectorAll('[data-nav],[data-t]');
        const leereTexte = beschriftet.length > 0
          && [...beschriftet].every((el) => !el.textContent.trim());
        leer = ohneStil || ohneInhalt || leereTexte;
        grund = ohneStil ? 'ohne Stil (CSS fehlt)' : ohneInhalt ? 'ohne Inhalt (Body leer)' : leereTexte ? 'Beschriftungen leer – Start hing beim Laden' : '';
      } catch { leer = true; grund = 'Prüfung fehlgeschlagen'; }
      if (!leer) return;
      fehlerMelden('ui-healthcheck', `Oberfläche nach dem Laden leer – ${grund}`, '', 0);
      try {
        if (!sessionStorage.getItem('ui-neu-geladen')) {
          sessionStorage.setItem('ui-neu-geladen', '1');
          setTimeout(() => { try { location.reload(); } catch { /* egal */ } }, 400);
        }
      } catch { /* sessionStorage evtl. blockiert – dann nur melden */ }
    }, 11000);
  });
}
