'use strict';

const { EventEmitter } = require('events');
const dns = require('dns');
const fs = require('fs');
const net = require('net');
const path = require('path');
const { GRUEN, ROT } = require('./ampel');
const { intern } = require('./webseite');
const { Stimme } = require('./minecraft-stimme');

// Julia spielt Minecraft (Java Edition) mit – als eigene Spielfigur auf deinem
// Server. Alles Schnelle (kämpfen, folgen, ausweichen) läuft hier lokal 20-mal
// pro Sekunde; das Modell gibt nur die Aufgabe vor, sonst wäre Julia viel zu
// langsam.
//
// Von sich aus nur Server auf diesem PC oder im Heimnetz. Einen Server im
// Internet (etwa den eines Freundes) trägt der Nutzer selbst im Minecraft-
// Reiter ein. Große öffentliche Netzwerke nie: Dort sind Bots verboten, das
// wäre Schummeln gegen echte Leute und ein Bann-Grund.
//
// Mit Minecraft-Konto meldet sich der Nutzer selbst im Browser bei Microsoft
// an (Code auf microsoft.com/link) – Julia sieht kein Passwort. Ohne Konto
// geht es auf Servern mit online-mode=false.

const FREMDER_SERVER = 'Von sich aus tritt Julia nur Servern auf diesem PC oder im Heimnetz bei. Einen Server im Internet trägst du selbst im Minecraft-Reiter ein.';
const GROSSES_NETZWERK = 'Auf großen öffentlichen Servern sind Bots verboten – das Konto würde gebannt. Dort spielt Julia nicht mit.';
const GROSSE_NETZWERKE = /(^|\.)(hypixel\.net|mineplex\.com|cubecraft\.net|gommehd\.net|hivemc\.com|playhive\.com|mccentral\.org|minemen\.club|pvp\.land|manacube\.com|jartexnetwork\.com|pika-network\.net|blocksmc\.com|minesaga\.org|wynncraft\.com|mineclub\.com|herobrine\.org|timolia\.de|griefergames\.net|rewinside\.tv|opblocks\.com|purpleprison\.org|lemoncloud\.net|mcprison\.com|2b2t\.org)\.?$/i;
const KONTO_ID = 'julia';
const KONTO_NEU = 'Das Minecraft-Konto muss neu verbunden werden – im Minecraft-Reiter auf „Konto verbinden“.';

// [Schaden, Schläge pro Sekunde] seit 1.9 – danach richtet sich die Waffenwahl.
const WAFFEN = {
  netherite_sword: [8, 1.6], diamond_sword: [7, 1.6], iron_sword: [6, 1.6], stone_sword: [5, 1.6], golden_sword: [4, 1.6], wooden_sword: [4, 1.6],
  netherite_axe: [10, 1], diamond_axe: [9, 1], iron_axe: [9, 0.9], stone_axe: [9, 0.8], golden_axe: [7, 1], wooden_axe: [7, 0.8],
  trident: [9, 1.1],
};
const RUESTUNG = { netherite: 6, diamond: 5, iron: 4, chainmail: 3, turtle: 3, golden: 2, leather: 1 };
const WERKZEUG = { netherite: 6, diamond: 5, iron: 4, stone: 2, golden: 2, wooden: 1 };
const PLATZ = { helmet: 'head', chestplate: 'torso', leggings: 'legs', boots: 'feet' };
const PLATZ_SLOT = { head: 5, torso: 6, legs: 7, feet: 8 };
const HEILEN = ['enchanted_golden_apple', 'golden_apple'];
const ESSEN = ['golden_carrot', 'cooked_beef', 'cooked_porkchop', 'cooked_mutton', 'cooked_salmon', 'cooked_chicken', 'baked_potato', 'bread', 'cooked_cod', 'pumpkin_pie', 'apple', 'carrot', 'sweet_berries', 'melon_slice', 'cookie'];
const FEINDE = new Set([
  'zombie', 'husk', 'drowned', 'zombie_villager', 'skeleton', 'stray', 'bogged', 'wither_skeleton', 'creeper', 'spider', 'cave_spider',
  'witch', 'slime', 'magma_cube', 'phantom', 'pillager', 'vindicator', 'evoker', 'vex', 'ravager', 'blaze', 'ghast', 'piglin_brute',
  'hoglin', 'zoglin', 'silverfish', 'endermite', 'guardian', 'elder_guardian', 'breeze',
]);

// Deutsche Wörter für häufige Blöcke; sonst gilt der englische Name (oak_log).
// Ein Eintrag mit "_" vorne passt auf alle Namen mit dieser Endung.
const BLOCK_WOERTER = {
  holz: ['_log'], baumstamm: ['_log'], stamm: ['_log'],
  stein: ['stone', 'cobblestone', 'deepslate'], bruchstein: ['cobblestone'],
  erde: ['dirt', 'grass_block'], sand: ['sand'], kies: ['gravel'], ton: ['clay'],
  kohle: ['coal_ore', 'deepslate_coal_ore'], eisen: ['iron_ore', 'deepslate_iron_ore'], kupfer: ['copper_ore', 'deepslate_copper_ore'],
  gold: ['gold_ore', 'deepslate_gold_ore'], diamant: ['diamond_ore', 'deepslate_diamond_ore'], diamanten: ['diamond_ore', 'deepslate_diamond_ore'],
  redstone: ['redstone_ore', 'deepslate_redstone_ore'], smaragd: ['emerald_ore', 'deepslate_emerald_ore'],
};

// --- Kleine, prüfbare Bausteine ---

function adresseTeilen(roh, port) {
  let host = String(roh || '').trim() || 'localhost';
  let p = Number(port) || 25565;
  const m = /^([^:[\]]+):(\d{1,5})$/.exec(host);
  if (m) { host = m[1]; p = Number(m[2]); }
  const v6 = /^\[([^\]]+)\](?::(\d{1,5}))?$/.exec(host);
  if (v6) { host = v6[1]; if (v6[2]) p = Number(v6[2]); }
  return { host, port: Math.round(p) };
}

// Löst den Namen einmal auf und verbindet dann mit genau dieser IP – so kann
// ein umgebogener DNS-Eintrag nicht nachträglich auf einen fremden Server zeigen.
// oeffentlich: Die Adresse hat der Nutzer selbst eingetragen – dann darf es
// auch ein Server im Internet sein, nur kein großes Netzwerk.
function hostPruefen(roh) {
  const host = String(roh || '').trim().replace(/^\[|\]$/g, '');
  if (!host || host.length > 253 || !/^[A-Za-z0-9.\-:]+$/.test(host)) throw new Error('Das ist keine gültige Serveradresse.');
  if (GROSSE_NETZWERKE.test(host)) throw new Error(GROSSES_NETZWERK);
  return host;
}

async function adressePruefen(roh, aufloesen = (h) => dns.promises.lookup(h, { all: true }), { oeffentlich = false } = {}) {
  const host = hostPruefen(roh);
  const ips = net.isIP(host) ? [host] : (await aufloesen(host)).map((x) => x.address);
  if (!ips.length) throw new Error(`${host} wurde nicht gefunden.`);
  if (!oeffentlich && !ips.every(intern)) throw new Error(FREMDER_SERVER);
  return ips[0];
}

// Wie das Spiel selbst: Ohne eigenen Port gilt der SRV-Eintrag
// (_minecraft._tcp.NAME) – viele Server liegen nicht dort, wo die Webseite
// liegt. Verbunden wird mit der geprüften IP; im Handshake steht aber der
// Name, den du eingetragen hast, sonst lassen Proxys (BungeeCord, Velocity,
// TCPShield) die Verbindung fallen.
async function zielFinden(roh, port, { aufloesen, srv = (n) => dns.promises.resolveSrv(n), oeffentlich = false } = {}) {
  const host = hostPruefen(roh);
  let ziel = { name: host, port };
  if (port === 25565 && !net.isIP(host) && host !== 'localhost' && host.includes('.')) {
    try {
      const s = (await srv(`_minecraft._tcp.${host}`)).sort((a, b) => a.priority - b.priority || b.weight - a.weight)[0];
      if (s && s.name && s.port) ziel = { name: String(s.name).replace(/\.$/, ''), port: s.port };
    } catch { /* kein SRV-Eintrag: direkt */ }
  }
  const ip = await adressePruefen(ziel.name, aufloesen, { oeffentlich });
  return { host, ip, port: ziel.port };
}

// Speicher für die Microsoft-Anmeldung, im Format von prismarine-auth –
// aber verschlüsselt (Windows DPAPI) in einer Datei statt lesbar im Ordner.
function kontoSpeicher({ datei, krypto }) {
  let alles = null;
  const lesen = () => {
    if (alles) return alles;
    try { alles = JSON.parse(krypto.entschluesseln(fs.readFileSync(datei, 'utf8'))) || {}; } catch { alles = {}; }
    return alles;
  };
  const schreiben = () => {
    fs.mkdirSync(path.dirname(datei), { recursive: true });
    fs.writeFileSync(datei, krypto.verschluesseln(JSON.stringify(alles)), 'utf8');
  };
  const fabrik = ({ cacheName }) => ({
    async reset() { lesen()[cacheName] = {}; schreiben(); return {}; },
    async getCached() { return lesen()[cacheName] || {}; },
    async setCached(wert) { lesen()[cacheName] = wert; schreiben(); },
    async setCachedPartial(wert) {
      const a = lesen();
      a[cacheName] = { ...(a[cacheName] || {}), ...wert };
      schreiben();
    },
  });
  fabrik.vorhanden = () => fs.existsSync(datei);
  fabrik.loeschen = () => {
    alles = {};
    try { fs.unlinkSync(datei); } catch { /* schon weg */ }
  };
  return fabrik;
}

// Derselbe Anmeldeweg wie in minecraft-protocol, damit der Bot die
// gespeicherte Anmeldung wiederfindet.
function kontoFluss(laden = () => require('prismarine-auth')) {
  return { flow: 'live', authTitle: laden().Titles.MinecraftNintendoSwitch, deviceType: 'Nintendo' };
}

// beiCode({ code, adresse, bisMs }): den Code zeigen, den der Nutzer auf
// microsoft.com/link eingibt. Liefert den Namen des Minecraft-Profils.
async function kontoAnmelden({ cache, beiCode, laden = () => require('prismarine-auth') }) {
  const { Authflow } = laden();
  const flow = new Authflow(KONTO_ID, cache, kontoFluss(laden), (r) => beiCode({
    code: r.user_code, adresse: r.verification_uri, bisMs: Date.now() + (r.expires_in || 900) * 1000,
  }));
  let profil;
  try {
    ({ profile: profil } = await flow.getMinecraftJavaToken({ fetchProfile: true }));
  } catch (e) {
    if (/not ?found|own|NOT_FOUND|404/i.test(String(e && e.message))) profil = null;
    else throw new Error(`Anmeldung fehlgeschlagen: ${e && e.message ? e.message : e}`);
  }
  if (!profil || profil.error || !profil.name) {
    if (cache.loeschen) cache.loeschen();
    throw new Error('Zu diesem Microsoft-Konto gibt es kein Minecraft Java. Julia braucht ein eigenes gekauftes Java-Konto.');
  }
  return { name: profil.name, id: profil.id };
}

function waffeWert(name, neuesKampfsystem = true) {
  const w = WAFFEN[name];
  if (!w) return 0;
  // Vor 1.9 machen Äxte weniger Schaden als Schwerter; bei Gleichstand gewinnt das Schwert.
  return neuesKampfsystem ? w[0] * w[1] : w[0] - (name.endsWith('_axe') ? 3.5 : 0);
}

function besteWaffe(items, neuesKampfsystem = true) {
  let beste = null;
  for (const it of items || []) {
    if (waffeWert(it.name, neuesKampfsystem) > (beste ? waffeWert(beste.name, neuesKampfsystem) : 0)) beste = it;
  }
  return beste;
}

// Ticks zwischen zwei Schlägen: seit 1.9 volle Aufladung abwarten, vorher
// einfach schnell klicken (etwa 7 pro Sekunde).
function schlagPause(waffe, neuesKampfsystem = true) {
  if (!neuesKampfsystem) return 3;
  const w = WAFFEN[waffe];
  return Math.ceil(20 / (w ? w[1] : 4));
}

function ruestungTeil(name) {
  const m = /^([a-z]+)_(helmet|chestplate|leggings|boots)$/.exec(String(name || ''));
  return m ? { platz: PLATZ[m[2]], wert: RUESTUNG[m[1]] || 0 } : null;
}

// Nur echte Verbesserungen gegenüber dem, was schon getragen wird.
function besteRuestung(items, getragen = {}) {
  const out = {};
  for (const it of items || []) {
    const r = ruestungTeil(it.name);
    if (!r) continue;
    const jetzt = out[r.platz] || getragen[r.platz];
    const jetztWert = jetzt ? (ruestungTeil(jetzt.name) || { wert: 0 }).wert : 0;
    if (r.wert > jetztWert) out[r.platz] = it;
  }
  for (const [platz, it] of Object.entries(out)) if (getragen[platz] === it) delete out[platz];
  return out;
}

function werkzeugArt(block) {
  const n = String(block || '');
  if (/(_log|_wood|_planks|_stem|_hyphae)$/.test(n)) return 'axe';
  if (/^(dirt|coarse_dirt|grass_block|sand|red_sand|gravel|clay|snow_block|snow|mud|soul_sand|soul_soil|podzol|mycelium|rooted_dirt)$/.test(n)) return 'shovel';
  return 'pickaxe';
}

function besteWerkzeug(items, art) {
  const muster = new RegExp(`^([a-z]+)_${art}$`);
  let beste = null;
  let besterWert = 0;
  for (const it of items || []) {
    const m = muster.exec(it.name);
    const w = m ? WERKZEUG[m[1]] || 0 : 0;
    if (w > besterWert) { beste = it; besterWert = w; }
  }
  return beste;
}

function blockNamen(wort, alleNamen) {
  const w = String(wort || '').trim().toLowerCase().replace(/\s+/g, '_');
  if (!w) return [];
  if (alleNamen.includes(w)) return [w];
  const muster = BLOCK_WOERTER[w];
  if (muster) return alleNamen.filter((n) => muster.some((m) => (m.startsWith('_') ? n.endsWith(m) : n === m)));
  return alleNamen.filter((n) => n.endsWith(`_${w}`));
}

function istFeind(e) {
  return !!e && e.type !== 'player' && e.isValid !== false && (e.type === 'hostile' || FEINDE.has(e.name));
}

// Chat geht auf den eigenen Server – trotzdem keine Befehle (/op, /give …)
// und keine Farb- oder Steuerzeichen.
function chatText(text) {
  const s = String(text ?? '').replace(/[\u0000-\u001f\u007f§]/g, ' ').replace(/\s+/g, ' ').trim().replace(/^\/+/, '').trim().slice(0, 250);
  if (!s) throw new Error('Leere Chatnachricht.');
  return s;
}

// Minecraft-Namen: 3–16 Zeichen, Buchstaben, Ziffern, Unterstrich.
function botName(wunsch, assistent) {
  for (const k of [wunsch, assistent]) {
    const s = String(k || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9_]/g, '').slice(0, 16);
    if (s.length >= 3) return s;
  }
  return 'Julia_Bot';
}

// Befehle im Spielchat: "!folge" oder mit Namen vorne ("Julia, komm her").
// Sie steuern nur die Spielfigur, nie etwas auf dem PC.
function befehlLesen(text, namen = []) {
  const roh = String(text || '').trim();
  const klein = roh.toLowerCase();
  let ab = -1;
  if (klein.startsWith('!')) ab = 1;
  else {
    const n = namen.filter(Boolean).map((x) => String(x).toLowerCase()).find((x) => klein.startsWith(x));
    if (n) ab = n.length;
  }
  if (ab < 0) return null;
  const rest = roh.slice(ab).replace(/^[\s,:!]+/, '').replace(/[.!?]+$/, '').trim();
  const s = rest.toLowerCase();
  if (/^(stopp?|halt|warte|hör auf|hoer auf)$/.test(s)) return { aufgabe: 'stopp' };
  if (/^(folg(e|en)?|folge mir|komm mit|follow( me)?)$/.test(s)) return { aufgabe: 'folgen' };
  if (/^(komm( her| zu mir)?|come( here)?)$/.test(s)) return { aufgabe: 'kommen' };
  if (/^(besch(ü|ue)tz(e)?( mich)?|hilf( mir)?|protect( me)?|guard)$/.test(s)) return { aufgabe: 'beschuetzen' };
  const k = /^(?:duell|k(?:ä|ae)mpf(?:e)?|kampf|fight|duel|pvp|attack|greif(?:e)? an)(?:\s+(?:gegen|mit|against|with))?(?:\s+([A-Za-z0-9_]{3,16}))?$/i.exec(rest);
  if (k) return { aufgabe: 'kaempfen', spieler: k[1] && !/^(mich|me)$/i.test(k[1]) ? k[1] : null };
  return null;
}

// Eine Frage an Julia im Spielchat: mit "!" oder ihrem Namen vorne
// ("Julia, wo finde ich Diamanten?"). Liefert den Text ohne Anrede.
function frageLesen(text, namen = []) {
  const roh = String(text || '').trim();
  const klein = roh.toLowerCase();
  let ab = -1;
  if (klein.startsWith('!')) ab = 1;
  else {
    const n = namen.filter(Boolean).map((x) => String(x).toLowerCase())
      .find((x) => klein.startsWith(x) && !/[\p{L}\p{N}_]/u.test(klein[x.length] || ''));
    if (n) ab = n.length;
  }
  if (ab < 0) return null;
  const rest = roh.slice(ab).replace(/^[\s,:!]+/, '').trim().slice(0, 250);
  return rest.length >= 2 ? rest : null;
}

// Antworten für den Spielchat: ohne Formatierung, in Stücken bis 240
// Zeichen, höchstens drei Nachrichten – der Rest wird mit … gekürzt.
function chatTeile(text, max = 3) {
  const s = String(text || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_`#>]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const teile = [];
  let rest = s;
  while (rest) {
    if (teile.length === max) {
      teile[max - 1] = `${teile[max - 1].slice(0, 236)} …`;
      break;
    }
    if (rest.length <= 240) { teile.push(rest); break; }
    let schnitt = Math.max(rest.lastIndexOf('. ', 240), rest.lastIndexOf('! ', 240), rest.lastIndexOf('? ', 240));
    if (schnitt < 80) schnitt = rest.lastIndexOf(' ', 240);
    if (schnitt < 40) schnitt = 239;
    teile.push(rest.slice(0, schnitt + 1).trim());
    rest = rest.slice(schnitt + 1).trim();
  }
  return teile;
}

function klartext(grund) {
  if (typeof grund === 'string') {
    try { return klartext(JSON.parse(grund)); } catch { return grund; }
  }
  if (grund && typeof grund === 'object') {
    return [grund.text || grund.translate || '', ...(grund.extra || []).map(klartext), ...(grund.with || []).map(klartext)].join(' ').trim();
  }
  return String(grund ?? '');
}

function rauswurfText(grund) {
  const t = klartext(grund).replace(/\s+/g, ' ').slice(0, 300);
  if (/verif|authenticat|unverified|premium|online.?mode/i.test(t)) {
    return 'Der Server verlangt ein Microsoft-Konto (online-mode=true). Julia loggt sich nie ein – stell in server.properties online-mode=false ein. Solche Server nur im Heimnetz betreiben, nie offen im Internet.';
  }
  if (/white.?list/i.test(t)) return 'Der Server hat eine Whitelist – trag die Spielfigur dort ein (/whitelist add NAME).';
  if (/outdated|incompatible|version/i.test(t)) return `Die Versionen passen nicht zusammen: ${t}`;
  return `Vom Server getrennt: ${t || 'ohne Grund'}`;
}

function fehlerText(e, server) {
  if (e && e.code === 'ECONNREFUSED') return `Unter ${server} läuft kein Minecraft-Server (Verbindung abgelehnt). Läuft der Server, und stimmt der Port?`;
  if (e && ['ETIMEDOUT', 'EHOSTUNREACH', 'ENETUNREACH'].includes(e.code)) return `${server} ist nicht erreichbar.`;
  if (e && (e.code === 'ECONNRESET' || /closed before the server sent/i.test(e.message || ''))) {
    return `${server} hat die Verbindung sofort getrennt – meist ein Schutz gegen Bots oder eine Minecraft-Version, die Julia noch nicht kennt.`;
  }
  return `Verbindung fehlgeschlagen: ${e && e.message ? e.message : e}`;
}

// --- Die Spielfigur ---

class Minecraft extends EventEmitter {
  constructor({ laden, aufloesen, srv } = {}) {
    super();
    this.laden = laden || (() => ({ mineflayer: require('mineflayer'), pf: require('mineflayer-pathfinder') }));
    this.aufloesen = aufloesen;
    this.srv = srv;
    this.bot = null;
    this.auftrag = null;
    this.chatVerlauf = [];
    this.ticks = 0;
    this.letzterSchlag = 0;
    this.pause = 5;
    this.jagt = null;
    this.isst = false;
  }

  get verbunden() {
    return !!(this.bot && this.bot.entity);
  }

  async verbinden({ adresse, port = 25565, botname, besitzer, assistent, version, oeffentlich = false, konto = null, stimme = false } = {}) {
    this.trennen();
    const p = Math.round(Number(port) || 25565);
    if (p < 1 || p > 65535) throw new Error('Der Port liegt zwischen 1 und 65535.');
    const ziel = await zielFinden(adresse, p, { aufloesen: this.aufloesen, srv: this.srv, oeffentlich });
    const ip = ziel.ip;
    const { mineflayer, pf } = this.laden();
    this.pf = pf;
    this.server = `${adresse}:${p}`;
    this.besitzer = besitzer || '';
    this.assistent = assistent || '';
    this.chatVerlauf = [];
    // Mit Konto: die verschlüsselt gespeicherte Anmeldung (wird bei Bedarf
    // still erneuert). Ohne: offline, nur für Server mit online-mode=false.
    const anmeldung = konto
      ? {
        auth: 'microsoft', username: KONTO_ID, profilesFolder: konto.cache, ...kontoFluss(),
        onMsaCode: () => { throw new Error(KONTO_NEU); },
      }
      : { auth: 'offline', username: botName(botname, assistent) };
    const bot = mineflayer.createBot({
      host: ziel.host, port: p, connect: (c) => c.setSocket(net.connect(ziel.port, ip)), ...anmeldung, version: version || false, hideErrors: true, logErrors: false, checkTimeoutInterval: 30000,
    });
    this.bot = bot;
    bot.on('error', (e) => { this.letzterFehler = e && e.message; }); // ohne Zuhörer würde ein Fehler die App beenden
    bot.loadPlugin(pf.pathfinder);
    try {
      await new Promise((ok, nein) => {
        const zeit = setTimeout(() => nein(new Error(`Keine Antwort von ${this.server} – läuft der Server, und stimmt der Port?`)), 25000);
        const ende = (f) => (x) => { clearTimeout(zeit); f(x); };
        bot.once('spawn', ende(ok));
        bot.once('kicked', ende((g) => nein(new Error(rauswurfText(g)))));
        bot.once('error', ende((e) => nein(new Error(fehlerText(e, this.server)))));
        bot.once('end', ende(() => nein(new Error(`Verbindung zu ${this.server} beendet.`))));
      });
    } catch (e) {
      this.trennen();
      throw e;
    }
    this._einrichten(bot);
    if (stimme) this._stimmeStarten(bot, ip);
    return this.status();
  }

  // Simple Voice Chat: zuhören (nur dem Besitzer) und mit Stimme antworten.
  _stimmeStarten(bot, ip) {
    const s = new Stimme({
      client: bot._client,
      host: ip,
      besitzerUuid: () => {
        const k = Object.keys(bot.players).find((n) => n.toLowerCase() === String(this.besitzer || '').toLowerCase());
        return k ? bot.players[k].uuid : null;
      },
    });
    s.on('sprache', (d) => this.emit('stimme', d));
    s.on('status', () => this.emit('stimmeStatus', s.status()));
    this.stimme = s;
    s.starten();
  }

  get stimmeAktiv() {
    return !!(this.stimme && this.stimme.verbunden);
  }

  stimmeSprechen(pcm) {
    if (!this.stimmeAktiv) return Promise.reject(new Error('Der Voice-Chat ist nicht verbunden.'));
    return this.stimme.sprechen(pcm);
  }

  _stimmeStoppen() {
    if (this.stimme) this.stimme.stoppen();
    this.stimme = null;
  }

  _einrichten(bot) {
    const bewegung = new this.pf.Movements(bot);
    bewegung.canDig = false; // beim Folgen und Kämpfen nichts von deinen Bauten abreißen
    bewegung.allowParkour = true;
    bot.pathfinder.setMovements(bewegung);
    const v = bot.registry && bot.registry.version;
    this.neuesKampfsystem = v && typeof v['>='] === 'function' ? v['>=']('1.9') : true;
    this.pause = schlagPause(null, this.neuesKampfsystem);
    bot.on('physicsTick', () => {
      this.ticks++;
      try { this._tick(); } catch (e) { this.letzterFehler = e.message; }
    });
    bot.on('chat', (von, text) => this._chat(von, text));
    bot.on('death', () => this._gestorben());
    bot.on('entityDead', (e) => this._tot(e));
    bot.on('kicked', (g) => { this.grund = rauswurfText(g); });
    bot.on('end', () => {
      if (this.bot !== bot) return; // selbst getrennt
      this.bot = null;
      this.auftrag = null;
      this._stimmeStoppen();
      this._melden('getrennt', this.grund || `Verbindung zu ${this.server} beendet.`);
      this.grund = null;
    });
  }

  trennen() {
    const bot = this.bot;
    this.bot = null;
    this.auftrag = null;
    this.jagt = null;
    this._stimmeStoppen();
    if (bot) {
      try { bot.quit(); } catch { /* schon weg */ }
    }
  }

  chat(text) {
    if (!this.verbunden) throw new Error('Julia ist mit keinem Minecraft-Server verbunden.');
    this.bot.chat(chatText(text));
    return 'Gesendet.';
  }

  aufgabe({ aufgabe: art, spieler, block, anzahl } = {}) {
    if (!this.verbunden) throw new Error('Julia ist mit keinem Minecraft-Server verbunden.');
    const bot = this.bot;
    const { GoalFollow, GoalNear } = this.pf.goals;
    const name = spieler || this.besitzer;
    const brauchtName = () => {
      if (!name) throw new Error('Mit wem? Nenn den Spielernamen oder trag deinen in den Einstellungen unter Minecraft ein.');
    };
    this._anhalten();
    switch (art) {
      case 'stopp':
        return 'Angehalten.';
      case 'folgen': {
        brauchtName();
        const e = this._spielerFigur(name);
        this.auftrag = { art, spieler: name, ziel: e };
        if (e) bot.pathfinder.setGoal(new GoalFollow(e, 2), true);
        return e ? `Ich folge ${e.username}.` : `Ich sehe ${name} gerade nicht – sobald du in der Nähe bist, folge ich.`;
      }
      case 'kommen': {
        brauchtName();
        const e = this._spielerFigur(name);
        if (!e) throw new Error(`Ich sehe ${name} gerade nicht. Komm näher, dann laufe ich los.`);
        this.auftrag = { art, spieler: name };
        bot.pathfinder.setGoal(new GoalNear(e.position.x, e.position.y, e.position.z, 1.5));
        return 'Bin unterwegs.';
      }
      case 'beschuetzen':
        brauchtName();
        this._ausruesten();
        this.auftrag = { art, spieler: name };
        return `Ich passe auf ${name} auf.`;
      case 'kaempfen':
        brauchtName();
        this._ausruesten();
        this.auftrag = { art, spieler: name, ab: this.ticks + 60 };
        return `Duell gegen ${name} – los in 3 Sekunden!`;
      case 'abbauen':
        return this._abbauen(block, anzahl);
      default:
        throw new Error(`Unbekannte Aufgabe "${art}".`);
    }
  }

  status() {
    if (!this.verbunden) return { verbunden: false };
    const bot = this.bot;
    const p = bot.entity.position;
    const spieler = Object.values(bot.players)
      .filter((s) => s.username !== bot.username)
      .map((s) => ({ name: s.username, abstand: s.entity ? Math.round(s.entity.position.distanceTo(p)) : null }));
    const feinde = {};
    for (const e of Object.values(bot.entities)) {
      if (istFeind(e) && e.position.distanceTo(p) < 24) feinde[e.name] = (feinde[e.name] || 0) + 1;
    }
    const inventar = {};
    for (const i of bot.inventory.items()) inventar[i.name] = (inventar[i.name] || 0) + i.count;
    const a = this.auftrag;
    return {
      verbunden: true,
      server: this.server,
      version: bot.version,
      name: bot.username,
      leben: Math.round(bot.health),
      hunger: Math.round(bot.food),
      position: { x: Math.round(p.x), y: Math.round(p.y), z: Math.round(p.z) },
      spielmodus: bot.game && bot.game.gameMode,
      aufgabe: a ? { art: a.art, spieler: a.spieler, block: a.block, geschafft: a.geschafft, ziel: a.anzahl } : null,
      spieler,
      feinde_nah: feinde,
      inventar: Object.fromEntries(Object.entries(inventar).slice(0, 24)),
      chat: this.chatVerlauf.slice(-10).map((c) => `${c.von}: ${c.text}`),
      stimme: this.stimme ? this.stimme.status() : { zustand: 'aus' },
    };
  }

  // --- intern ---

  _melden(art, text) {
    this.emit('ereignis', { art, text });
  }

  _spielerFigur(name) {
    if (!name || !this.bot) return null;
    const key = Object.keys(this.bot.players).find((n) => n.toLowerCase() === String(name).toLowerCase());
    return key ? this.bot.players[key].entity || null : null;
  }

  _anhalten() {
    this.auftrag = null;
    this.jagt = null;
    if (!this.bot) return;
    this.bot.pathfinder.setGoal(null);
    this.bot.clearControlStates();
  }

  _chat(von, text) {
    if (!this.bot || von === this.bot.username) return;
    this.chatVerlauf.push({ von, text: String(text).slice(0, 200) });
    if (this.chatVerlauf.length > 30) this.chatVerlauf.shift();
    // Ist ein Spielername eingetragen, hört die Figur nur auf diesen.
    if (this.besitzer && String(von).toLowerCase() !== this.besitzer.toLowerCase()) return;
    const namen = [this.bot.username, this.assistent];
    const b = befehlLesen(text, namen);
    if (b) {
      try {
        this.chat(this.aufgabe({ ...b, spieler: b.spieler || von }));
      } catch (e) {
        try { this.chat(e.message); } catch { /* getrennt */ }
      }
      return;
    }
    // Sonst eine Frage an Julia – nur von deinem eingetragenen Namen und
    // höchstens alle vier Sekunden (Kosten, Spam).
    const frage = frageLesen(text, namen);
    if (!frage || !this.besitzer) return;
    if (Date.now() - (this.letzteFrage || 0) < 4000) return;
    this.letzteFrage = Date.now();
    this.emit('frage', { von, text: frage });
  }

  // Antwort der KI in den Spielchat – in kleinen Stücken mit kurzer Pause,
  // damit der Spam-Schutz des Servers nicht anschlägt.
  async antworten(text) {
    const teile = chatTeile(text);
    for (let i = 0; i < teile.length; i++) {
      if (!this.verbunden) return;
      if (i) await new Promise((r) => setTimeout(r, 800));
      this.chat(teile[i]);
    }
  }

  _tick() {
    const bot = this.bot;
    if (!bot || !bot.entity || this.isst) return;
    const a = this.auftrag;
    // Hunger nebenbei stillen, nur nicht mitten im Duell.
    if (this.ticks % 100 === 0 && bot.food <= 14 && (!a || a.art !== 'kaempfen') && this._essen(ESSEN)) return;
    if (!a) return;
    const { GoalFollow } = this.pf.goals;
    if (a.art === 'folgen') {
      if (!a.ziel || a.ziel.isValid === false) {
        const e = this._spielerFigur(a.spieler);
        if (e) { a.ziel = e; bot.pathfinder.setGoal(new GoalFollow(e, 2), true); }
      }
    } else if (a.art === 'kommen') {
      const e = this._spielerFigur(a.spieler);
      if (!e || bot.entity.position.distanceTo(e.position) < 2.5) this._anhalten();
    } else if (a.art === 'kaempfen') {
      if (this.ticks < a.ab) return;
      const e = this._spielerFigur(a.spieler);
      if (e) this._kampf(e);
      else if (this.jagt !== null) this._kampfPause();
    } else if (a.art === 'beschuetzen') {
      const chef = this._spielerFigur(a.spieler);
      const mitte = chef ? chef.position : bot.entity.position;
      const feind = bot.nearestEntity((e) => istFeind(e) && e.position.distanceTo(mitte) < 12 && e.position.distanceTo(bot.entity.position) < 20);
      if (feind) {
        a.folgt = false;
        this._kampf(feind);
      } else if (!a.folgt && chef) {
        this._kampfPause();
        bot.pathfinder.setGoal(new GoalFollow(chef, 3), true);
        a.folgt = true;
      }
    }
  }

  // Ein Tick Kampf: hinlaufen, anvisieren, im richtigen Moment zuschlagen.
  _kampf(ziel) {
    const bot = this.bot;
    const { GoalFollow } = this.pf.goals;
    const d = bot.entity.position.distanceTo(ziel.position);
    const blick = bot.lookAt(ziel.position.offset(0, (ziel.height || 1.8) * 0.85, 0), true);
    if (blick && blick.catch) blick.catch(() => {});
    // Leben knapp: erst einen Goldapfel, wenn einer da ist.
    if (bot.health <= 8 && this._essen(HEILEN)) return;
    if (d > 3.4) {
      if (this.jagt !== ziel.id) {
        bot.clearControlStates();
        bot.pathfinder.setGoal(new GoalFollow(ziel, 1), true);
        this.jagt = ziel.id;
      }
      bot.setControlState('sprint', true);
      return;
    }
    if (this.jagt !== null) { bot.pathfinder.setGoal(null); this.jagt = null; }
    const seit = this.ticks - this.letzterSchlag;
    // Nah dran: selbst steuern – ran, seitlich pendeln, springen für kritische
    // Treffer. Sprint kurz loslassen nach dem Schlag gibt mehr Rückstoß.
    bot.setControlState('forward', d > 1.8);
    bot.setControlState('sprint', d > 1.8 && seit > 1);
    const links = Math.floor(this.ticks / 18) % 2 === 0;
    bot.setControlState('left', links);
    bot.setControlState('right', !links);
    bot.setControlState('jump', this.neuesKampfsystem && bot.entity.onGround && seit >= this.pause - 6 && d < 3.2);
    const faellt = !bot.entity.onGround && bot.entity.velocity.y < -0.05;
    if (d <= 3.0 && seit >= this.pause && (!this.neuesKampfsystem || faellt || seit >= this.pause + 5)) {
      bot.attack(ziel);
      this.letzterSchlag = this.ticks;
    }
  }

  _kampfPause() {
    this.jagt = null;
    this.bot.pathfinder.setGoal(null);
    this.bot.clearControlStates();
  }

  _tot(e) {
    const a = this.auftrag;
    if (!a || a.art !== 'kaempfen' || !e || e.type !== 'player') return;
    if (String(e.username || '').toLowerCase() !== String(a.spieler).toLowerCase()) return;
    this._anhalten();
    this._melden('sieg', `Duell gegen ${a.spieler} gewonnen.`);
    try { this.chat('GG!'); } catch { /* getrennt */ }
  }

  _gestorben() {
    const a = this.auftrag;
    this._anhalten();
    if (a && a.art === 'kaempfen') {
      this._melden('niederlage', `Duell gegen ${a.spieler} verloren.`);
      try { this.chat('GG – Revanche?'); } catch { /* getrennt */ }
    } else if (a) {
      this._melden('gestorben', 'Die Spielfigur ist gestorben, die Aufgabe ist beendet.');
    }
  }

  async _ausruesten() {
    const bot = this.bot;
    if (!bot) return;
    const items = bot.inventory.items();
    const waffe = besteWaffe(items, this.neuesKampfsystem);
    this.pause = schlagPause(waffe && waffe.name, this.neuesKampfsystem);
    const getragen = {};
    for (const [platz, slot] of Object.entries(PLATZ_SLOT)) getragen[platz] = bot.inventory.slots[slot] || null;
    try {
      if (waffe && (!bot.heldItem || bot.heldItem.name !== waffe.name)) await bot.equip(waffe, 'hand');
      for (const [platz, it] of Object.entries(besteRuestung(items, getragen))) await bot.equip(it, platz);
    } catch (e) {
      this.letzterFehler = e.message;
    }
  }

  _essen(liste) {
    const bot = this.bot;
    const items = bot.inventory.items();
    const it = liste.map((n) => items.find((i) => i.name === n)).find(Boolean);
    if (!it) return false;
    this.isst = true;
    bot.clearControlStates();
    (async () => {
      try {
        await bot.equip(it, 'hand');
        await bot.consume();
      } catch { /* satt oder unterbrochen */ } finally {
        this.isst = false;
        this._ausruesten();
      }
    })();
    return true;
  }

  _abbauen(block, anzahl) {
    const bot = this.bot;
    const namen = blockNamen(block, Object.keys(bot.registry.blocksByName));
    if (!namen.length) throw new Error(`Einen Block "${block}" kenne ich nicht. Englische Namen wie oak_log gehen immer.`);
    const ids = namen.map((n) => bot.registry.blocksByName[n].id);
    const ziel = Math.max(1, Math.min(64, Math.round(Number(anzahl) || 16)));
    const a = { art: 'abbauen', block, anzahl: ziel, geschafft: 0 };
    this.auftrag = a;
    const { GoalNear } = this.pf.goals;
    const unerreichbar = new Set();
    (async () => {
      while (this.auftrag === a && a.geschafft < ziel) {
        const pos = bot.findBlocks({ matching: ids, maxDistance: 48, count: 30 }).find((v) => !unerreichbar.has(v.toString()));
        if (!pos) break;
        try {
          await bot.pathfinder.goto(new GoalNear(pos.x, pos.y, pos.z, 3));
          if (this.auftrag !== a) break;
          const b = bot.blockAt(pos);
          if (!b || !ids.includes(b.type)) continue;
          const werkzeug = besteWerkzeug(bot.inventory.items(), werkzeugArt(b.name));
          if (werkzeug) await bot.equip(werkzeug, 'hand');
          await bot.dig(b);
          a.geschafft++;
          // Das Fallengelassene einsammeln.
          await new Promise((r) => setTimeout(r, 300));
          const drop = bot.nearestEntity((e) => e.name === 'item' && e.position.distanceTo(pos) < 5);
          if (drop && this.auftrag === a) await bot.pathfinder.goto(new GoalNear(drop.position.x, drop.position.y, drop.position.z, 0.5)).catch(() => {});
        } catch {
          if (this.auftrag !== a) break;
          unerreichbar.add(pos.toString());
        }
      }
    })().finally(() => {
      if (this.auftrag !== a) return;
      this.auftrag = null;
      this._melden('fertig', a.geschafft ? `${a.geschafft}× ${block} abgebaut.` : `Kein erreichbarer Block "${block}" in der Nähe.`);
    });
    return `Ich baue bis zu ${ziel}× ${block} ab.`;
  }
}

// --- Werkzeuge für das Modell ---

function gruen(beschreibung) {
  return { stufe: GRUEN, kategorie: null, grund: '', ...(beschreibung ? { beschreibung } : {}) };
}

function brauchtMinecraft(ctx) {
  if (!ctx.minecraft) throw new Error('Minecraft ist hier nicht verfügbar.');
  return ctx.minecraft;
}

function fremd(quelle, text) {
  return require('./hilfen').fremd(quelle, text);
}

// Wohin? Was im Minecraft-Reiter steht, hat der Nutzer selbst eingetragen –
// nur dorthin darf es auch ein Server im Internet sein.
function zielVon(e, ctx) {
  const c = (ctx && ctx.config && ctx.config.get('minecraft')) || {};
  const { host, port } = adresseTeilen(e.adresse || c.adresse, e.port || c.port);
  const eingetragen = !!c.adresse && host.toLowerCase() === String(c.adresse).toLowerCase();
  return { c, host, port, eingetragen };
}

const WERKZEUGE = [
  {
    name: 'minecraft_verbinden',
    fremd: true,
    description: 'Als eigene Spielfigur einem Minecraft-Server (Java Edition) beitreten, um mit dem Nutzer zu spielen. Ohne Angaben gilt, was im Minecraft-Reiter steht (sonst localhost:25565); ist dort ein Minecraft-Konto verbunden, spielt die Figur damit. Server im Internet nur, wenn der Nutzer die Adresse selbst im Reiter eingetragen hat; große öffentliche Netzwerke (Hypixel usw.) nie.',
    input_schema: {
      type: 'object',
      properties: {
        adresse: { type: 'string', description: 'z. B. localhost oder 192.168.1.20, auch mit :Port' },
        port: { type: 'number' },
        spieler: { type: 'string', description: 'Spielername des Nutzers in Minecraft' },
        botname: { type: 'string', description: 'Name der eigenen Spielfigur, 3–16 Zeichen' },
      },
    },
    einstufen(e, ctx) {
      const z = zielVon(e, ctx);
      if (GROSSE_NETZWERKE.test(z.host)) return { stufe: ROT, kategorie: null, grund: GROSSES_NETZWERK };
      if (net.isIP(z.host) && !intern(z.host) && !z.eingetragen) return { stufe: ROT, kategorie: null, grund: FREMDER_SERVER };
      return gruen(`Minecraft-Server ${z.host}:${z.port} beitreten`);
    },
    async ausfuehren(e, ctx) {
      const mc = brauchtMinecraft(ctx);
      const z = zielVon(e, ctx);
      const s = await mc.verbinden({
        adresse: z.host,
        port: z.port,
        botname: e.botname || z.c.botname,
        besitzer: e.spieler || z.c.spieler,
        assistent: ctx.config.get('assistent.name'),
        oeffentlich: z.eingetragen,
        konto: ctx.minecraftKonto ? ctx.minecraftKonto() : null,
        stimme: z.c.stimme !== false,
      });
      return `Verbunden als ${s.name} (Minecraft ${s.version}). Die Spielfigur hört im Spiel auf !folge, !komm, !beschütze mich, !duell und !stopp.\n${fremd('dem Minecraft-Server', JSON.stringify(s))}`;
    },
  },
  {
    name: 'minecraft_aufgabe',
    description: 'Der eigenen Spielfigur in Minecraft eine Aufgabe geben; sie läuft danach selbstständig in Echtzeit. folgen: dem Spieler hinterher. kommen: zum Spieler laufen. beschuetzen: Monster in der Nähe des Spielers bekämpfen. kaempfen: Duell gegen einen Spieler – nur, wenn der Nutzer das will; Waffe und Rüstung legt die Figur selbst an. abbauen: Blöcke abbauen und einsammeln (block z. B. oak_log, stone, iron_ore oder holz, stein, eisen, kohle, diamant; anzahl bis 64). stopp: alles anhalten. Ohne spieler gilt der Spielername aus den Einstellungen.',
    input_schema: {
      type: 'object',
      properties: {
        aufgabe: { type: 'string', enum: ['folgen', 'kommen', 'beschuetzen', 'kaempfen', 'abbauen', 'stopp'] },
        spieler: { type: 'string' },
        block: { type: 'string' },
        anzahl: { type: 'number' },
      },
      required: ['aufgabe'],
    },
    einstufen: () => gruen(),
    async ausfuehren(e, ctx) {
      const mc = brauchtMinecraft(ctx);
      const text = mc.aufgabe(e);
      if (e.aufgabe === 'kaempfen') try { mc.chat(text); } catch { /* egal */ }
      return text;
    },
  },
  {
    name: 'minecraft_chat',
    description: 'Eine Nachricht in den Minecraft-Chat schreiben. Keine Befehle mit /.',
    input_schema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
    nachAussen: () => true,
    einstufen: (e) => gruen(`In den Minecraft-Chat schreiben: ${String(e.text || '').slice(0, 250)}`),
    async ausfuehren(e, ctx) {
      return brauchtMinecraft(ctx).chat(e.text);
    },
  },
  {
    name: 'minecraft_status',
    fremd: true,
    description: 'Wie es der Spielfigur in Minecraft geht: Leben, Hunger, Position, Aufgabe, Spieler und Monster in der Nähe, Inventar, letzte Chatzeilen.',
    input_schema: { type: 'object', properties: {} },
    einstufen: () => gruen(),
    async ausfuehren(_e, ctx) {
      return fremd('dem Minecraft-Server', JSON.stringify(brauchtMinecraft(ctx).status()));
    },
  },
  {
    name: 'minecraft_trennen',
    description: 'Die Spielfigur verlässt den Minecraft-Server.',
    input_schema: { type: 'object', properties: {} },
    einstufen: () => gruen(),
    async ausfuehren(_e, ctx) {
      const mc = brauchtMinecraft(ctx);
      const war = mc.verbunden;
      mc.trennen();
      return war ? 'Server verlassen.' : 'War mit keinem Server verbunden.';
    },
  },
];

module.exports = {
  Minecraft, WERKZEUGE, GROSSE_NETZWERKE,
  kontoSpeicher, kontoAnmelden,
  adresseTeilen, adressePruefen, zielFinden, besteWaffe, schlagPause, besteRuestung, werkzeugArt, besteWerkzeug, blockNamen,
  istFeind, chatText, botName, befehlLesen, rauswurfText, frageLesen, chatTeile,
};
