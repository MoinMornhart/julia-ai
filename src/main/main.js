'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const {
  app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, dialog, Notification, safeStorage, screen, shell, session, nativeTheme, net, clipboard, nativeImage,
} = require('electron');
const sicherheit = require('./sicherheit');
const { Minecraft, kontoSpeicher, kontoAnmelden, adresseTeilen } = require('./minecraft');
const { Sync } = require('./sync');
const { phrasen: weckPhrasen } = require('./weckwort');
const { anredeEntfernen } = require('./minecraft-stimme');

// Datenordner außerhalb des Repos. JULIA_DATEN erlaubt einen getrennten Ordner
// (Tests, Screenshots), ohne die echte Konfiguration anzufassen.
const DATEN = process.env.JULIA_DATEN || path.join(app.getPath('appData'), 'Julia');
app.setPath('userData', path.join(DATEN, 'electron'));
// Die installierte Fassung muss dieselbe ID wie ihre Verknüpfung tragen, sonst
// zeigt Windows keine Meldungen an.
app.setAppUserModelId(app.isPackaged ? 'io.github.moinmornhart.julia' : 'Julia');
// Jede Seite läuft in der Chromium-Sandbox, auch wenn ein Fenster es vergäße.
app.enableSandbox();

const { Konfiguration } = require('./config');
const { Gedaechtnis } = require('./gedaechtnis');
const { Protokoll } = require('./protokoll');
const { Agent } = require('./agent');
const { Updater } = require('./updater');
const { InstallerUpdater } = require('./updater-installer');
const { Sprache } = require('./sprache');
const { Konten } = require('./konten');
const { Erinnerungen } = require('./erinnerungen');
const { Kosten } = require('./kosten');
const { Weckwort } = require('./weckwort');
const { HandyServer, qrMatrix } = require('./handy/server');
const { Gespraeche } = require('./gespraeche');
const routinenModul = require('./routinen');
const { anhaengeLesen } = require('./anhaenge');
const { Clips } = require('./clips');
const audio = require('./audio');
const { CodeProjekte } = require('./code');
const { pathToFileURL } = require('url');
const { fremd } = require('./hilfen');
const anzeige = require('./anzeige');
const anbieterListe = require('./anbieter/liste');
const { claudeFinden } = require('./anbieter/claude-code');
const { modelleLaden } = require('./anbieter/openai');
const prompt = require('./prompt');
const bildschirm = require('./bildschirm');
const win = require('./win/win');
const { trayBild, fensterBild } = require('./symbol');
const { t: tt, TEXTE } = require('../shared/texte');

const APP = app.getAppPath();
const RENDERER = path.join(__dirname, '..', 'renderer');
const PRELOAD = path.join(__dirname, '..', 'preload', 'preload.js');
const VORFUEHRUNG = process.env.JULIA_SCREENSHOTS || null;

let config;
let gedaechtnis;
let protokoll;
let agent;
let updater;
let sprache;
let konten;
let erinnerungen;
let weckwort;
let weckwortZuletzt = 0;
let handy = null;
let gespraeche = null;
let routinen = null;
let clips = null;
let minecraft = null;
let mcSpeicher = null;
let sync = null;
let code = null;
// Das laufende Gespräch in kompakter Form – wird nach jeder Antwort gespeichert.
let gespraech = { id: null, anzeige: [] };
let tray = null;
let chatFenster = null;
let orbFenster = null;
let einstFenster = null;
let overlayFenster = null;
let overlayPassiv = false;
let overlayTimer = null;
let beendenLaeuft = false;
let zustand = 'idle';
let promptCache = null;
let hoert = false;

const t = (k, w) => tt(config.get('sprachcode'), k, { name: assistentName(), ...w });

// Der Name, den der Nutzer seiner KI gegeben hat ("Julia" ist nur der Standard).
function assistentName() {
  return (config && config.get('assistent.name')) || 'Julia';
}

function version() {
  return JSON.parse(fs.readFileSync(path.join(APP, 'package.json'), 'utf8')).version;
}

// --- API-Schlüssel: mit Windows (DPAPI) verschlüsselt in der config.json ---

// Je Anbieter ein eigener Schlüssel; Anthropic behält sein altes Feld.
function apiSchluessel(id = config.get('anbieter')) {
  const a = anbieterListe.ANBIETER[id] || anbieterListe.ANBIETER.anthropic;
  const v = id === 'anthropic' ? config.get('api.schluessel_verschluesselt') : (config.get('api.je_anbieter') || {})[id];
  if (v && safeStorage.isEncryptionAvailable()) {
    try { return safeStorage.decryptString(Buffer.from(v, 'base64')); } catch { /* unlesbar, Umgebung versuchen */ }
  }
  return (a.umgebung && process.env[a.umgebung]) || '';
}

function schluesselSetzen(s) {
  const text = String(s || '').trim();
  if (!text) return;
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Die Windows-Verschlüsselung ist nicht verfügbar.');
  const verschluesselt = safeStorage.encryptString(text).toString('base64');
  const id = config.get('anbieter');
  if (id === 'anthropic') config.set('api.schluessel_verschluesselt', verschluesselt);
  else config.set('api.je_anbieter', { ...(config.get('api.je_anbieter') || {}), [id]: verschluesselt });
}

// Claude Code wird einmal gesucht; die Einstellungen suchen beim Öffnen neu.
let claudeCodeGefunden;
function claudeCodePfad(neu = false) {
  if (neu || claudeCodeGefunden === undefined) claudeCodeGefunden = claudeFinden();
  return claudeCodeGefunden;
}

// Kann Julia mit dem gewählten Anbieter loslegen?
function bereit() {
  const id = config.get('anbieter');
  if (id === 'claude-abo') return !!claudeCodePfad();
  if (id === 'eigen' && !config.get('anbieter_url')) return false;
  return !anbieterListe.brauchtSchluessel(id) || !!apiSchluessel(id);
}

// --- Prompt ---

function systemPromptText() {
  if (!promptCache) {
    promptCache = prompt.systemPrompt({
      sprachcode: config.get('sprachcode'),
      name: config.get('nutzer.name'),
      arbeitsverzeichnisse: config.get('arbeitsverzeichnisse'),
      assistent: config.get('assistent'),
      pronomen: config.get('nutzer.pronomen'),
      pronomenEigen: config.get('nutzer.pronomen_eigen'),
    });
  }
  return promptCache;
}

function laufzeitText() {
  const kanal = config.get('kanal');
  return prompt.laufzeitKontext({
    sprachcode: config.get('sprachcode'),
    kanal,
    version: version(),
    monitore: bildschirm.beschreibung(),
    gedaechtnis: gedaechtnis.alsText(),
    vorgemerkt: kanal !== 'auto' ? protokoll.vorgemerkt() : [],
    konten: konten.beschreibung(),
    minecraft: minecraft && minecraft.verbunden ? minecraft.status() : null,
  });
}

// --- Zustand und Nachrichten an alle Fenster ---

function anAlle(kanal, daten) {
  for (const w of [chatFenster, orbFenster, einstFenster, overlayFenster]) {
    if (w && !w.isDestroyed()) w.webContents.send(kanal, daten);
  }
  ereignisWeiterleiten(kanal, daten);
}

function zustandSetzen(z) {
  zustand = z;
  anAlle('zustand', z);
}

function oeffentlicheConfig() {
  const c = JSON.parse(JSON.stringify(config.get()));
  delete c.api;
  return {
    ...c,
    schluesselGesetzt: !!apiSchluessel(),
    bereit: bereit(),
    anbieterListe: anbieterListe.fuerOberflaeche({ claudeCode: !!claudeCodePfad() }),
    version: version(),
    monitore: bildschirm.beschreibung(),
  };
}

function texteFuerRenderer() {
  const sc = config.get('sprachcode');
  const name = assistentName();
  const texte = {};
  for (const [k, v] of Object.entries({ ...TEXTE.de, ...TEXTE[sc] })) texte[k] = v.split('{name}').join(name);
  return { sprachcode: sc, texte };
}

function melden(titel, text) {
  if (Notification.isSupported()) new Notification({ title: titel, body: text, icon: fensterBild() }).show();
}

// --- Fenster ---

// --- Design: Theme und Fensterrahmen ---

function hintergrund() {
  return nativeTheme.shouldUseDarkColors ? '#09090D' : '#F3F3F7';
}

// Die Fensterknöpfe (minimieren, schließen) zeichnet Windows über den eigenen Kopf.
function titelLeiste(hoehe) {
  return {
    color: nativeTheme.shouldUseDarkColors ? '#0B0B10' : '#F1F1F5',
    symbolColor: nativeTheme.shouldUseDarkColors ? '#E8E8F0' : '#22222C',
    height: hoehe,
  };
}

function fensterFarben() {
  for (const w of [chatFenster, einstFenster]) {
    if (!w || w.isDestroyed()) continue;
    w.setBackgroundColor(hintergrund());
    try { w.setTitleBarOverlay(titelLeiste(w.juliaKopfHoehe || 48)); } catch { /* ältere Windows-Versionen */ }
  }
}

function designAnwenden() {
  const modus = config.get('design.modus');
  nativeTheme.themeSource = modus === 'hell' ? 'light' : modus === 'system' ? 'system' : 'dark';
  fensterFarben();
}

function fensterOptionen(extra, kopfHoehe = 48) {
  return {
    icon: fensterBild(),
    show: false,
    autoHideMenuBar: true,
    backgroundColor: hintergrund(),
    titleBarStyle: 'hidden',
    titleBarOverlay: titelLeiste(kopfHoehe),
    webPreferences: { preload: PRELOAD, contextIsolation: true, nodeIntegration: false, sandbox: true },
    ...extra,
  };
}

// Das Hauptfenster: Seitenleiste mit Start und Chat. Schmal gezogen wird die
// Leiste zur Icon-Leiste, dann passt es auch neben ein Spiel oder eine IDE.
function chatFensterErstellen() {
  const wa = screen.getPrimaryDisplay().workArea;
  const breite = Math.min(1080, wa.width - 80);
  const hoehe = Math.min(740, wa.height - 60);
  chatFenster = new BrowserWindow(fensterOptionen({
    width: breite,
    height: hoehe,
    minWidth: 420,
    minHeight: 460,
    x: wa.x + Math.round((wa.width - breite) / 2),
    y: wa.y + Math.round((wa.height - hoehe) / 2),
    title: assistentName(),
  }, 50));
  chatFenster.juliaKopfHoehe = 50;
  chatFenster.loadFile(path.join(RENDERER, 'chat.html'));
  chatFenster.on('close', (e) => {
    if (!beendenLaeuft) {
      e.preventDefault();
      chatFenster.hide();
    }
  });
}

// ansicht: 'chat' (Hotkey, Sprache, Freigaben), 'start' oder null (so lassen).
function chatZeigen(ansicht = 'chat') {
  if (!chatFenster || chatFenster.isDestroyed()) chatFensterErstellen();
  if (chatFenster.isMinimized()) chatFenster.restore();
  if (ansicht) {
    const senden = () => chatFenster.webContents.send('ansicht', ansicht);
    if (chatFenster.webContents.isLoading()) chatFenster.webContents.once('did-finish-load', senden);
    else senden();
  }
  chatFenster.show();
  chatFenster.focus();
}

function chatUmschalten(ansicht = 'chat') {
  if (chatFenster && chatFenster.isVisible() && chatFenster.isFocused()) chatFenster.hide();
  else chatZeigen(ansicht);
}

// Startseite: kurz zwischengespeichert, damit nicht jeder Wechsel Gmail fragt.
let ueberblickZwischen = null;
async function startUeberblick(neu) {
  if (VORFUEHRUNG) return require('./vorfuehrung').beispielUeberblick(config);
  if (!neu && ueberblickZwischen && Date.now() - ueberblickZwischen.jetzt < 60000) return ueberblickZwischen;
  ueberblickZwischen = await require('./ueberblick').ueberblick({
    config, erinnerungen, kosten, konten, systemStatus: () => win.systemStatus(),
  });
  return ueberblickZwischen;
}

function einstellungenOeffnen(einrichtung = false) {
  if (einstFenster && !einstFenster.isDestroyed()) {
    einstFenster.show();
    einstFenster.focus();
    return einstFenster;
  }
  einstFenster = new BrowserWindow(fensterOptionen({
    width: 680,
    height: 820,
    minWidth: 520,
    minHeight: 500,
    title: t('einst.titel'),
  }, 64));
  einstFenster.juliaKopfHoehe = 64;
  einstFenster.loadFile(path.join(RENDERER, 'einstellungen.html'), { query: { einrichtung: einrichtung ? '1' : '0' } });
  einstFenster.once('ready-to-show', () => einstFenster.show());
  einstFenster.on('closed', () => { einstFenster = null; });
  return einstFenster;
}

// Die Blase: nur sichtbar, wenn blase.an gesetzt ist. Klicks gehen durch sie
// hindurch – nur auf der Kugel selbst greift die Maus: ziehen verschiebt sie,
// Doppelklick öffnet den Chat. Darunter auf Wunsch Untertitel.
const UNTERTITEL_HOEHE = 120;

function blaseGrenzen() {
  const b = config.get('blase');
  const ds = bildschirm.monitore();
  const d = ds[b.monitor] || ds[ds.length - 1];
  const wa = d.workArea;
  const s = Math.round(b.groesse / d.scaleFactor);
  const breite = b.untertitel ? Math.max(s, 340) : s;
  const hoehe = s + (b.untertitel ? UNTERTITEL_HOEHE : 0);
  const rand = 24;
  let x = b.ecke.endsWith('rechts') ? wa.x + wa.width - breite - rand : wa.x + rand;
  let y = b.ecke.startsWith('unten') ? wa.y + wa.height - hoehe - rand : wa.y + rand;
  // Selbst verschoben? Dann dorthin – solange die Stelle noch auf einem Bildschirm liegt.
  const p = b.position;
  if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) {
    const mitte = { x: p.x + breite / 2, y: p.y + s / 2 };
    const sichtbar = screen.getAllDisplays().some((m) => {
      const w = m.workArea;
      return mitte.x >= w.x && mitte.x <= w.x + w.width && mitte.y >= w.y && mitte.y <= w.y + w.height;
    });
    if (sichtbar) { x = p.x; y = p.y; }
  }
  return { x: Math.round(x), y: Math.round(y), width: breite, height: hoehe };
}

function blaseAktualisieren() {
  const b = config.get('blase');
  if (!b.an) {
    if (orbFenster && !orbFenster.isDestroyed()) orbFenster.destroy();
    orbFenster = null;
    return;
  }
  const grenzen = blaseGrenzen();

  if (!orbFenster || orbFenster.isDestroyed()) {
    orbFenster = new BrowserWindow({
      ...grenzen,
      transparent: true,
      frame: false,
      resizable: false,
      movable: true,
      minimizable: false,
      maximizable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      focusable: false,
      hasShadow: false,
      show: false,
      backgroundColor: '#00000000',
      webPreferences: { preload: PRELOAD, contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false },
    });
    // Durchklickbar, aber Mausbewegungen kommen an – so merkt die Seite, wann
    // der Zeiger über der Kugel ist, und schaltet nur dort die Maus ein.
    orbFenster.setIgnoreMouseEvents(true, { forward: true });
    orbFenster.setAlwaysOnTop(true, 'screen-saver');
    orbFenster.loadFile(path.join(RENDERER, 'blase.html'));
    orbFenster.once('ready-to-show', () => {
      orbFenster.showInactive();
      orbFenster.setBounds(grenzen);
    });
  } else {
    // Zweimal setzen: Beim Wechsel auf einen Monitor mit anderer Skalierung
    // stimmt die Größe erst im zweiten Anlauf.
    orbFenster.juliaText = UNTERTITEL_HOEHE;
    orbFenster.juliaHoch = 0;
    orbFenster.setBounds(grenzen);
    orbFenster.setBounds(grenzen);
  }
}

// --- Gaming-Overlay ---
// Kleines, halbtransparentes Chatfenster über Spielen (Fenster- oder randloses
// Vollbild; bei exklusivem Vollbild zeigt Windows keine Overlays).
// Aktiv: bekommt Fokus zum Tippen. Passiv: Klicks gehen durch, das Spiel
// behält den Fokus – für kurz eingeblendete Antworten auf Sprachbefehle.

function overlayGrenzen() {
  const o = config.get('overlay');
  const ds = bildschirm.monitore();
  const d = ds[o.monitor] || ds[0];
  const wa = d.workArea;
  const breite = 380;
  const hoehe = Math.min(560, wa.height - 48);
  const rand = 24;
  const x = o.ecke.endsWith('rechts') ? wa.x + wa.width - breite - rand : wa.x + rand;
  const y = o.ecke.startsWith('unten') ? wa.y + wa.height - hoehe - rand : wa.y + rand;
  return { x: Math.round(x), y: Math.round(y), width: breite, height: hoehe };
}

function overlayErstellen() {
  overlayFenster = new BrowserWindow({
    ...overlayGrenzen(),
    transparent: true,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    hasShadow: false,
    backgroundColor: '#00000000',
    title: assistentName(),
    icon: fensterBild(),
    webPreferences: { preload: PRELOAD, contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  overlayFenster.setAlwaysOnTop(true, 'screen-saver');
  overlayFenster.setOpacity(config.get('overlay.deckkraft'));
  overlayFenster.loadFile(path.join(RENDERER, 'chat.html'), { query: { overlay: '1' } });
  overlayFenster.on('close', (e) => {
    if (!beendenLaeuft) {
      e.preventDefault();
      overlayVerstecken();
    }
  });
  return overlayFenster;
}

function overlayZeigen({ passiv = false } = {}) {
  if (!overlayFenster || overlayFenster.isDestroyed()) overlayErstellen();
  clearTimeout(overlayTimer);
  overlayPassiv = passiv;
  const o = overlayFenster;
  o.setIgnoreMouseEvents(passiv);
  o.setFocusable(!passiv);
  const zeigen = () => {
    o.webContents.send('overlay:modus', passiv ? 'passiv' : 'aktiv');
    if (passiv) o.showInactive();
    else { o.show(); o.focus(); }
  };
  if (o.webContents.isLoading()) o.webContents.once('did-finish-load', zeigen);
  else zeigen();
  return o;
}

function overlayVerstecken() {
  clearTimeout(overlayTimer);
  if (overlayFenster && !overlayFenster.isDestroyed()) overlayFenster.hide();
}

function overlaySichtbar() {
  return !!overlayFenster && !overlayFenster.isDestroyed() && overlayFenster.isVisible();
}

function overlayUmschalten() {
  if (overlaySichtbar() && !overlayPassiv) overlayVerstecken();
  else overlayZeigen({ passiv: false });
}

function overlaySpaeterVerstecken(ms = 12000) {
  clearTimeout(overlayTimer);
  overlayTimer = setTimeout(() => { if (overlayPassiv) overlayVerstecken(); }, ms);
}

// --- Tray, Hotkeys, Autostart ---

function trayMenue() {
  const menue = Menu.buildFromTemplate([
    { label: t('tray.chat'), click: chatZeigen },
    { label: `${t('tray.sprechen')}   (${config.get('hotkey.sprechen')})`, click: sprachUmschalten },
    { label: `${t('tray.overlay')}   (${config.get('hotkey.overlay') || '–'})`, click: overlayUmschalten },
    { type: 'separator' },
    { label: t('tray.blase'), type: 'checkbox', checked: config.get('blase.an'), click: (m) => config.set('blase.an', m.checked) },
    { label: t('tray.weckwort'), type: 'checkbox', checked: config.get('weckwort.an'), click: (m) => config.set('weckwort.an', m.checked) },
    { label: t('tray.neu'), click: () => { agent.neu(); anAlle('chat:geleert'); } },
    { label: t('tray.einstellungen'), click: () => einstellungenOeffnen(false) },
    { type: 'separator' },
    { label: t('tray.updates'), click: updatesManuell },
    { label: t('tray.protokoll'), click: () => shell.openPath(DATEN) },
    { type: 'separator' },
    { label: `${t('tray.beenden')}  ·  v${version()}`, click: () => { beendenLaeuft = true; app.quit(); } },
  ]);
  tray.setContextMenu(menue);
  // Sichtbar machen, wenn das Mikrofon auf das Aktivierungswort lauscht.
  tray.setToolTip(config.get('weckwort.an') ? t('tray.tooltip_weckwort') : `${t('tray.tooltip')} ${version()}`);
}

function hotkeysRegistrieren() {
  globalShortcut.unregisterAll();
  const paare = [[config.get('hotkey.sprechen'), sprachUmschalten], [config.get('hotkey.chat'), chatUmschalten]];
  if (config.get('hotkey.overlay')) paare.push([config.get('hotkey.overlay'), overlayUmschalten]);
  if (config.get('hotkey.auswahl')) paare.push([config.get('hotkey.auswahl'), () => { auswahlHolen().catch(() => {}); }]);
  if (config.get('hotkey.clip')) paare.push([config.get('hotkey.clip'), () => { clipJetzt(); }]);
  for (const [taste, aktion] of paare) {
    let ok = false;
    try { ok = globalShortcut.register(taste, aktion); } catch { ok = false; }
    if (!ok) melden(assistentName(),t('hotkey.fehler', { hotkey: taste }));
  }
}

function autostartSetzen() {
  app.setLoginItemSettings({
    openAtLogin: !!config.get('autostart'),
    path: process.execPath,
    args: app.isPackaged ? ['--versteckt'] : [APP, '--versteckt'],
  });
}

// --- Gespräch und Sprache ---

// Bilder für Anhänge: verkleinert und neu kodiert – dabei fallen Metadaten
// wie GPS-Koordinaten weg.
async function bildLesen(pfad) {
  let bild = nativeImage.createFromPath(pfad);
  if (bild.isEmpty()) throw new Error('Bild nicht lesbar');
  const { width, height } = bild.getSize();
  const faktor = Math.min(1, 1600 / Math.max(width, height));
  if (faktor < 1) bild = bild.resize({ width: Math.round(width * faktor), height: Math.round(height * faktor), quality: 'best' });
  const g = bild.getSize();
  return { jpeg: bild.toJPEG(85).toString('base64'), breite: g.width, hoehe: g.height };
}

// pfade: angehängte Dateien; bloecke: fertige Inhalte (markierter Text);
// anzeige: was im Chat als deine Nachricht steht, wenn es vom Auftrag abweicht.
async function nachrichtSenden(text, perSprache, { pfade = [], bloecke = [], anzeige = null, anzeigeAnhaenge = [] } = {}) {
  let sauber = String(text || '').trim();
  if (!sauber && !pfade.length) return;
  if (!sauber) sauber = t('chat.nur_dateien');
  sprache.stumm();
  const a = pfade.length
    ? await anhaengeLesen(pfade, { anbieterArt: anbieterListe.anbieterVon(config).art, bildLesen, sc: config.get('sprachcode') })
    : { bloecke: [], namen: [] };
  anAlle('agent:nutzer', { text: anzeige || sauber, perSprache, anhaenge: [...anzeigeAnhaenge, ...a.namen] });
  let antwort = null;
  try {
    antwort = await agent.senden(sauber, { perSprache, anhaenge: [...a.bloecke, ...bloecke] });
  } catch (e) {
    if (e.message === 'BESCHAEFTIGT') anAlle('agent:hinweis', { art: 'beschaeftigt' });
    else anAlle('agent:fehler', { art: 'text', text: e.message });
    return;
  }
  const modus = config.get('sprache.vorlesen');
  if (antwort && (modus === 'immer' || (modus === 'bei-sprache' && perSprache))) {
    zustandSetzen('speaking');
    await sprache.sprechen(antwort, {
      stimme: config.get('sprache.stimme'),
      tempo: config.get('sprache.tempo'),
      sprachcode: config.get('sprachcode'),
      lautsprecher: config.get('sprache.lautsprecher'),
    });
    if (zustand === 'speaking') zustandSetzen('idle');
  }
}

async function sprachUmschalten() {
  if (sprache.hoertZu) { sprache.zuhoerenAbbrechen(); return; }
  if (sprache.sprichtGerade) { sprache.stumm(); zustandSetzen('idle'); return; }
  if (agent.beschaeftigt) { anAlle('agent:hinweis', { art: 'beschaeftigt' }); return; }
  hoert = true;
  zustandSetzen('listening');
  anAlle('sprache:hoert', true);
  let text = '';
  try {
    text = await sprache.zuhoeren(config.get('sprachcode'), { mikrofon: config.get('sprache.mikrofon') });
  } catch (e) {
    chatZeigen();
    anAlle('agent:fehler', { art: 'text', text: e.message });
  } finally {
    hoert = false;
    anAlle('sprache:hoert', false);
    if (zustand === 'listening') zustandSetzen('idle');
  }
  if (text) {
    // Beim Spielen: Antwort passiv einblenden, ohne dem Spiel den Fokus zu nehmen.
    const hud = config.get('overlay.bei_antwort') === 'passiv' && !(overlaySichtbar() && !overlayPassiv);
    if (hud) overlayZeigen({ passiv: true });
    await nachrichtSenden(text, true);
    if (hud) overlaySpaeterVerstecken();
  }
}

// --- Updates ---

async function updatesManuell() {
  const r = await updater.pruefen();
  if (r.fehler) {
    dialog.showMessageBox({ type: 'warning', title: t('update.titel'), message: t('update.fehler', { fehler: r.fehler }) });
    return;
  }
  if (!r.neu) {
    dialog.showMessageBox({ type: 'info', title: t('update.titel'), message: t('update.aktuell', { version: r.aktuell }) });
    return;
  }
  const { response } = await dialog.showMessageBox({
    type: 'question',
    title: t('update.titel'),
    message: t('update.neu', { neu: r.neu, alt: r.aktuell }),
    detail: [...r.zeilen, '', t('update.frage')].join('\n'),
    buttons: [t('update.einspielen'), t('update.spaeter')],
    defaultId: 0,
    cancelId: 1,
  });
  if (response !== 0) return;
  const sofort = updater.nachAufgabeEinspielen(r.neu);
  if (!sofort) melden(t('update.titel'), t('update.wartet'));
}

async function updatesBeimStart() {
  if (!config.get('update.pruefen')) return;
  const r = await updater.pruefen();
  if (r.fehler || !r.neu) return;
  if (config.get('update.automatisch')) updater.nachAufgabeEinspielen(r.neu);
  else melden(t('update.titel'), t('update.verfuegbar_hinweis', { version: r.neu }));
}

// --- IPC ---

function ipcEinrichten() {
  const ipc = sicherheit.ipcAbsichern(ipcMain, RENDERER, (kanal, url) => {
    protokoll.eintragen({ werkzeug: 'ipc', stufe: 'ROT', ergebnis: 'abgelehnt', grund: `Nachricht auf ${kanal} von fremder Seite ${url}` });
  });
  ipc.handle('texte', () => texteFuerRenderer());
  ipc.handle('config:lesen', () => {
    claudeCodePfad(true); // vielleicht inzwischen installiert
    return oeffentlicheConfig();
  });
  ipc.handle('config:setzen', (_e, schluessel, wert) => {
    if (/^(api|freigabe)\.|^minecraft\.konto$/.test(String(schluessel))) return { fehler: 'Nicht erlaubt.' };
    try { return { wert: config.set(schluessel, wert) }; } catch (e) { return { fehler: e.message }; }
  });
  // "Allem zustimmen" (und "auch nach fremden Inhalten") lassen sich nur hier
  // einschalten – nach einem Ja im Windows-Dialog. Julia selbst kann es nicht
  // (einstellung_setzen: ROT).
  const freigabeSchalter = (schluessel, texte) => async (_e, an) => {
    if (an) {
      const opts = {
        type: 'warning', buttons: [t(`${texte}.ja`), t('freigabe.nein')], defaultId: 1, cancelId: 1, noLink: true,
        title: t(`${texte}.titel`), message: t(`${texte}.frage`), detail: t(`${texte}.details`),
      };
      const r = einstFenster && !einstFenster.isDestroyed() ? await dialog.showMessageBox(einstFenster, opts) : await dialog.showMessageBox(opts);
      if (r.response !== 0) return { wert: config.get(schluessel) };
    }
    return { wert: config.set(schluessel, !!an) };
  };
  ipc.handle('freigabe:immer', freigabeSchalter('freigabe.immer', 'freigabe'));
  ipc.handle('freigabe:fremd', freigabeSchalter('freigabe.fremd', 'freigabe_fremd'));
  ipc.handle('schluessel:setzen', (_e, s) => {
    try { schluesselSetzen(s); return { ok: true }; } catch (e) { return { fehler: e.message }; }
  });
  ipc.handle('anbieter:setzen', (_e, id) => {
    try {
      if (id === 'claude-abo' && !claudeCodePfad(true)) throw new Error(t('einst.fehlt_claude'));
      const alt = config.get('anbieter');
      config.set('anbieter', id);
      // Beim Wechsel das Standardmodell des neuen Anbieters vorschlagen.
      const vorschlag = anbieterListe.ANBIETER[id].modell;
      if (id !== alt && vorschlag) config.set('modell', vorschlag);
      return { config: oeffentlicheConfig() };
    } catch (e) {
      return { fehler: e.message, config: oeffentlicheConfig() };
    }
  });
  ipc.handle('anbieter:modelle', async () => {
    const a = anbieterListe.anbieterVon(config);
    if (a.art !== 'openai') return { modelle: a.modelle };
    try {
      if (!a.url) throw new Error(t('einst.fehlt_url'));
      return { modelle: await modelleLaden({ url: a.url, schluessel: apiSchluessel(a.id) }) };
    } catch (e) {
      return { fehler: e.message };
    }
  });
  ipc.handle('ordner:waehlen', async () => {
    const r = await dialog.showOpenDialog(einstFenster || undefined, { properties: ['openDirectory'] });
    return r.canceled ? null : r.filePaths[0];
  });
  ipc.handle('stimmen', () => sprache.stimmen());
  ipc.handle('audio:geraete', async () => {
    try { return await audio.geraete(); } catch (e) { return { eingaenge: [], ausgaenge: [], fehler: e.message }; }
  });
  ipc.handle('sprache:testen', async () => {
    await sprache.sprechen(t('einst.test_satz'), {
      stimme: config.get('sprache.stimme'),
      tempo: config.get('sprache.tempo'),
      sprachcode: config.get('sprachcode'),
      lautsprecher: config.get('sprache.lautsprecher'),
    });
    return true;
  });
  ipc.handle('konten:status', () => konten.status());
  ipc.handle('konten:google:verbinden', async (_e, daten) => {
    try {
      await konten.google.verbinden(daten || {});
      return { status: konten.status() };
    } catch (e) {
      return { fehler: e.message, status: konten.status() };
    } finally {
      if (einstFenster && !einstFenster.isDestroyed()) einstFenster.focus();
    }
  });
  ipc.handle('kosten:heute', () => agent.ctx.kosten.heute());
  ipc.handle('konten:outlook:verbinden', async (_e, daten) => {
    try {
      await konten.outlook.verbinden(daten || {});
      return { status: konten.status() };
    } catch (e) {
      return { fehler: e.message, status: konten.status() };
    }
  });
  ipc.handle('konten:outlook:trennen', async () => {
    try {
      await konten.outlook.trennen();
      return { status: konten.status() };
    } catch (e) {
      return { fehler: e.message, status: konten.status() };
    }
  });
  ipc.handle('konten:google:trennen', async () => {
    try {
      await konten.google.trennen();
      return { status: konten.status() };
    } catch (e) {
      return { fehler: e.message, status: konten.status() };
    }
  });
  ipc.handle('einrichtung:fertig', () => {
    config.set('einrichtung_fertig', true);
    if (einstFenster) einstFenster.close();
    chatZeigen();
    return true;
  });
  ipc.handle('chat:status', () => ({
    beschaeftigt: agent.beschaeftigt,
    zustand,
    hoert,
    hotkey: config.get('hotkey.sprechen'),
  }));
  ipc.handle('chat:senden', (_e, text, pfade) => {
    const liste = Array.isArray(pfade) ? pfade.filter((p) => typeof p === 'string').slice(0, 10) : [];
    nachrichtSenden(text, false, { pfade: liste }).catch((e) => anAlle('agent:fehler', { art: 'text', text: e.message }));
    return true;
  });
  // Blase: Maus nur über der Kugel, verschieben, ablegen, Doppelklick.
  const blaseDa = () => orbFenster && !orbFenster.isDestroyed();
  ipc.on('blase:maus', (_e, ueber) => { if (blaseDa()) orbFenster.setIgnoreMouseEvents(!ueber, { forward: true }); });
  ipc.on('blase:ziehen', (_e, dx, dy) => {
    if (!blaseDa()) return;
    const [x, y] = orbFenster.getPosition();
    const d = (v) => Math.max(-3000, Math.min(3000, Math.round(Number(v) || 0)));
    orbFenster.juliaHoch = 0; // selbst verschoben: das ist jetzt der Platz der Blase
    orbFenster.setPosition(x + d(dx), y + d(dy));
  });
  ipc.on('blase:abgelegt', () => {
    if (!blaseDa()) return;
    const [x, y] = orbFenster.getPosition();
    config.set('blase.position', { x, y });
  });
  ipc.on('blase:doppelklick', () => chatZeigen('chat'));
  ipc.on('zugriff:maus', (e, ueber) => {
    const f = BrowserWindow.fromWebContents(e.sender);
    if (f && zugriffFenster.includes(f)) f.setIgnoreMouseEvents(!ueber, { forward: true });
  });
  ipc.on('zugriff:stopp', () => {
    agent.abbrechen();
    sprache.stumm();
    zugriffSpaeterWeg(0);
  });
  // Untertitel brauchen mehr Platz: Fenster nach unten wachsen lassen – bis zum
  // Bildschirmrand, danach scrollt der Text. Die Kugel bleibt, wo sie ist.
  ipc.on('blase:hoehe', (_e, h) => {
    if (!blaseDa() || !config.get('blase.untertitel')) return;
    const g = orbFenster.getBounds();
    const kugel = g.height - (orbFenster.juliaText || UNTERTITEL_HOEHE);
    const wa = screen.getDisplayMatching(g).workArea;
    const text = Math.max(UNTERTITEL_HOEHE, Math.min(Math.round(Number(h) || 0), 900));
    // Unten kein Platz mehr? Dann rückt die Blase so weit hoch, wie nötig –
    // und wieder zurück, sobald der Text weg ist.
    const basisY = g.y + (orbFenster.juliaHoch || 0);
    const unten = wa.y + wa.height;
    const y = Math.max(wa.y, Math.min(basisY, unten - (kugel + text)));
    const hoehe = Math.min(kugel + text, unten - y);
    if (hoehe === g.height && y === g.y) return;
    orbFenster.juliaText = hoehe - kugel;
    orbFenster.juliaHoch = basisY - y;
    orbFenster.setBounds({ x: g.x, y, width: g.width, height: hoehe });
  });
  ipc.handle('zwischenablage:schreiben', (_e, text) => {
    clipboard.writeText(String(text || '').slice(0, 200000));
    return true;
  });
  ipc.handle('auswahl:aktion', (_e, aktion, frage) => auswahlAktion(aktion, frage));
  ipc.on('chat:abbrechen', () => {
    agent.abbrechen();
    sprache.stumm();
    sprache.zuhoerenAbbrechen();
  });
  ipc.handle('start:ueberblick', (_e, neu) => startUeberblick(!!neu));
  ipc.handle('verlauf:liste', (_e, suche) => gespraeche.liste({ suche }));
  ipc.handle('verlauf:lesen', (_e, id) => {
    const g = gespraeche.lesen(id);
    return g ? { id: g.id, titel: g.titel, geaendert: g.geaendert, anzeige: g.anzeige } : null;
  });
  ipc.handle('verlauf:fortsetzen', (_e, id) => gespraechFortsetzen(id));
  ipc.handle('verlauf:loeschen', (_e, id) => {
    if (id === gespraech.id) gespraech.id = null;
    return gespraeche.loeschen(id);
  });
  // Code-Reiter: nur lesen. "In VS Code öffnen" startet den Editor direkt, ohne Shell.
  const editorPfad = () => [
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Microsoft VS Code', 'Code.exe'),
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Microsoft VS Code', 'Code.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'cursor', 'Cursor.exe'),
  ].find((p) => fs.existsSync(p)) || null;
  ipc.handle('code:uebersicht', async () => ({ projekte: await code.uebersicht(), editor: !!editorPfad() }));
  ipc.handle('code:details', async (_e, p) => { try { return await code.details(p); } catch (e) { return { fehler: e.message }; } });
  ipc.handle('code:diff', async (_e, p, datei) => { try { return { text: await code.diff(p, datei) }; } catch (e) { return { fehler: e.message }; } });
  ipc.handle('code:hinzufuegen', async () => {
    const r = await dialog.showOpenDialog(chatFenster || undefined, { properties: ['openDirectory'] });
    if (r.canceled || !r.filePaths[0]) return null;
    config.set('code.projekte', [...config.get('code.projekte'), r.filePaths[0]]);
    return path.resolve(r.filePaths[0]);
  });
  ipc.handle('code:entfernen', (_e, p) => {
    const ziel = path.resolve(String(p || '')).toLowerCase();
    config.set('code.projekte', config.get('code.projekte').filter((x) => path.resolve(x).toLowerCase() !== ziel));
    return true;
  });
  ipc.handle('code:oeffnen', (_e, p, wie) => {
    try {
      const ordner = code.pruefen(p);
      const exe = wie === 'editor' ? editorPfad() : null;
      if (exe) spawn(exe, [ordner], { detached: true, stdio: 'ignore', windowsHide: false }).unref();
      else shell.openPath(ordner);
      return { ok: true };
    } catch (e) {
      return { fehler: e.message };
    }
  });
  ipc.handle('clips:liste', async () => {
    if (VORFUEHRUNG) return require('./vorfuehrung').beispielClips(config);
    return { status: await clips.status(), clips: clips.liste().map((c) => ({ ...c, url: pathToFileURL(c.pfad).href })) };
  });
  ipc.handle('clips:aufnehmen', () => clipJetzt());
  ipc.handle('clips:ordner', () => {
    const o = clips.ordner();
    fs.mkdirSync(o, { recursive: true });
    shell.openPath(o);
    return true;
  });
  ipc.handle('clips:zeigen', (_e, p) => {
    try { shell.showItemInFolder(clips.pruefen(p)); return { ok: true }; } catch (e) { return { fehler: e.message }; }
  });
  ipc.handle('clips:loeschen', async (_e, p) => {
    try { await shell.trashItem(clips.pruefen(p)); anAlle('clips:geaendert'); return { ok: true }; } catch (e) { return { fehler: e.message }; }
  });
  ipc.handle('clips:umbenennen', (_e, p, name) => {
    try { const neu = clips.umbenennen(p, name); anAlle('clips:geaendert'); return { ok: true, pfad: neu, url: pathToFileURL(neu).href }; } catch (e) { return { fehler: e.message }; }
  });
  ipc.handle('clips:windows', () => { shell.openExternal('ms-settings:gaming-gamedvr'); return true; });
  ipc.handle('mc:status', () => (VORFUEHRUNG ? require('./vorfuehrung').beispielMinecraft() : mcStand()));
  ipc.handle('mc:beitreten', async (_e, d) => {
    try {
      const { host, port } = adresseTeilen(d && d.adresse);
      config.set('minecraft.adresse', host);
      config.set('minecraft.port', port);
      if (d && d.spieler !== undefined) config.set('minecraft.spieler', d.spieler);
      // Selbst eingetragen: dann darf es auch ein Server im Internet sein.
      await minecraft.verbinden({
        adresse: host,
        port,
        besitzer: config.get('minecraft.spieler'),
        botname: config.get('minecraft.botname'),
        assistent: assistentName(),
        oeffentlich: true,
        konto: mcKonto(),
        stimme: config.get('minecraft.stimme') !== false,
      });
      anAlle('mc:geaendert');
      return { ok: true };
    } catch (e) {
      return { fehler: e.message };
    }
  });
  ipc.handle('mc:verlassen', () => {
    minecraft.trennen();
    anAlle('mc:geaendert');
    return { ok: true };
  });
  ipc.handle('mc:aufgabe', (_e, a) => {
    try {
      const text = minecraft.aufgabe(a || {});
      if (a && a.aufgabe === 'kaempfen') try { minecraft.chat(text); } catch { /* egal */ }
      return { text };
    } catch (e) {
      return { fehler: e.message };
    }
  });
  ipc.handle('mc:chat', (_e, text) => {
    try { return { text: minecraft.chat(text) }; } catch (e) { return { fehler: e.message }; }
  });
  ipc.handle('mc:konto:verbinden', async (e) => {
    try {
      const r = await kontoAnmelden({
        cache: mcSpeicher,
        beiCode: (c) => {
          if (!e.sender.isDestroyed()) e.sender.send('mc:code', c);
          mcLinkOeffnen(c);
        },
      });
      config.set('minecraft.konto', r.name);
      anAlle('mc:geaendert');
      return { name: r.name };
    } catch (err) {
      return { fehler: err.message };
    }
  });
  ipc.handle('mc:konto:abmelden', () => {
    mcSpeicher.loeschen();
    config.set('minecraft.konto', '');
    anAlle('mc:geaendert');
    return { ok: true };
  });
  ipc.handle('routinen:liste', () => routinen.alle());
  ipc.handle('routinen:speichern', (_e, r) => {
    try {
      const neu = routinen.speichern(r && typeof r === 'object' ? r : {});
      anAlle('routinen:geaendert');
      return { routine: neu };
    } catch (e) {
      return { fehler: e.schluessel ? t(e.schluessel) : e.message };
    }
  });
  ipc.handle('routinen:loeschen', (_e, id) => {
    const ok = routinen.loeschen(String(id));
    anAlle('routinen:geaendert');
    return ok;
  });
  ipc.handle('routinen:starten', (_e, id) => routineStarten(String(id)));
  ipc.handle('verlauf:alle_loeschen', () => {
    gespraeche.alleLoeschen();
    gespraech.id = null;
    return true;
  });
  ipc.handle('handy:status', () => handy.status());
  ipc.handle('handy:koppeln', () => {
    try {
      const k = handy.koppelnStarten();
      return { ...k, qr: qrMatrix(k.url), status: handy.status() };
    } catch (e) {
      return { fehler: e.message === 'kein_netz' ? t('handy.kein_netz') : e.message, status: handy.status() };
    }
  });
  ipc.handle('handy:trennen', () => { handy.trennen(); return handy.status(); });
  ipc.handle('sync:status', () => sync.status());
  ipc.handle('sync:code', () => {
    try { return { ...sync.codeAnbieten(), status: sync.status() }; } catch (e) { return { fehler: syncFehler(e), status: sync.status() }; }
  });
  ipc.handle('sync:beitreten', async (_e, d) => {
    try {
      const r = await sync.beitreten({ code: d && d.code, adresse: d && d.adresse });
      return { name: r.name, status: sync.status() };
    } catch (e) {
      return { fehler: syncFehler(e), status: sync.status() };
    }
  });
  ipc.handle('sync:entfernen', (_e, id) => { sync.entfernen(String(id || '')); return sync.status(); });
  ipc.handle('sync:jetzt', async () => { await sync.abgleichen().catch(() => {}); return sync.status(); });
  ipc.on('chat:neu', () => { agent.neu(); anAlle('chat:geleert'); });
  ipc.on('sprache:umschalten', () => sprachUmschalten());
  ipc.on('freigabe:antwort', (_e, { id, ja }) => agent.freigabeBeantworten(id, ja));
  ipc.on('fenster:einstellungen', () => einstellungenOeffnen(false));
  ipc.on('fenster:schliessen', (e) => {
    const w = BrowserWindow.fromWebContents(e.sender);
    if (w) w.close();
  });
}

// --- Start ---

// --- Handy im WLAN ---
// Das Handy sieht dasselbe Gespräch wie der Chat am PC. Alles, was an die
// Fenster geht, landet auch im Gesprächsstand des Handy-Servers.

const HINWEIS_TEXT = {
  abgebrochen: 'chat.abgebrochen',
  beschaeftigt: 'chat.beschaeftigt',
  verweigert: 'hinweis.verweigert',
  max_tokens: 'hinweis.max_tokens',
  zu_viele_runden: 'hinweis.zu_viele_runden',
  kosten_warnung: 'hinweis.kosten_warnung',
};

// Was an die Fenster geht, als Gesprächsereignis für Handy und Verlauf.
function ereignisAus(kanal, d) {
  switch (kanal) {
    case 'agent:nutzer': return ['nutzer', d];
    case 'agent:start': return ['start', {}];
    case 'agent:text': return ['text', { text: d }];
    case 'agent:werkzeug': return ['werkzeug', d];
    case 'agent:werkzeugFertig': return ['werkzeugFertig', d];
    case 'agent:freigabe': return ['freigabe', d];
    case 'agent:freigabeErledigt': return ['freigabeErledigt', d];
    case 'agent:fertig': return ['fertig', {}];
    case 'agent:fehler': return ['system', { text: d.art === 'kein_schluessel' ? t('chat.kein_schluessel') : d.text, fehler: true }];
    case 'agent:hinweis': return HINWEIS_TEXT[d.art] ? ['system', { text: t(HINWEIS_TEXT[d.art]) }] : null;
    case 'zustand': return ['zustand', { zustand: d }];
    case 'chat:geleert': return ['geleert', {}];
    case 'erinnerung': return ['system', { text: `⏰ ${d.text}` }];
    default: return null;
  }
}

function ereignisWeiterleiten(kanal, d) {
  const e = ereignisAus(kanal, d);
  if (!e) return;
  if (handy) handy.ereignis(e[0], e[1]);
  if (e[0] === 'geleert') gespraech = { id: null, anzeige: [] };
  else if (e[0] !== 'zustand' && e[0] !== 'start') anzeige.anwenden(gespraech.anzeige, e[0], e[1]);
}

// Nach jeder fertigen Antwort: Gespräch verschlüsselt sichern (wenn gewünscht).
function gespraechSpeichern() {
  if (!gespraeche || VORFUEHRUNG || config.get('verlauf.speichern') === false) return;
  try {
    if (!gespraech.id) gespraech.id = gespraeche.neueId();
    const g = gespraeche.speichern({
      id: gespraech.id, anzeige: gespraech.anzeige, verlauf: agent.verlauf, anbieter: config.get('anbieter'), modell: config.get('modell'), sitzung: agent.sitzung(),
    });
    if (g) anAlle('verlauf:geaendert');
  } catch (e) {
    protokoll.eintragen({ werkzeug: 'verlauf', stufe: 'INFO', ergebnis: 'nicht gespeichert', grund: e.message });
  }
}

// --- Bildschirmzugriff sichtbar machen ---
// Solange Julia einen Screenshot macht oder Maus und Tastatur steuert, steht
// oben in der Mitte jedes Bildschirms ein Hinweis in der Akzentfarbe – mit
// Stopp-Knopf. Das Fenster ist vor Bildschirmaufnahmen geschützt und taucht
// deshalb in Julias eigenen Screenshots nicht auf.

const ZUGRIFF = { screenshot: 'sieht', klick: 'steuert', tippen: 'steuert', taste: 'steuert', scrollen: 'steuert', aktionen: 'steuert' };
let zugriffFenster = [];
let zugriffSignatur = '';
let zugriffTimer = null;
let zugriffAn = false;

function zugriffFensterBauen() {
  const displays = screen.getAllDisplays();
  const signatur = JSON.stringify(displays.map((d) => d.workArea));
  if (signatur === zugriffSignatur && zugriffFenster.every((f) => !f.isDestroyed())) return;
  for (const f of zugriffFenster) if (!f.isDestroyed()) f.destroy();
  zugriffSignatur = signatur;
  zugriffFenster = displays.map((d) => {
    const breite = 480;
    const hoehe = 60;
    const f = new BrowserWindow({
      x: Math.round(d.workArea.x + (d.workArea.width - breite) / 2), y: d.workArea.y + 6, width: breite, height: hoehe,
      frame: false, transparent: true, resizable: false, movable: false, focusable: false, skipTaskbar: true, alwaysOnTop: true,
      show: false, hasShadow: false, backgroundColor: '#00000000', title: assistentName(),
      webPreferences: { preload: PRELOAD, contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
    f.setIgnoreMouseEvents(true, { forward: true });
    f.setAlwaysOnTop(true, 'screen-saver');
    f.setContentProtection(true);
    f.loadFile(path.join(RENDERER, 'zugriff.html'));
    return f;
  });
}

function zugriffZeigen(art) {
  clearTimeout(zugriffTimer);
  zugriffAn = true;
  zugriffFensterBauen();
  for (const f of zugriffFenster) {
    const senden = () => {
      if (f.isDestroyed()) return;
      f.webContents.send('zugriff', { art });
      f.showInactive();
    };
    if (f.webContents.isLoading()) f.webContents.once('did-finish-load', senden);
    else senden();
  }
}

function zugriffSpaeterWeg(ms = 2500) {
  if (!zugriffAn) return;
  clearTimeout(zugriffTimer);
  zugriffTimer = setTimeout(() => {
    zugriffAn = false;
    for (const f of zugriffFenster) if (!f.isDestroyed()) f.webContents.send('zugriff', { art: null });
    zugriffTimer = setTimeout(() => { for (const f of zugriffFenster) if (!f.isDestroyed()) f.hide(); }, 350);
  }, ms);
}

// --- Minecraft ---

// Das verbundene Konto, solange die Anmeldung noch gespeichert ist.
function mcKonto() {
  const name = config.get('minecraft.konto');
  return name && mcSpeicher && mcSpeicher.vorhanden() ? { cache: mcSpeicher, name } : null;
}

function mcStand() {
  const c = config.get('minecraft');
  return { ...minecraft.status(), konto: mcKonto() ? c.konto : '', adresse: c.adresse, port: c.port, meinName: c.spieler };
}

// Den Code zeigt der Reiter; die Microsoft-Seite geht gleich im Browser auf.
// Angemeldet wird dort, nicht in Julia.
function mcLinkOeffnen(c) {
  const basis = /^https:\/\/(www\.)?microsoft\.com\/link\b/i.test(c.adresse || '') ? c.adresse : 'https://www.microsoft.com/link';
  shell.openExternal(`${basis}${basis.includes('?') ? '&' : '?'}otc=${encodeURIComponent(c.code)}`);
}

// --- Gaming-Clips ---

async function clipJetzt() {
  try {
    const r = await clips.aufnehmen();
    if (r.clip) {
      melden(t('clip.titel'), t('clip.gespeichert', { name: r.clip.name }));
      anAlle('clips:geaendert');
    } else {
      melden(t('clip.titel'), t('clip.nicht_gefunden'));
    }
    return r;
  } catch (e) {
    const text = e.message === 'keine_taste' ? t('clip.keine_taste') : e.message;
    melden(t('clip.titel'), text);
    return { fehler: text };
  }
}

// --- Markierter Text ---
// Hotkey: Strg+C an das Vordergrundfenster, Text aus der Zwischenablage holen,
// Zwischenablage wiederherstellen, kleines Menü am Mauszeiger zeigen.

let auswahlFenster = null;
let auswahlText = '';
const kurzWarten = (ms) => new Promise((r) => setTimeout(r, ms));

async function auswahlHolen() {
  const vorher = { text: clipboard.readText(), html: clipboard.readHTML(), bild: clipboard.readImage() };
  const marke = `julia-auswahl-${Date.now()}`;
  clipboard.writeText(marke);
  try { await win.kopierenNachHotkey(); } catch { /* dann eben ohne */ }
  let text = '';
  for (let i = 0; i < 15; i++) {
    await kurzWarten(60);
    const jetzt = clipboard.readText();
    if (jetzt !== marke) { text = jetzt; break; }
  }
  // Deine Zwischenablage kommt zurück, wie sie war.
  clipboard.clear();
  const zurueck = {};
  if (vorher.text) zurueck.text = vorher.text;
  if (vorher.html) zurueck.html = vorher.html;
  if (!vorher.bild.isEmpty()) zurueck.image = vorher.bild;
  if (Object.keys(zurueck).length) clipboard.write(zurueck);

  text = String(text || '').trim();
  if (!text) { melden(assistentName(), t('aw.nichts')); return; }
  auswahlText = text.slice(0, 20000);
  auswahlZeigen();
}

function auswahlZeigen() {
  const p = screen.getCursorScreenPoint();
  const wa = screen.getDisplayNearestPoint(p).workArea;
  const breite = 360;
  const hoehe = 292;
  const x = Math.min(Math.max(wa.x + 8, p.x + 14), wa.x + wa.width - breite - 8);
  const y = Math.min(Math.max(wa.y + 8, p.y + 14), wa.y + wa.height - hoehe - 8);
  if (auswahlFenster && !auswahlFenster.isDestroyed()) auswahlFenster.destroy();
  const f = new BrowserWindow({
    x, y, width: breite, height: hoehe,
    frame: false, transparent: true, resizable: false, alwaysOnTop: true, skipTaskbar: true, show: false,
    backgroundColor: '#00000000', title: assistentName(), icon: fensterBild(),
    webPreferences: { preload: PRELOAD, contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  auswahlFenster = f;
  f.setAlwaysOnTop(true, 'screen-saver');
  f.loadFile(path.join(RENDERER, 'auswahl.html'));
  f.once('ready-to-show', () => {
    f.show();
    f.focus();
    f.webContents.send('auswahl:text', auswahlText);
  });
  f.on('blur', () => { if (!f.isDestroyed()) f.close(); });
  f.on('closed', () => { if (auswahlFenster === f) auswahlFenster = null; });
}

const AUSWAHL_AKTIONEN = ['uebersetzen', 'zusammenfassen', 'umformulieren', 'erklaeren', 'korrigieren', 'antworten', 'frage'];

function auswahlAktion(aktion, frage) {
  if (!AUSWAHL_AKTIONEN.includes(aktion) || !auswahlText) return false;
  const anweisung = aktion === 'frage' ? String(frage || '').trim().slice(0, 2000) : t(`aw.f_${aktion}`);
  if (!anweisung) return false;
  const text = auswahlText;
  auswahlText = '';
  if (auswahlFenster && !auswahlFenster.isDestroyed()) auswahlFenster.close();
  chatZeigen('chat');
  const en = config.get('sprachcode') === 'en';
  // Markierter Text ist fremder Inhalt – nie ein Auftrag.
  const block = { type: 'text', text: fremd(en ? 'the marked text' : 'der markierten Stelle', text) };
  const schnipsel = text.replace(/\s+/g, ' ').slice(0, 48) + (text.length > 48 ? '…' : '');
  nachrichtSenden(anweisung, false, {
    bloecke: [block],
    anzeige: aktion === 'frage' ? `✂ ${anweisung}` : t('aw.nutzer', { aktion: t(`aw.a_${aktion}`) }),
    anzeigeAnhaenge: [{ name: schnipsel, art: 'auswahl' }],
  }).catch((e) => anAlle('agent:fehler', { art: 'text', text: e.message }));
  return true;
}

// Routine starten: Im Chat steht nur "▶ Name", Julia bekommt den ganzen
// Ablauf mit der Bitte, ihn einmal per auftrag_vorlegen freigeben zu lassen.
function routineStarten(id) {
  const r = routinen.lesen(id);
  if (!r) return { fehler: t('rt.fehlt') };
  if (agent.beschaeftigt) return { fehler: t('chat.beschaeftigt') };
  const text = routinenModul.nachricht(r, t('rt.nachricht'));
  chatZeigen('chat');
  sprache.stumm();
  anAlle('agent:nutzer', { text: `▶ ${r.name}`, perSprache: false });
  protokoll.eintragen({ werkzeug: 'routine', stufe: 'INFO', eingabe: { name: r.name, schritte: r.schritte }, ergebnis: 'gestartet' });
  agent.senden(text).catch((e) => {
    if (e.message === 'BESCHAEFTIGT') anAlle('agent:hinweis', { art: 'beschaeftigt' });
    else anAlle('agent:fehler', { art: 'text', text: e.message });
  });
  return { ok: true };
}

function gespraechFortsetzen(id) {
  if (agent.beschaeftigt) return { fehler: t('vl.beschaeftigt') };
  const g = gespraeche.lesen(id);
  if (!g) return { fehler: t('vl.leer') };
  agent.verlaufLaden(g.verlauf, g.sitzung);
  gespraech = { id: g.id, anzeige: g.anzeige.map((e) => ({ ...e })) };
  if (handy) handy.ereignis('geleert');
  const datum = new Date(g.geaendert).toLocaleString(config.get('sprachcode') === 'en' ? 'en-GB' : 'de-DE', { dateStyle: 'medium', timeStyle: 'short' });
  for (const w of [chatFenster, overlayFenster]) {
    if (w && !w.isDestroyed()) w.webContents.send('chat:laden', { eintraege: g.anzeige, hinweis: t('vl.fortgesetzt', { datum }) });
  }
  return { ok: true };
}

function handyTexte() {
  const sc = config.get('sprachcode');
  const name = assistentName();
  const texte = {};
  for (const [k, v] of Object.entries({ ...TEXTE.de, ...TEXTE[sc] })) {
    if (k.startsWith('mobil.')) texte[k] = v.split('{name}').join(name);
  }
  return { sprachcode: sc, name, akzent: config.get('design.akzent'), texte };
}

// Ein Auftrag vom gekoppelten Handy – wie vom Chat, nur mit Kanal "mobile".
async function handyNachricht(text) {
  if (agent.beschaeftigt) return { fehler: 'beschaeftigt' };
  sprache.stumm();
  protokoll.eintragen({ werkzeug: 'handy', stufe: 'INFO', eingabe: { text: text.slice(0, 300) }, ergebnis: 'Auftrag vom Handy' });
  anAlle('agent:nutzer', { text, perSprache: false, handy: true });
  agent.senden(text, { kanal: 'mobile' }).catch((e) => {
    if (e.message === 'BESCHAEFTIGT') anAlle('agent:hinweis', { art: 'beschaeftigt' });
    else anAlle('agent:fehler', { art: 'text', text: e.message });
  });
  return { ok: true };
}

// Eine Frage aus dem Minecraft-Chat (nur von deinem Spielernamen). Die Antwort
// geht kurz zurück in den Spielchat; handeln darf Julia von dort nur im Spiel
// (Kanal "minecraft", siehe agent.js).
async function minecraftFrage({ von, text }) {
  if (agent.beschaeftigt) {
    try { minecraft.chat(t('mc.beschaeftigt')); } catch { /* nicht mehr im Spiel */ }
    return;
  }
  protokoll.eintragen({ werkzeug: 'minecraft', stufe: 'INFO', eingabe: { von, text: text.slice(0, 250) }, ergebnis: 'Frage aus dem Minecraft-Chat' });
  anAlle('agent:nutzer', { text: t('mc.im_spiel', { von, text }), perSprache: false });
  try {
    const antwort = await agent.senden(`[${t('mc.auftrag_kopf', { von })}] ${text}`, { kanal: 'minecraft' });
    if (antwort) await minecraft.antworten(antwort);
  } catch (e) {
    if (e.message !== 'BESCHAEFTIGT') anAlle('agent:fehler', { art: 'text', text: e.message });
  }
}

// Gesprochen im Minecraft-Voice-Chat (nur die Stimme deines Spielernamens):
// erkennen, und nur mit Anrede ("Hey Julia, …") als Frage an Julia. Die
// Antwort kommt dann nur im Voice-Chat – nicht über die PC-Lautsprecher.
let mcStimmeLaeuft = false;
async function minecraftStimme(pcm) {
  if (mcStimmeLaeuft || agent.beschaeftigt) return;
  mcStimmeLaeuft = true;
  try {
    const sc = config.get('sprachcode');
    const text = await sprache.erkennenAus(pcm, sc);
    const name = assistentName();
    const frage = anredeEntfernen(text, [...weckPhrasen(name, sc), name]);
    if (!frage) return;
    const von = config.get('minecraft.spieler') || '?';
    protokoll.eintragen({ werkzeug: 'minecraft', stufe: 'INFO', eingabe: { von, text: frage.slice(0, 250) }, ergebnis: 'Frage im Minecraft-Voice-Chat' });
    anAlle('agent:nutzer', { text: t('mc.im_voice', { von, text: frage }), perSprache: true });
    const antwort = await agent.senden(`[${t('mc.auftrag_stimme', { von })}] ${frage}`, { kanal: 'minecraft', perSprache: true });
    if (antwort) await minecraftSagen(antwort);
  } catch (e) {
    if (e.message !== 'BESCHAEFTIGT') anAlle('agent:fehler', { art: 'text', text: e.message });
  } finally {
    mcStimmeLaeuft = false;
  }
}

async function minecraftSagen(text) {
  if (!minecraft || !minecraft.stimmeAktiv) return;
  const pcm = await sprache.alsAudio(text, { stimme: config.get('sprache.stimme'), tempo: config.get('sprache.tempo'), sprachcode: config.get('sprachcode') });
  if (pcm.length) await minecraft.stimmeSprechen(pcm).catch(() => {});
}

function handyEinrichten() {
  handy = new HandyServer({
    tresor: konten.tresor,
    texte: handyTexte,
    beiNachricht: handyNachricht,
    protokoll: (e) => protokoll.eintragen({ werkzeug: 'handy', ...e }),
  });
  handy.on('freigabe', ({ id, ja }) => {
    protokoll.eintragen({ werkzeug: 'handy', stufe: 'INFO', eingabe: { id }, ergebnis: ja ? 'Freigabe am Handy erteilt' : 'Freigabe am Handy abgelehnt' });
    agent.freigabeBeantworten(id, ja);
  });
  handy.on('stopp', () => {
    agent.abbrechen();
    sprache.stumm();
  });
  handy.on('neu', () => {
    agent.neu();
    anAlle('chat:geleert');
  });
  handy.on('status', () => anAlle('handy:status', handy.status()));
  handyAnwenden();
}

function handyAnwenden() {
  if (!handy || VORFUEHRUNG) return;
  if (config.get('handy.an')) handy.starten(config.get('handy.port')).catch(() => { /* Fehler steht im Status */ });
  else handy.stoppen();
}

// --- Geräte-Abgleich (PC zu PC) ---

function syncEinrichten() {
  sync = new Sync({
    tresor: konten.tresor,
    datenOrdner: DATEN,
    module: { gespraeche, gedaechtnis, routinen, erinnerungen },
    protokoll: (e) => protokoll.eintragen({ werkzeug: 'sync', ...e }),
  });
  sync.on('status', () => anAlle('sync:status', sync.status()));
  sync.on('geaendert', (was) => {
    if (was.includes('gespraeche')) anAlle('verlauf:geaendert');
    if (was.includes('routinen')) anAlle('routinen:geaendert');
  });
  syncAnwenden();
}

function syncAnwenden() {
  if (!sync || VORFUEHRUNG) return;
  if (config.get('sync.an')) sync.starten(config.get('sync.port')).catch(() => { /* Fehler steht im Status */ });
  else sync.stoppen();
}

function syncFehler(e) {
  const k = `sync.fehler_${e.message}`;
  const text = t(k);
  return text && text !== k ? text : e.message;
}

// --- Erinnerungen ---
// Zum Zeitpunkt nur melden: Windows-Meldung, Chat und auf Wunsch vorlesen.

function erinnerungMelden(e) {
  const zeit = new Date(e.zeit).toLocaleTimeString(config.get('sprachcode') === 'en' ? 'en-GB' : 'de-DE', { hour: '2-digit', minute: '2-digit' });
  const text = e.verspaetet ? t('erinnerung.verspaetet', { text: e.text, zeit }) : e.text;
  melden(t('erinnerung.titel'), text);
  anAlle('erinnerung', { text });
  if (config.get('erinnerung.vorlesen') && !sprache.hoertZu && !sprache.sprichtGerade && !agent.beschaeftigt) {
    zustandSetzen('speaking');
    sprache.sprechen(text, {
      stimme: config.get('sprache.stimme'),
      tempo: config.get('sprache.tempo'),
      sprachcode: config.get('sprachcode'),
      lautsprecher: config.get('sprache.lautsprecher'),
    }).then(() => { if (zustand === 'speaking') zustandSetzen('idle'); });
  }
}

// --- Aktivierungswort ("Hey Julia") ---
// Läuft nur, wenn eingeschaltet, und pausiert, solange Julia selbst zuhört oder
// spricht – sonst hörte sie ihren eigenen Namen aus dem Lautsprecher.

function weckwortAktualisieren() {
  if (!weckwort) return;
  const an = config.get('weckwort.an') && !VORFUEHRUNG && !sprache.hoertZu && !sprache.sprichtGerade;
  if (an) {
    weckwort.starten({
      name: assistentName(), sprachcode: config.get('sprachcode'), schwelle: config.get('weckwort.schwelle'), mikrofon: config.get('sprache.mikrofon'),
    }).catch(() => {});
  } else weckwort.stoppen();
}

function weckwortVerdrahten() {
  let fehlerGemeldet = false;
  let neustarts = 0;
  let mikroGemeldet = false;
  // Steigt die Erkennung unerwartet aus, läuft sie von selbst wieder an –
  // "Hey Julia" soll immer gehen, auch wenn nebenbei Netflix läuft.
  weckwort.on('bereit', () => { neustarts = 0; });
  weckwort.on('beendet', () => {
    if (!config.get('weckwort.an') || VORFUEHRUNG) return;
    neustarts += 1;
    setTimeout(weckwortAktualisieren, Math.min(30000, 1500 * neustarts));
  });
  const mikroFehlt = () => {
    if (mikroGemeldet) return;
    mikroGemeldet = true;
    melden(assistentName(), t('sprache.mikro_fehlt'));
  };
  weckwort.on('hinweis', (h) => { if (h === 'MIKRO_FEHLT') mikroFehlt(); });
  sprache.on('hinweis', (h) => { if (h === 'MIKRO_FEHLT') mikroFehlt(); });
  config.on('aenderung', (k) => { if (k === 'sprache.mikrofon') mikroGemeldet = false; });
  weckwort.on('erkannt', () => {
    if (Date.now() - weckwortZuletzt < 3000) return;
    weckwortZuletzt = Date.now();
    if (agent.beschaeftigt || sprache.hoertZu || sprache.sprichtGerade) return;
    if (minecraft && minecraft.stimmeAktiv) return; // im Voice-Chat hört Julia dort zu, nicht doppelt
    sprachUmschalten();
  });
  weckwort.on('fehler', (f) => {
    if (fehlerGemeldet) return;
    fehlerGemeldet = true;
    let text = f;
    if (f === 'KEIN_ERKENNER') text = t('weckwort.fehler', { sprache: config.get('sprachcode') === 'en' ? 'English' : 'Deutsch' });
    else if (f === 'KEIN_MIKROFON') text = t('weckwort.kein_mikrofon');
    melden(assistentName(), text);
  });
  sprache.on('mikrofon', (an) => { if (an) weckwort.stoppen(); else weckwortAktualisieren(); });
  sprache.on('lautsprecher', (an) => { if (an) weckwort.stoppen(); else weckwortAktualisieren(); });
  weckwortAktualisieren();
}

function erinnerungenVerdrahten() {
  erinnerungen.on('faellig', erinnerungMelden);
  if (!VORFUEHRUNG) erinnerungen.starten();
}

function agentVerdrahten() {
  for (const ereignis of ['text', 'werkzeug', 'werkzeugFertig', 'freigabeErledigt', 'start', 'fehler', 'hinweis']) {
    agent.on(ereignis, (d) => anAlle(`agent:${ereignis}`, d));
  }
  agent.on('freigabe', (d) => {
    if (overlaySichtbar()) {
      // Ist das Overlay offen (z. B. beim Spielen), dort fragen statt das große Fenster aufzureißen.
      overlayZeigen({ passiv: false });
    } else {
      chatZeigen();
      if (chatFenster) chatFenster.flashFrame(true);
    }
    anAlle('agent:freigabe', d);
  });
  agent.on('fertig', () => {
    anAlle('agent:fertig');
    gespraechSpeichern();
    if (config.get('kanal') !== 'auto' && protokoll.vorgemerkt().length) protokoll.vorgemerktLeeren();
    updater.aufgabeFertig();
  });
  agent.on('zustand', (z) => zustandSetzen(z));
  agent.on('kosten', (k) => anAlle('kosten', k));
  // Hinweis oben am Bildschirm, solange Julia hinsieht oder steuert.
  agent.on('werkzeug', ({ name }) => { if (ZUGRIFF[name]) zugriffZeigen(ZUGRIFF[name]); });
  agent.on('werkzeugFertig', () => zugriffSpaeterWeg());
  agent.on('fertig', () => zugriffSpaeterWeg(800));
}

function erststartSprache() {
  if (fs.existsSync(config.datei)) return;
  config.daten.sprachcode = /^de/i.test(app.getLocale()) ? 'de' : 'en';
  config.speichern();
}

async function start() {
  config = new Konfiguration(DATEN);
  config.on('warnung', (text) => melden(assistentName(),text));
  config.laden();
  erststartSprache();
  designAnwenden();
  nativeTheme.on('updated', fensterFarben);

  gedaechtnis = new Gedaechtnis(DATEN);
  protokoll = new Protokoll(DATEN);
  erinnerungen = new Erinnerungen(DATEN);
  const kosten = new Kosten(DATEN);
  // Windows-Verschlüsselung (DPAPI) für Tresor und Gesprächsverlauf.
  const krypto = {
    verschluesseln: (text) => {
      if (!safeStorage.isEncryptionAvailable()) throw new Error('Die Windows-Verschlüsselung ist nicht verfügbar.');
      return safeStorage.encryptString(text).toString('base64');
    },
    entschluesseln: (b64) => safeStorage.decryptString(Buffer.from(b64, 'base64')),
  };
  konten = new Konten({
    ordner: DATEN,
    krypto,
    oeffnen: (url) => shell.openExternal(url),
  });
  gespraeche = new Gespraeche(DATEN, krypto);
  routinen = new routinenModul.Routinen(DATEN, { sprachcode: () => config.get('sprachcode') });
  clips = new Clips({ config, videos: app.getPath('videos'), taste: (k) => win.taste(k) });
  code = new CodeProjekte({ config });
  // Minecraft: die eigene Spielfigur. Die Microsoft-Anmeldung liegt verschlüsselt im Datenordner.
  minecraft = new Minecraft();
  mcSpeicher = kontoSpeicher({ datei: path.join(DATEN, 'minecraft-konto.bin'), krypto });
  minecraft.on('ereignis', (e) => { melden(t('minecraft.titel'), e.text); anAlle('mc:geaendert'); });
  minecraft.on('frage', (f) => minecraftFrage(f));
  minecraft.on('stimme', (d) => minecraftStimme(d.pcm));
  minecraft.on('stimmeStatus', () => anAlle('mc:geaendert'));
  sprache = new Sprache({ dll: audio.dll });
  sprache.on('pegel', (p) => anAlle('pegel', p));
  // Eigenes Mikrofon oder eigener Lautsprecher: Audio-Hilfe schon beim Start bereitlegen.
  if (config.get('sprache.mikrofon') || config.get('sprache.lautsprecher')) audio.dll().catch(() => {});

  const ctx = {
    config,
    gedaechtnis,
    protokoll,
    konten,
    erinnerungen,
    kosten,
    datenOrdner: DATEN,
    appOrdner: APP,
    arbeitsordner: () => config.get('arbeitsverzeichnisse')[0] || os.homedir(),
    kontextGeaendert: () => {},
    // Anbieter ohne eigene Websuche bekommen das Werkzeug webseite_abrufen.
    eigenesWeb: () => anbieterListe.anbieterVon(config).art !== 'anthropic',
    clipJetzt: () => clipJetzt(),
    minecraft,
    minecraftKonto: () => mcKonto(),
  };
  agent = new Agent({
    config, ctx, apiSchluessel, systemPrompt: systemPromptText, laufzeitKontext: laufzeitText, claudeCodeExe: () => claudeCodePfad(),
  });
  // Aus Git gestartet: Updates über Tags. Installiert: über die Releases der Webseite.
  const UpdaterArt = app.isPackaged ? InstallerUpdater : Updater;
  updater = new UpdaterArt({
    holen: (url, o) => net.fetch(url, o),
    appOrdner: APP,
    datenOrdner: DATEN,
    config,
    istBeschaeftigt: () => agent.beschaeftigt,
    beiFertig: (r) => melden(t('update.titel'), r.ok ? t('update.erfolg', { version: r.version }) : t('update.zurueck', { version: r.version, fehler: r.fehler || '' })),
    beenden: () => { beendenLaeuft = true; app.quit(); },
  });
  ctx.updater = updater;
  agentVerdrahten();
  erinnerungenVerdrahten();
  handyEinrichten();
  syncEinrichten();
  weckwort = new Weckwort({ dll: audio.dll });
  weckwortVerdrahten();
  ipcEinrichten();

  // Keine Seite bekommt Kamera, Mikrofon, Standort, Benachrichtigungen o. Ä.
  // Julia hört über den Hauptprozess zu, nicht über die Oberfläche.
  session.defaultSession.setPermissionRequestHandler((_wc, _recht, antwort) => antwort(false));
  session.defaultSession.setPermissionCheckHandler(() => false);

  config.on('aenderung', (k) => {
    // Neue Ecke oder neuer Monitor gewählt: die selbst gezogene Position gilt nicht mehr.
    if ((k === 'blase.ecke' || k === 'blase.monitor') && config.get('blase.position')) config.set('blase.position', null);
    if (k.startsWith('blase')) blaseAktualisieren();
    if (k.startsWith('design')) designAnwenden();
    if (k.startsWith('overlay') && overlayFenster && !overlayFenster.isDestroyed()) {
      overlayFenster.setBounds(overlayGrenzen());
      overlayFenster.setOpacity(config.get('overlay.deckkraft'));
    }
    if (/^(nutzer\.|assistent\.|arbeitsverzeichnisse$|sprachcode$)/.test(k)) promptCache = null;
    if (k.startsWith('hotkey')) { hotkeysRegistrieren(); trayMenue(); }
    if (k.startsWith('handy.')) handyAnwenden();
    if (k.startsWith('sync.')) syncAnwenden();
    // Neuer Anbieter: frisches Gespräch, der alte Verlauf passt nicht zum neuen Modell.
    if (k === 'anbieter' || k === 'anbieter_url') { agent.neu(); anAlle('chat:geleert'); }
    if (k === 'autostart') autostartSetzen();
    if (k === 'sprachcode' || k === 'blase.an' || k === 'assistent.name' || k === 'weckwort.an') trayMenue();
    if (/^(weckwort\.|assistent\.name$|sprachcode$|sprache\.mikrofon$)/.test(k)) weckwortAktualisieren();
    if ((k === 'sprache.mikrofon' || k === 'sprache.lautsprecher') && config.get(k)) audio.dll().catch(() => {});
    if (k === 'sprachcode' || k === 'assistent.name') anAlle('texte:geaendert', texteFuerRenderer());
    if (k === 'assistent.name' && chatFenster && !chatFenster.isDestroyed()) chatFenster.setTitle(assistentName());
    anAlle('config:geaendert', oeffentlicheConfig());
  });

  tray = new Tray(trayBild());
  tray.on('click', () => chatUmschalten(null));
  trayMenue();

  if (!VORFUEHRUNG) hotkeysRegistrieren();
  blaseAktualisieren();
  for (const e of ['display-added', 'display-removed', 'display-metrics-changed']) screen.on(e, () => blaseAktualisieren());
  chatFensterErstellen();
  win.aufwaermen().catch(() => { /* wird beim ersten Werkzeug erneut versucht */ });

  if (VORFUEHRUNG) {
    await require('./vorfuehrung').aufnehmen({
      ziel: VORFUEHRUNG, config, chatFenster, einstellungenOeffnen, zustandSetzen, gespraeche, appOrdner: APP,
      zugriffDemo: (art) => { zugriffZeigen(art); return zugriffFenster[0]; },
      zugriffEnde: () => zugriffSpaeterWeg(0),
      orb: () => orbFenster, overlayZeigen, overlayVerstecken,
    });
    beendenLaeuft = true;
    app.exit(0);
    return;
  }

  const kette = protokoll.pruefen();
  if (!kette.ok) melden(assistentName(), t('protokoll.verletzt', { zeile: kette.zeile }));

  const st = updater.startStatus();
  if (st && st.probe) setTimeout(() => updater.gesundMelden(), 5000);
  else if (st && st.phase === 'fertig') {
    melden(t('update.titel'), st.ok ? t('update.erfolg', { version: st.version }) : t('update.zurueck', { version: st.version, fehler: st.fehler || '' }));
  }

  if (!config.get('einrichtung_fertig') || !bereit()) einstellungenOeffnen(true);
  else if (!process.argv.includes('--versteckt')) chatFenster.once('ready-to-show', () => chatZeigen(null));

  setTimeout(() => updatesBeimStart().catch(() => {}), 15000);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('web-contents-created', (_e, wc) => {
    sicherheit.fensterHaerten(wc, { rendererOrdner: RENDERER, oeffnen: (url) => shell.openExternal(url) });
  });
  app.on('second-instance', () => { if (chatFenster) chatZeigen(null); });
  app.on('window-all-closed', () => { /* Julia läuft im Tray weiter */ });
  app.on('before-quit', () => { beendenLaeuft = true; });
  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
    win.worker.beenden();
    if (erinnerungen) erinnerungen.stoppen();
    if (handy) handy.stoppen();
    if (sync) sync.stoppen();
    if (minecraft) minecraft.trennen();
    if (agent) agent.stoppen();
    if (weckwort) weckwort.stoppen();
    if (sprache) { sprache.stumm(); sprache.zuhoerenAbbrechen(); }
  });
  app.whenReady().then(start).catch((e) => {
    dialog.showErrorBox('Julia', e.stack || e.message);
    app.exit(1);
  });
}
