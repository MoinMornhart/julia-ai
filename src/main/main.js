'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, dialog, Notification, safeStorage, screen, shell, session, nativeTheme,
} = require('electron');
const sicherheit = require('./sicherheit');

// Datenordner außerhalb des Repos. JULIA_DATEN erlaubt einen getrennten Ordner
// (Tests, Screenshots), ohne die echte Konfiguration anzufassen.
const DATEN = process.env.JULIA_DATEN || path.join(app.getPath('appData'), 'Julia');
app.setPath('userData', path.join(DATEN, 'electron'));
app.setAppUserModelId('Julia');
// Jede Seite läuft in der Chromium-Sandbox, auch wenn ein Fenster es vergäße.
app.enableSandbox();

const { Konfiguration } = require('./config');
const { Gedaechtnis } = require('./gedaechtnis');
const { Protokoll } = require('./protokoll');
const { Agent } = require('./agent');
const { Updater } = require('./updater');
const { Sprache } = require('./sprache');
const { Konten } = require('./konten');
const { TelegramHandy } = require('./handy/telegram');
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
let handy;
let tray = null;
let chatFenster = null;
let orbFenster = null;
let einstFenster = null;
let beendenLaeuft = false;
let zustand = 'idle';
let promptCache = null;
let hoert = false;

const t = (k, w) => tt(config.get('sprachcode'), k, w);

function version() {
  return JSON.parse(fs.readFileSync(path.join(APP, 'package.json'), 'utf8')).version;
}

// --- API-Schlüssel: mit Windows (DPAPI) verschlüsselt in der config.json ---

function apiSchluessel() {
  const v = config.get('api.schluessel_verschluesselt');
  if (v && safeStorage.isEncryptionAvailable()) {
    try { return safeStorage.decryptString(Buffer.from(v, 'base64')); } catch { /* unlesbar, Umgebung versuchen */ }
  }
  return process.env.ANTHROPIC_API_KEY || '';
}

function schluesselSetzen(s) {
  const text = String(s || '').trim();
  if (!text) return;
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Die Windows-Verschlüsselung ist nicht verfügbar.');
  config.set('api.schluessel_verschluesselt', safeStorage.encryptString(text).toString('base64'));
}

// --- Prompt ---

function systemPromptText() {
  if (!promptCache) {
    promptCache = prompt.systemPrompt({
      sprachcode: config.get('sprachcode'),
      name: config.get('nutzer.name'),
      arbeitsverzeichnisse: config.get('arbeitsverzeichnisse'),
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
    konten: [...konten.beschreibung(), ...handyBeschreibung()],
  });
}

// --- Zustand und Nachrichten an alle Fenster ---

function anAlle(kanal, daten) {
  for (const w of [chatFenster, orbFenster, einstFenster]) {
    if (w && !w.isDestroyed()) w.webContents.send(kanal, daten);
  }
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
    version: version(),
    monitore: bildschirm.beschreibung(),
  };
}

function texteFuerRenderer() {
  const sc = config.get('sprachcode');
  return { sprachcode: sc, texte: { ...TEXTE.de, ...TEXTE[sc] } };
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

function chatFensterErstellen() {
  const wa = screen.getPrimaryDisplay().workArea;
  const breite = 460;
  const hoehe = Math.min(760, wa.height - 40);
  chatFenster = new BrowserWindow(fensterOptionen({
    width: breite,
    height: hoehe,
    minWidth: 360,
    minHeight: 420,
    x: wa.x + wa.width - breite - 20,
    y: wa.y + wa.height - hoehe - 20,
    title: 'Julia',
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

function chatZeigen() {
  if (!chatFenster || chatFenster.isDestroyed()) chatFensterErstellen();
  if (chatFenster.isMinimized()) chatFenster.restore();
  chatFenster.show();
  chatFenster.focus();
}

function chatUmschalten() {
  if (chatFenster && chatFenster.isVisible() && chatFenster.isFocused()) chatFenster.hide();
  else chatZeigen();
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

// --- Tray, Hotkeys, Autostart ---

function trayMenue() {
  const menue = Menu.buildFromTemplate([
    { label: t('tray.chat'), click: chatZeigen },
    { label: `${t('tray.sprechen')}   (${config.get('hotkey.sprechen')})`, click: sprachUmschalten },
    { type: 'separator' },
    { label: t('tray.blase'), type: 'checkbox', checked: config.get('blase.an'), click: (m) => config.set('blase.an', m.checked) },
    { label: t('tray.neu'), click: () => { agent.neu(); anAlle('chat:geleert'); } },
    { label: t('tray.einstellungen'), click: () => einstellungenOeffnen(false) },
    { type: 'separator' },
    { label: t('tray.updates'), click: updatesManuell },
    { label: t('tray.protokoll'), click: () => shell.openPath(DATEN) },
    { type: 'separator' },
    { label: `${t('tray.beenden')}  ·  v${version()}`, click: () => { beendenLaeuft = true; app.quit(); } },
  ]);
  tray.setContextMenu(menue);
  tray.setToolTip(`${t('tray.tooltip')} ${version()}`);
}

function hotkeysRegistrieren() {
  globalShortcut.unregisterAll();
  const paare = [[config.get('hotkey.sprechen'), sprachUmschalten], [config.get('hotkey.chat'), chatUmschalten]];
  for (const [taste, aktion] of paare) {
    let ok = false;
    try { ok = globalShortcut.register(taste, aktion); } catch { ok = false; }
    if (!ok) melden('Julia', t('hotkey.fehler', { hotkey: taste }));
  }
}

function autostartSetzen() {
  app.setLoginItemSettings({
    openAtLogin: !!config.get('autostart'),
    path: process.execPath,
    args: [APP, '--versteckt'],
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
  if (text) await nachrichtSenden(text, true);
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
  ipc.handle('config:lesen', () => oeffentlicheConfig());
  ipc.handle('config:setzen', (_e, schluessel, wert) => {
    if (String(schluessel).startsWith('api.')) return { fehler: 'Nicht erlaubt.' };
    try { return { wert: config.set(schluessel, wert) }; } catch (e) { return { fehler: e.message }; }
  });
  ipc.handle('schluessel:setzen', (_e, s) => {
    try { schluesselSetzen(s); return { ok: true }; } catch (e) { return { fehler: e.message }; }
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
  ipc.handle('handy:status', () => handy.status());
  ipc.handle('handy:verbinden', async (_e, token) => {
    try {
      return { status: await handy.einrichten(token) };
    } catch (e) {
      return { fehler: e.message, status: handy.status() };
    }
  });
  ipc.handle('handy:trennen', async () => ({ status: await handy.trennen() }));
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

// --- Handy (Telegram) ---

function handyBeschreibung() {
  const s = handy ? handy.status() : null;
  return s && s.gekoppelt ? [{ dienst: 'Handy (Telegram)', konto: s.nutzer || '' }] : [];
}

const HINWEIS_TEXT = {
  abgebrochen: 'chat.abgebrochen',
  beschaeftigt: 'handy.beschaeftigt',
  verweigert: 'hinweis.verweigert',
  max_tokens: 'hinweis.max_tokens',
  zu_viele_runden: 'hinweis.zu_viele_runden',
};

async function handyNachricht(text) {
  protokoll.eintragen({ werkzeug: 'handy', stufe: 'INFO', eingabe: { text: String(text).slice(0, 300) }, ergebnis: 'Auftrag vom Handy' });
  if (agent.beschaeftigt) {
    await handy.senden(t('handy.beschaeftigt'));
    return;
  }
  anAlle('agent:nutzer', { text, perSprache: false, handy: true });
  const meldungen = [];
  const beiFehler = (e) => meldungen.push(e.art === 'kein_schluessel' ? t('chat.kein_schluessel') : e.text);
  const beiHinweis = (h) => { if (HINWEIS_TEXT[h.art]) meldungen.push(t(HINWEIS_TEXT[h.art])); };
  agent.on('fehler', beiFehler);
  agent.on('hinweis', beiHinweis);
  handy.tippt();
  const tippen = setInterval(() => handy.tippt(), 4500);
  let antwort = null;
  try {
    antwort = await agent.senden(text, { kanal: 'mobile' });
  } catch (e) {
    meldungen.push(e.message === 'BESCHAEFTIGT' ? t('handy.beschaeftigt') : e.message);
  } finally {
    clearInterval(tippen);
    agent.off('fehler', beiFehler);
    agent.off('hinweis', beiHinweis);
  }
  const aus = [antwort, ...meldungen].filter(Boolean).join('\n\n');
  if (aus) await handy.senden(aus);
}

function handyVerdrahten() {
  const leise = (p) => { p.catch(() => {}); };
  handy.on('nachricht', ({ text }) => leise(handyNachricht(text).catch((e) => handy.senden(e.message))));
  handy.on('stopp', () => {
    agent.abbrechen();
    sprache.stumm();
    leise(handy.senden(t('handy.gestoppt')));
  });
  handy.on('neu', () => {
    agent.neu();
    anAlle('chat:geleert');
    leise(handy.senden(t('handy.neu')));
  });
  handy.on('freigabe', ({ id, ja }) => agent.freigabeBeantworten(id, ja));
  handy.on('status', () => anAlle('handy:status', handy.status()));
  handy.on('fremd', (x) => protokoll.eintragen({ werkzeug: 'handy', stufe: 'ROT', ergebnis: 'ignoriert', grund: `Nachricht von fremdem Telegram-Konto ${x.id} ${x.name}` }));
  handy.on('fehler', () => { /* Einzelne Updates dürfen die Schleife nicht stoppen */ });
  agent.on('freigabeErledigt', ({ id, ja }) => leise(handy.freigabeErledigt(id, ja)));
  if (!VORFUEHRUNG) handy.starten();
}

function agentVerdrahten() {
  for (const ereignis of ['text', 'werkzeug', 'werkzeugFertig', 'freigabeErledigt', 'start', 'fehler', 'hinweis']) {
    agent.on(ereignis, (d) => anAlle(`agent:${ereignis}`, d));
  }
  agent.on('freigabe', (d) => {
    // Kam der Auftrag vom Handy, fragt Julia dort (oder sagt dort, dass der PC fragt).
    const vomHandy = d.kanal === 'mobile' && handy && handy.gekoppelt;
    if (!vomHandy || config.get('handy.freigaben') === 'pc') {
      chatZeigen();
      if (chatFenster) chatFenster.flashFrame(true);
    }
    anAlle('agent:freigabe', d);
    if (vomHandy) handy.freigabeFragen(d, { knoepfe: config.get('handy.freigaben') === 'handy' }).catch(() => {});
  });
  agent.on('fertig', () => {
    anAlle('agent:fertig');
    if (config.get('kanal') !== 'auto' && protokoll.vorgemerkt().length) protokoll.vorgemerktLeeren();
    updater.aufgabeFertig();
  });
  agent.on('zustand', (z) => zustandSetzen(z));
}

function erststartSprache() {
  if (fs.existsSync(config.datei)) return;
  config.daten.sprachcode = /^de/i.test(app.getLocale()) ? 'de' : 'en';
  config.speichern();
}

async function start() {
  config = new Konfiguration(DATEN);
  config.on('warnung', (text) => melden('Julia', text));
  config.laden();
  erststartSprache();
  designAnwenden();
  nativeTheme.on('updated', fensterFarben);

  gedaechtnis = new Gedaechtnis(DATEN);
  protokoll = new Protokoll(DATEN);
  konten = new Konten({
    ordner: DATEN,
    krypto: {
      verschluesseln: (text) => {
        if (!safeStorage.isEncryptionAvailable()) throw new Error('Die Windows-Verschlüsselung ist nicht verfügbar.');
        return safeStorage.encryptString(text).toString('base64');
      },
      entschluesseln: (b64) => safeStorage.decryptString(Buffer.from(b64, 'base64')),
    },
    oeffnen: (url) => shell.openExternal(url),
  });
  handy = new TelegramHandy({ tresor: konten.tresor, texte: (k, w) => t(k, w) });
  sprache = new Sprache();
  sprache.on('pegel', (p) => anAlle('pegel', p));

  const ctx = {
    config,
    gedaechtnis,
    protokoll,
    konten,
    datenOrdner: DATEN,
    appOrdner: APP,
    arbeitsordner: () => config.get('arbeitsverzeichnisse')[0] || os.homedir(),
    kontextGeaendert: () => {},
  };
  agent = new Agent({ config, ctx, apiSchluessel, systemPrompt: systemPromptText, laufzeitKontext: laufzeitText });
  updater = new Updater({
    appOrdner: APP,
    datenOrdner: DATEN,
    config,
    istBeschaeftigt: () => agent.beschaeftigt,
    beiFertig: (r) => melden(t('update.titel'), r.ok ? t('update.erfolg', { version: r.version }) : t('update.zurueck', { version: r.version, fehler: r.fehler || '' })),
    beenden: () => { beendenLaeuft = true; app.quit(); },
  });
  ctx.updater = updater;
  agentVerdrahten();
  handyVerdrahten();
  ipcEinrichten();

  // Keine Seite bekommt Kamera, Mikrofon, Standort, Benachrichtigungen o. Ä.
  // Julia hört über den Hauptprozess zu, nicht über die Oberfläche.
  session.defaultSession.setPermissionRequestHandler((_wc, _recht, antwort) => antwort(false));
  session.defaultSession.setPermissionCheckHandler(() => false);

  config.on('aenderung', (k) => {
    if (k.startsWith('blase')) blaseAktualisieren();
    if (k.startsWith('design')) designAnwenden();
    if (/^(nutzer\.name|arbeitsverzeichnisse|sprachcode)$/.test(k)) promptCache = null;
    if (k.startsWith('hotkey')) { hotkeysRegistrieren(); trayMenue(); }
    if (k === 'autostart') autostartSetzen();
    if (k === 'sprachcode' || k === 'blase.an') trayMenue();
    if (k === 'sprachcode') anAlle('texte:geaendert', texteFuerRenderer());
    anAlle('config:geaendert', oeffentlicheConfig());
  });

  tray = new Tray(trayBild());
  tray.on('click', chatUmschalten);
  trayMenue();

  if (!VORFUEHRUNG) hotkeysRegistrieren();
  blaseAktualisieren();
  for (const e of ['display-added', 'display-removed', 'display-metrics-changed']) screen.on(e, () => blaseAktualisieren());
  chatFensterErstellen();
  win.aufwaermen().catch(() => { /* wird beim ersten Werkzeug erneut versucht */ });

  if (VORFUEHRUNG) {
    await require('./vorfuehrung').aufnehmen({
      ziel: VORFUEHRUNG, config, chatFenster, einstellungenOeffnen, zustandSetzen,
      orb: () => orbFenster,
    });
    beendenLaeuft = true;
    app.exit(0);
    return;
  }

  const st = updater.startStatus();
  if (st && st.probe) setTimeout(() => updater.gesundMelden(), 5000);
  else if (st && st.phase === 'fertig') {
    melden(t('update.titel'), st.ok ? t('update.erfolg', { version: st.version }) : t('update.zurueck', { version: st.version, fehler: st.fehler || '' }));
  }

  if (!config.get('einrichtung_fertig') || !apiSchluessel()) einstellungenOeffnen(true);
  else if (!process.argv.includes('--versteckt')) chatFenster.once('ready-to-show', () => chatZeigen());

  setTimeout(() => updatesBeimStart().catch(() => {}), 15000);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('web-contents-created', (_e, wc) => {
    sicherheit.fensterHaerten(wc, { rendererOrdner: RENDERER, oeffnen: (url) => shell.openExternal(url) });
  });
  app.on('second-instance', () => { if (chatFenster) chatZeigen(); });
  app.on('window-all-closed', () => { /* Julia läuft im Tray weiter */ });
  app.on('before-quit', () => { beendenLaeuft = true; });
  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
    win.worker.beenden();
    if (handy) handy.stoppen();
    if (sprache) { sprache.stumm(); sprache.zuhoerenAbbrechen(); }
  });
  app.whenReady().then(start).catch((e) => {
    dialog.showErrorBox('Julia', e.stack || e.message);
    app.exit(1);
  });
}
