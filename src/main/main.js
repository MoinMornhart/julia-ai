'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, dialog, Notification, safeStorage, screen, shell, session, nativeTheme, net,
} = require('electron');
const sicherheit = require('./sicherheit');

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

// Die Blase: nur sichtbar, wenn blase.an gesetzt ist. Klicks gehen durch sie hindurch.
function blaseAktualisieren() {
  const b = config.get('blase');
  if (!b.an) {
    if (orbFenster && !orbFenster.isDestroyed()) orbFenster.destroy();
    orbFenster = null;
    return;
  }
  const ds = bildschirm.monitore();
  const d = ds[b.monitor] || ds[ds.length - 1];
  const wa = d.workArea;
  const s = Math.round(b.groesse / d.scaleFactor);
  const rand = 24;
  const x = b.ecke.endsWith('rechts') ? wa.x + wa.width - s - rand : wa.x + rand;
  const y = b.ecke.startsWith('unten') ? wa.y + wa.height - s - rand : wa.y + rand;
  const grenzen = { x: Math.round(x), y: Math.round(y), width: s, height: s };

  if (!orbFenster || orbFenster.isDestroyed()) {
    orbFenster = new BrowserWindow({
      ...grenzen,
      transparent: true,
      frame: false,
      resizable: false,
      movable: false,
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
    orbFenster.setIgnoreMouseEvents(true);
    orbFenster.setAlwaysOnTop(true, 'screen-saver');
    orbFenster.loadFile(path.join(RENDERER, 'blase.html'));
    orbFenster.once('ready-to-show', () => {
      orbFenster.showInactive();
      orbFenster.setBounds(grenzen);
    });
  } else {
    // Zweimal setzen: Beim Wechsel auf einen Monitor mit anderer Skalierung
    // stimmt die Größe erst im zweiten Anlauf.
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

async function nachrichtSenden(text, perSprache) {
  const sauber = String(text || '').trim();
  if (!sauber) return;
  sprache.stumm();
  anAlle('agent:nutzer', { text: sauber, perSprache });
  let antwort = null;
  try {
    antwort = await agent.senden(sauber, { perSprache });
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
    text = await sprache.zuhoeren(config.get('sprachcode'));
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
    if (String(schluessel).startsWith('api.')) return { fehler: 'Nicht erlaubt.' };
    try { return { wert: config.set(schluessel, wert) }; } catch (e) { return { fehler: e.message }; }
  });
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
  ipc.handle('chat:senden', (_e, text) => {
    nachrichtSenden(text, false).catch((e) => anAlle('agent:fehler', { art: 'text', text: e.message }));
    return true;
  });
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
    }).then(() => { if (zustand === 'speaking') zustandSetzen('idle'); });
  }
}

// --- Aktivierungswort ("Hey Julia") ---
// Läuft nur, wenn eingeschaltet, und pausiert, solange Julia selbst zuhört oder
// spricht – sonst hörte sie ihren eigenen Namen aus dem Lautsprecher.

function weckwortAktualisieren() {
  if (!weckwort) return;
  const an = config.get('weckwort.an') && !VORFUEHRUNG && !sprache.hoertZu && !sprache.sprichtGerade;
  if (an) weckwort.starten({ name: assistentName(), sprachcode: config.get('sprachcode'), schwelle: config.get('weckwort.schwelle') });
  else weckwort.stoppen();
}

function weckwortVerdrahten() {
  let fehlerGemeldet = false;
  weckwort.on('erkannt', () => {
    if (Date.now() - weckwortZuletzt < 3000) return;
    weckwortZuletzt = Date.now();
    if (agent.beschaeftigt || sprache.hoertZu || sprache.sprichtGerade) return;
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
  sprache = new Sprache();
  sprache.on('pegel', (p) => anAlle('pegel', p));

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
  weckwort = new Weckwort();
  weckwortVerdrahten();
  ipcEinrichten();

  // Keine Seite bekommt Kamera, Mikrofon, Standort, Benachrichtigungen o. Ä.
  // Julia hört über den Hauptprozess zu, nicht über die Oberfläche.
  session.defaultSession.setPermissionRequestHandler((_wc, _recht, antwort) => antwort(false));
  session.defaultSession.setPermissionCheckHandler(() => false);

  config.on('aenderung', (k) => {
    if (k.startsWith('blase')) blaseAktualisieren();
    if (k.startsWith('design')) designAnwenden();
    if (k.startsWith('overlay') && overlayFenster && !overlayFenster.isDestroyed()) {
      overlayFenster.setBounds(overlayGrenzen());
      overlayFenster.setOpacity(config.get('overlay.deckkraft'));
    }
    if (/^(nutzer\.|assistent\.|arbeitsverzeichnisse$|sprachcode$)/.test(k)) promptCache = null;
    if (k.startsWith('hotkey')) { hotkeysRegistrieren(); trayMenue(); }
    if (k.startsWith('handy.')) handyAnwenden();
    // Neuer Anbieter: frisches Gespräch, der alte Verlauf passt nicht zum neuen Modell.
    if (k === 'anbieter' || k === 'anbieter_url') { agent.neu(); anAlle('chat:geleert'); }
    if (k === 'autostart') autostartSetzen();
    if (k === 'sprachcode' || k === 'blase.an' || k === 'assistent.name' || k === 'weckwort.an') trayMenue();
    if (/^(weckwort\.|assistent\.name$|sprachcode$)/.test(k)) weckwortAktualisieren();
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
      ziel: VORFUEHRUNG, config, chatFenster, einstellungenOeffnen, zustandSetzen, gespraeche,
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
    if (agent) agent.stoppen();
    if (weckwort) weckwort.stoppen();
    if (sprache) { sprache.stumm(); sprache.zuhoerenAbbrechen(); }
  });
  app.whenReady().then(start).catch((e) => {
    dialog.showErrorBox('Julia', e.stack || e.message);
    app.exit(1);
  });
}
