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

// Blöcke, in die man nicht hineinlaufen sollte – für die Gefahrenerkennung
// direkt vor der Figur (schnell reagieren, ohne erst die KI zu fragen).
const GEFAHR_VORAUS = {
  lava: 'Lava', fire: 'Feuer', soul_fire: 'Seelenfeuer', magma_block: 'Magmablock',
  cactus: 'Kaktus', sweet_berry_bush: 'Süßbeeren', wither_rose: 'Witherrose',
  powder_snow: 'Pulverschnee', campfire: 'Lagerfeuer', soul_campfire: 'Seelenlagerfeuer',
};

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

// Deutsche Wörter für Gegenstände (geben, herstellen); sonst gilt der englische Name.
const ITEM_WOERTER = {
  holz: ['_log'], bretter: ['_planks'], brett: ['_planks'], stock: ['stick'], stoecke: ['stick'], stöcke: ['stick'],
  fackel: ['torch'], werkbank: ['crafting_table'], ofen: ['furnace'], truhe: ['chest'], bett: ['_bed'], leiter: ['ladder'],
  brot: ['bread'], steak: ['cooked_beef'], fleisch: ['cooked_beef', 'cooked_porkchop', 'cooked_mutton', 'cooked_chicken', 'beef', 'porkchop'],
  apfel: ['apple'], goldapfel: ['golden_apple'], karotte: ['carrot'], kartoffel: ['baked_potato', 'potato'], essen: ESSEN,
  eisen: ['iron_ingot'], gold: ['gold_ingot'], diamant: ['diamond'], diamanten: ['diamond'], kohle: ['coal', 'charcoal'], smaragd: ['emerald'],
  stein: ['cobblestone', 'stone'], bruchstein: ['cobblestone'], erde: ['dirt'], sand: ['sand'], glas: ['glass'], wolle: ['_wool'],
  pfeil: ['arrow'], bogen: ['bow'], schild: ['shield'], eimer: ['bucket'], boot: ['_boat'],
  schwert: ['_sword'], spitzhacke: ['_pickaxe'], axt: ['_axe'], schaufel: ['_shovel'], hacke: ['_hoe'],
};

// Tiere, die Essen geben – nur die jagt die Figur.
const TIERE = new Set(['cow', 'pig', 'chicken', 'sheep', 'rabbit', 'mooshroom']);
const TIER_WOERTER = { kuh: 'cow', kuehe: 'cow', kühe: 'cow', schwein: 'pig', schweine: 'pig', huhn: 'chicken', huehner: 'chicken', hühner: 'chicken', schaf: 'sheep', schafe: 'sheep', hase: 'rabbit', hasen: 'rabbit', kaninchen: 'rabbit', pilzkuh: 'mooshroom' };
// Das behält die Figur beim Einräumen: Waffen, Werkzeug, Rüstung, Essen, Fackeln.
const BEHALTEN = /_(sword|axe|pickaxe|shovel|hoe|helmet|chestplate|leggings|boots)$|^(shield|bow|crossbow|trident|arrow|torch)$/;
const HILFE = 'Befehle: !folge · !komm · !beschütze mich · !duell · !stopp · !geh X Y Z · !gib 5 brot · !sammel · !jag 3 kuh · !craft 4 fackel · !bau ab holz 10 · !schmelz 8 eisen · !stell werkbank hin · !ess · !verstau · !schlaf';
// Brennstoff für den Ofen: Name (oder Endung) und wie viele Dinge eins schafft.
const BRENNSTOFF = [['coal', 8], ['charcoal', 8], ['_planks', 1.5], ['_log', 1.5], ['stick', 0.5]];
// Was die Figur beim Umsehen meldet.
const UMSEHEN = {
  holz: (n) => n.endsWith('_log'),
  stein: (n) => n === 'stone' || n === 'cobblestone',
  kohle: (n) => n.endsWith('coal_ore'),
  eisen: (n) => n.endsWith('iron_ore'),
  kupfer: (n) => n.endsWith('copper_ore'),
  gold: (n) => n.endsWith('gold_ore'),
  redstone: (n) => n.endsWith('redstone_ore'),
  diamant: (n) => n.endsWith('diamond_ore'),
  smaragd: (n) => n.endsWith('emerald_ore'),
  obsidian: (n) => n === 'obsidian',
  wasser: (n) => n === 'water',
  lava: (n) => n === 'lava',
  werkbank: (n) => n === 'crafting_table',
  ofen: (n) => n === 'furnace' || n === 'blast_furnace' || n === 'smoker',
  truhe: (n) => n === 'chest' || n === 'barrel',
  bett: (n) => n.endsWith('_bed'),
};
const DAUERHAFT = ['folgen', 'beschuetzen', 'kaempfen'];

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

// Wie blockNamen, für Gegenstände; verzeiht die Mehrzahl ("fackeln", "brote").
function itemNamen(wort, alleNamen) {
  const w = String(wort || '').trim().toLowerCase().replace(/\s+/g, '_');
  if (!w) return [];
  for (const v of [w, w.replace(/(en|n|e|s)$/, ''), w.replace(/n$/, '')]) {
    if (!v) continue;
    if (alleNamen.includes(v)) return [v];
    const muster = ITEM_WOERTER[v] || BLOCK_WOERTER[v];
    if (muster) {
      const treffer = alleNamen.filter((n) => muster.some((m) => (m.startsWith('_') ? n.endsWith(m) : n === m)));
      if (treffer.length) return muster.some((m) => m.startsWith('_')) ? treffer : muster.filter((m) => treffer.includes(m));
    }
  }
  return alleNamen.filter((n) => n.endsWith(`_${w}`));
}

// Koordinaten prüfen: ganze Zahlen innerhalb der Welt; y darf fehlen.
function ortLesen({ x, y, z } = {}) {
  const zahl = (v, max) => {
    const n = Number(v);
    if (!Number.isFinite(n) || Math.abs(n) > max) throw new Error('Das sind keine gültigen Koordinaten – z. B. !geh 100 64 -20.');
    return Math.round(n);
  };
  const ort = { x: zahl(x, 3e7), z: zahl(z, 3e7) };
  if (y !== undefined && y !== null && y !== '') {
    ort.y = zahl(y, 400);
    if (ort.y < -64 || ort.y > 320) throw new Error('Die Höhe liegt zwischen -64 und 320.');
  }
  return ort;
}

const ortText = (o) => (o.y == null ? `${o.x} / ${o.z}` : `${o.x} / ${o.y} / ${o.z}`);

// "5 brot", "brot 5", "ein brot" → { anzahl, sache }
function mengeLesen(roh) {
  const r = String(roh || '').trim().replace(/^(ein|eine|einen|a|an)\s+/i, '');
  let m = /^(\d{1,3})\s*(?:x|stück|stueck)?\s+(.+)$/i.exec(r);
  if (m) return { anzahl: Number(m[1]), sache: m[2].trim() };
  m = /^(.+?)\s+(\d{1,3})$/.exec(r);
  if (m) return { anzahl: Number(m[2]), sache: m[1].trim() };
  return { anzahl: null, sache: r };
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
  if (/^(hilfe|help|befehle|commands|\?)$/.test(s)) return { aufgabe: 'hilfe' };
  if (/^(sammel|sammle|einsammeln|aufheben|heb auf|pick ?up|collect)( alles| das| ein| auf)*$/.test(s)) return { aufgabe: 'sammeln' };
  if (/^(schlaf(en)?|geh schlafen|ins bett|sleep|bed)$/.test(s)) return { aufgabe: 'schlafen' };
  if (/^(verstau(e|en)?|r(ä|ae)um( das inventar)? ein|einr(ä|ae)umen|store|stash)( alles)?( in die truhe)?$/.test(s)) return { aufgabe: 'verstauen' };
  const g = /^(?:geh|gehe|lauf|laufe|go|goto)(?:\s+(?:zu|nach|to))?\s+(-?\d+)\s+(-?\d+)(?:\s+(-?\d+))?$/.exec(s);
  if (g) return g[3] !== undefined ? { aufgabe: 'gehen', x: Number(g[1]), y: Number(g[2]), z: Number(g[3]) } : { aufgabe: 'gehen', x: Number(g[1]), z: Number(g[2]) };
  const j = /^(?:jag|jage|jagen|hunt)(?:\s+(\d{1,2}))?(?:\s+([a-zäöüß_]+))?(?:\s+(\d{1,2}))?$/.exec(s);
  if (j) return { aufgabe: 'jagen', anzahl: Number(j[1] || j[3]) || null, tier: j[2] || null };
  const abbau = /^(?:bau(?:e)?\s+ab|abbauen|mine|hack(?:e)?)\s+(.+)$/.exec(s);
  if (abbau) { const m = mengeLesen(abbau[1]); return { aufgabe: 'abbauen', block: m.sache, anzahl: m.anzahl }; }
  const gib = /^(?:gib|gebe|give)(?:\s+(?:mir|me))?\s+(.+)$/.exec(s);
  if (gib) { const m = mengeLesen(gib[1]); return { aufgabe: 'geben', item: m.sache, anzahl: m.anzahl }; }
  if (/^(ess|iss|essen|eat)( was| etwas)?$/.test(s)) return { aufgabe: 'essen' };
  const schm = /^(?:schmelz(?:e)?|brat(?:e)?|smelt|cook)\s+(.+)$/.exec(s);
  if (schm) { const m = mengeLesen(schm[1]); return { aufgabe: 'schmelzen', item: m.sache, anzahl: m.anzahl }; }
  const hin = /^(?:stell(?:e)?\s+(.+?)\s+hin|platzier(?:e)?\s+(.+)|place\s+(.+))$/.exec(s);
  if (hin) return { aufgabe: 'platzieren', item: (hin[1] || hin[2] || hin[3]).replace(/^(ein(e|en)?|die|den|das|a|an)\s+/, '') };
  const nimm = /^(?:nimm|r(?:ü|ue)st(?:e)?|equip)\s+(?:(?:dein(?:e|en)?|die|den|das)\s+)?(.+?)(?:\s+aus)?$/.exec(s);
  if (nimm) return { aufgabe: 'ausruesten', item: nimm[1] };
  const cr = /^(?:craft(?:e)?|herstellen|stell(?:e)?(?:\s+mir)?|mach(?:e)?\s+mir)\s+(.+?)(?:\s+her)?$/.exec(s);
  if (cr) { const m = mengeLesen(cr[1]); return { aufgabe: 'herstellen', item: m.sache, anzahl: m.anzahl }; }
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
  if (/fly(ing)?\b.*(not|nicht)|kicked for flying|fliegen/i.test(t)) return 'Rausgeworfen wegen „Fliegen“ – meist schlägt der Anti-Cheat bei Bots an. Auf eigenen Servern hilft allow-flight=true in server.properties.';
  if (/\bbann?ed\b|gebannt|gesperrt/i.test(t)) return `Die Spielfigur ist auf diesem Server gebannt: ${t}`;
  if (/too many packets|spam|flood|zu schnell/i.test(t)) return 'Der Spam-Schutz des Servers hat die Figur rausgeworfen (zu viele Nachrichten oder Aktionen).';
  if (/logged in from another location|duplicate.?login|anderen ort|already connected|bereits (verbunden|online)/i.test(t)) return 'Mit demselben Konto hat sich jemand anderes angemeldet – Julia braucht ein eigenes Minecraft-Konto.';
  if (/timed? ?out|keep.?alive|zeitüberschreitung/i.test(t)) return 'Der Server hat keine Antwort mehr bekommen (Zeitüberschreitung).';
  if (/server (closed|is restarting|stopp)|shutting down|restart|neustart|wird neu gestartet/i.test(t)) return 'Der Server wurde beendet oder neu gestartet.';
  if (/kicked by an? (operator|admin)|you (have been|were) kicked/i.test(t)) return `Ein Admin hat die Figur rausgeworfen${t ? `: ${t}` : '.'}`;
  if (/white.?list/i.test(t)) return 'Der Server hat eine Whitelist – trag die Spielfigur dort ein (/whitelist add NAME).';
  if (/outdated|incompatible|version/i.test(t)) return `Die Versionen passen nicht zusammen: ${t}`;
  return `Vom Server getrennt: ${t || 'ohne Grund'}`;
}

// Verbindung ohne Rauswurf zu Ende: mineflayer nennt einen kurzen Grund
// ("socketClosed", "keepAliveError"), dazu kommt der letzte Fehler.
function endeText(grund, fehler, server) {
  const g = String(grund || '');
  const f = String(fehler || '');
  if (/keep.?alive|timeout|timed out/i.test(g) || /ETIMEDOUT|timed out/i.test(f)) return `${server} hat nicht mehr geantwortet (Zeitüberschreitung).`;
  if (/ECONNRESET/i.test(f)) return `${server} hat die Verbindung abrupt getrennt.`;
  if (!g || /socketClosed|^end$/i.test(g)) return `Die Verbindung zu ${server} ist abgebrochen.`;
  return `Die Verbindung zu ${server} wurde beendet (${g}).`;
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
  // wiederPausen: Wartezeiten vor den automatischen Wiederversuchen (ms).
  constructor({ laden, aufloesen, srv, wiederPausen = [5000, 15000, 30000] } = {}) {
    super();
    this.wiederPausen = wiederPausen;
    this.trennung = null; // warum die Figur zuletzt vom Server geflogen ist
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

  // gruppe: { name, passwort } – dieser Voice-Chat-Gruppe von selbst beitreten.
  async verbinden({ adresse, port = 25565, botname, besitzer, assistent, version, oeffentlich = false, konto = null, stimme = false, gruppe = null } = {}) {
    clearTimeout(this.wiederTimer);
    this._botWeg();
    this.letzteOptionen = { adresse, port, botname, besitzer, assistent, version, oeffentlich, konto, stimme, gruppe };
    this.autoGruppe = gruppe;
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
      this._botWeg();
      throw e;
    }
    this.trennung = null;
    this.verbundenSeit = Date.now();
    this.letzterFehler = null;
    this._einrichten(bot);
    if (stimme) this._stimmeStarten(bot, ip);
    return this.status();
  }

  // Simple Voice Chat: zuhören (nur dem Besitzer) und mit Stimme antworten.
  _stimmeStarten(bot, ip) {
    const s = new Stimme({
      client: bot._client,
      host: ip,
      gruppe: this.autoGruppe,
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

  stimmeGruppeBeitreten(id, passwort) {
    if (!this.stimmeAktiv) throw new Error('Der Voice-Chat ist nicht verbunden – ohne ihn gibt es keine Gruppen.');
    return this.stimme.gruppeBeitreten(id, passwort);
  }

  stimmeGruppeVerlassen() {
    if (!this.stimmeAktiv) throw new Error('Der Voice-Chat ist nicht verbunden.');
    this.stimme.gruppeVerlassen();
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
    // Wegsuche in kleinen Happen (Standard: 40 ms je Tick) – sonst stockt
    // Julia neben dem Spiel.
    bot.pathfinder.tickTimeout = 10;
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
    // Unerwartet weg: für den Crash-Screen merken, warum. Nur die Verbindung
    // verloren (kein Rauswurf)? Dann versucht die Figur selbst, zurückzukommen.
    bot.on('end', (grund) => {
      if (this.bot !== bot) return; // selbst getrennt
      const a = this.auftrag;
      this.bot = null;
      this.auftrag = null;
      this.jagt = null;
      this._stimmeStoppen();
      const rauswurf = !!this.grund;
      const text = this.grund || endeText(grund, this.letzterFehler, this.server);
      this.trennung = {
        zeit: Date.now(), grund: text, rauswurf, server: this.server,
        dauerS: Math.max(0, Math.round((Date.now() - (this.verbundenSeit || Date.now())) / 1000)),
        aufgabe: a ? a.art : null, fehler: this.letzterFehler || null, versuch: 0, naechsterVersuch: null, aufgegeben: false,
      };
      this.grund = null;
      this._melden('getrennt', text);
      if (!rauswurf) this._wiederVerbinden();
    });
  }

  // Server verlassen, weil du es willst – kein Crash-Screen, kein Wiederversuch.
  trennen() {
    clearTimeout(this.wiederTimer);
    this.trennung = null;
    this._botWeg();
  }

  trennungVergessen() {
    clearTimeout(this.wiederTimer);
    this.trennung = null;
  }

  _botWeg() {
    const bot = this.bot;
    this.bot = null;
    this.auftrag = null;
    this.jagt = null;
    this._stimmeStoppen();
    if (bot) {
      try { bot.quit(); } catch { /* schon weg */ }
    }
  }

  _wiederVerbinden() {
    const t = this.trennung;
    if (!t || !this.letzteOptionen) return;
    if (t.versuch >= this.wiederPausen.length) {
      t.naechsterVersuch = null;
      t.aufgegeben = true;
      this.emit('geaendert');
      return;
    }
    const warte = this.wiederPausen[t.versuch];
    t.versuch += 1;
    t.naechsterVersuch = Date.now() + warte;
    this.emit('geaendert');
    clearTimeout(this.wiederTimer);
    this.wiederTimer = setTimeout(async () => {
      if (this.trennung !== t || this.bot) return;
      t.naechsterVersuch = null;
      try {
        await this.verbinden(this.letzteOptionen);
        this._melden('zurueck', `Wieder da auf ${this.server}.`);
      } catch (e) {
        if (this.bot) return;
        this.trennung = t;
        t.fehler = e.message;
        this._wiederVerbinden();
      }
    }, warte);
    if (this.wiederTimer.unref) this.wiederTimer.unref();
  }

  chat(text) {
    if (!this.verbunden) throw new Error('Julia ist mit keinem Minecraft-Server verbunden.');
    this.bot.chat(chatText(text));
    return 'Gesendet.';
  }

  aufgabe({ aufgabe: art, spieler, block, anzahl, item, x, y, z, tier } = {}) {
    if (!this.verbunden) throw new Error('Julia ist mit keinem Minecraft-Server verbunden.');
    if (art === 'hilfe') return HILFE; // hält nichts an
    const bot = this.bot;
    const { GoalFollow, GoalNear } = this.pf.goals;
    const name = spieler || this.besitzer;
    const brauchtName = () => {
      if (!name) throw new Error('Mit wem? Nenn den Spielernamen oder trag deinen in den Einstellungen unter Minecraft ein.');
    };
    // Erst prüfen, dann anhalten – ein Tippfehler soll nichts abbrechen.
    const ort = art === 'gehen' ? ortLesen({ x, y, z }) : null;
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
      case 'gehen':
        return this._gehen(ort);
      case 'geben':
        brauchtName();
        return this._geben(item || block, anzahl, name);
      case 'sammeln':
        return this._sammeln();
      case 'schlafen':
        return this._schlafen();
      case 'jagen':
        return this._jagen(tier, anzahl);
      case 'herstellen':
        return this._herstellen(item || block, anzahl);
      case 'verstauen':
        return this._verstauen();
      case 'schmelzen':
        return this._schmelzen(item || block, anzahl);
      case 'platzieren':
        return this._platzieren(item || block);
      case 'ausruesten':
        return this._ausruestenMit(item || block);
      case 'essen':
        if (bot.food >= 20) return 'Ich bin satt.';
        if (!this._essen([...ESSEN, ...HEILEN])) throw new Error('Ich habe nichts zu essen dabei.');
        return 'Ich esse etwas.';
      default:
        throw new Error(`Unbekannte Aufgabe "${art}".`);
    }
  }

  status() {
    if (!this.verbunden) return { verbunden: false, trennung: this.trennung ? { ...this.trennung } : null };
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
      aufgabe: a ? { art: a.art, spieler: a.spieler, block: a.block || a.item, geschafft: a.geschafft, ziel: a.anzahl, ort: a.ort } : null,
      spieler,
      feinde_nah: feinde,
      inventar: Object.fromEntries(Object.entries(inventar).slice(0, 24)),
      chat: this.chatVerlauf.slice(-10).map((c) => `${c.von}: ${c.text}`),
      stimme: this.stimme ? this.stimme.status() : { zustand: 'aus' },
    };
  }

  // --- intern ---

  _melden(art, text) {
    this.letzteMeldung = { art, text, zeit: Date.now() };
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
    this._gefahrWache();
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
    } else if (a.art === 'jagen') {
      let ziel = a.zielId != null ? bot.entities[a.zielId] : null;
      if (!ziel || ziel.isValid === false) {
        ziel = bot.nearestEntity((e) => a.tiere.includes(e.name) && e.position.distanceTo(bot.entity.position) < 32);
        a.zielId = ziel ? ziel.id : null;
      }
      if (!ziel || this.ticks > a.bis) {
        this._kampfPause();
        if (a.geschafft) this._jagdEnde(a);
        else this._fertig(a, 'Hier sind keine Tiere zum Jagen.');
        return;
      }
      this._kampf(ziel);
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
    // Gefahr voraus (Lava, Abgrund): nicht weiter vorlaufen, nur noch schlagen.
    const eingefroren = this.ticks < (this.gefahrStopp || 0);
    if (eingefroren) { bot.setControlState('forward', false); bot.setControlState('sprint', false); }
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
    if (a && a.art === 'jagen' && e && e.id === a.zielId) {
      a.geschafft += 1;
      a.zielId = null;
      if (a.geschafft >= a.anzahl) { this._kampfPause(); this._jagdEnde(a); }
      return;
    }
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

  // Blickrichtung waagerecht als Vektor (yaw 0 zeigt nach -Z).
  _vorne() {
    const { Vec3 } = require('vec3');
    const yaw = this.bot.entity.yaw || 0;
    return new Vec3(-Math.sin(yaw), 0, -Math.cos(yaw));
  }

  // Gefahr direkt vor der Figur: Lava, Feuer & Co. auf Fuß-, Kopf- oder
  // Bodenhöhe, oder ein Abgrund (vor den Füßen und mehrere Blöcke darunter frei).
  _gefahrVoraus() {
    const bot = this.bot;
    if (!bot || !bot.entity) return null;
    const vor = this._vorne();
    const fuss = bot.entity.position.offset(vor.x, 0.2, vor.z).floored();
    for (const v of [fuss, fuss.offset(0, 1, 0), fuss.offset(0, -1, 0)]) {
      const b = bot.blockAt(v);
      if (b && GEFAHR_VORAUS[b.name]) return { art: GEFAHR_VORAUS[b.name], block: b.name, ort: { x: v.x, y: v.y, z: v.z } };
    }
    const frei = (v) => { const b = bot.blockAt(v); return !!b && b.boundingBox === 'empty' && b.name !== 'water'; };
    if ([0, -1, -2, -3].every((dy) => frei(fuss.offset(0, dy, 0)))) {
      return { art: 'Abgrund', block: null, ort: { x: fuss.x, y: fuss.y, z: fuss.z } };
    }
    return null;
  }

  // Was liegt vor mir? Für die KI (umsehen) – Block in Blickrichtung, was sie
  // gerade anschaut, das nächste Wesen voraus und eine etwaige Gefahr.
  _voraus() {
    const bot = this.bot;
    const vor = this._vorne();
    const fuss = bot.entity.position.offset(vor.x, 0.2, vor.z).floored();
    const name = (v) => { const b = bot.blockAt(v); return b ? b.name : null; };
    let angeschaut = null;
    try {
      const b = bot.blockAtCursor ? bot.blockAtCursor(5) : null;
      if (b) angeschaut = { block: b.name, ort: { x: b.position.x, y: b.position.y, z: b.position.z } };
    } catch { /* nichts in Reichweite */ }
    let wesen = null;
    const p = bot.entity.position;
    if (bot.nearestEntity) {
      const e = bot.nearestEntity((x) => x.position && x.position.distanceTo(p) < 6 && vor.dot(x.position.minus(p).normalize()) > 0.6);
      if (e) wesen = { was: e.name || e.username || 'etwas', feind: istFeind(e), abstand: Math.round(e.position.distanceTo(p)) };
    }
    return {
      schaut_auf: angeschaut,
      vor_fuessen: name(fuss),
      ueber_kopf_vorn: name(fuss.offset(0, 1, 0)),
      boden_vorn: name(fuss.offset(0, -1, 0)),
      wesen_voraus: wesen,
      gefahr: this._gefahrVoraus(),
    };
  }

  // Läuft die Figur selbst (Kampf) oder per Wegsuche vorwärts und liegt Gefahr
  // direkt voraus, sofort bremsen und einmal warnen – schneller als über die KI.
  _gefahrWache() {
    const bot = this.bot;
    const selbst = bot.getControlState && (bot.getControlState('forward') || bot.getControlState('sprint'));
    const wegsuche = bot.pathfinder && bot.pathfinder.isMoving && bot.pathfinder.isMoving();
    if (this.ticks % 5 === 0 && (selbst || wegsuche)) {
      const g = this._gefahrVoraus();
      if (g) {
        this.gefahrStopp = this.ticks + 15;
        if (this.ticks - (this.letzteGefahrMeldung || -1000) > 100) {
          this.letzteGefahrMeldung = this.ticks;
          this._melden('gefahr', `Vorsicht, ${g.art} direkt vor mir – ich halte an.`);
        }
      }
    }
    if (this.ticks < (this.gefahrStopp || 0) && bot.setControlState) {
      bot.setControlState('forward', false);
      bot.setControlState('sprint', false);
    }
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

  // Aufgabe erledigt (oder gescheitert): melden und im Spiel Bescheid sagen.
  _fertig(a, text) {
    if (this.auftrag !== a) return;
    this.auftrag = null;
    this._melden('fertig', text);
    try { this.chat(text); } catch { /* getrennt */ }
  }

  _gehen(ort) {
    const { GoalNear, GoalXZ } = this.pf.goals;
    const a = { art: 'gehen', ort: ortText(ort) };
    this.auftrag = a;
    const ziel = ort.y == null ? new GoalXZ(ort.x, ort.z) : new GoalNear(ort.x, ort.y, ort.z, 1);
    this.bot.pathfinder.goto(ziel).then(
      () => this._fertig(a, `Angekommen bei ${a.ort}.`),
      () => this._fertig(a, `Ich komme nicht bis ${a.ort} durch.`),
    );
    return `Ich laufe zu ${a.ort}.`;
  }

  _geben(item, anzahl, name) {
    const bot = this.bot;
    const namen = itemNamen(item, Object.keys(bot.registry.itemsByName));
    if (!namen.length) throw new Error(`Einen Gegenstand "${item}" kenne ich nicht. Englische Namen wie bread gehen immer.`);
    const vorrat = bot.inventory.items().filter((i) => namen.includes(i.name));
    if (!vorrat.length) throw new Error(`Ich habe kein ${item} dabei.`);
    const art = vorrat[0].name;
    const da = vorrat.filter((i) => i.name === art).reduce((s, i) => s + i.count, 0);
    const n = Math.max(1, Math.min(da, Math.round(Number(anzahl) || da)));
    const e = this._spielerFigur(name);
    if (!e) throw new Error(`Ich sehe ${name} gerade nicht. Komm näher, dann bringe ich es dir.`);
    const { GoalNear } = this.pf.goals;
    const a = { art: 'geben', spieler: name, item: art };
    this.auftrag = a;
    (async () => {
      try {
        await bot.pathfinder.goto(new GoalNear(e.position.x, e.position.y, e.position.z, 2));
        if (this.auftrag !== a) return;
        await bot.lookAt(e.position.offset(0, 1.6, 0), true);
        await bot.toss(vorrat[0].type, null, n);
        this._fertig(a, `Hier, ${n}× ${art} für dich.`);
      } catch (err) {
        this._fertig(a, `Das Geben hat nicht geklappt: ${err.message}`);
      }
    })();
    return `Ich bringe ${name} ${n}× ${art}.`;
  }

  _sammeln() {
    const bot = this.bot;
    const { GoalNear } = this.pf.goals;
    const a = { art: 'sammeln', geschafft: 0 };
    this.auftrag = a;
    const bis = Date.now() + 60 * 1000;
    const istDrop = (e) => e.name === 'item' || e.name === 'Item' || e.objectType === 'Item';
    (async () => {
      const versucht = new Set();
      while (this.auftrag === a && Date.now() < bis && a.geschafft < 40) {
        const drop = bot.nearestEntity((e) => istDrop(e) && !versucht.has(e.id) && e.position.distanceTo(bot.entity.position) < 16);
        if (!drop) break;
        versucht.add(drop.id);
        try {
          await bot.pathfinder.goto(new GoalNear(drop.position.x, drop.position.y, drop.position.z, 0.5));
          a.geschafft += 1;
        } catch {
          if (this.auftrag !== a) return;
        }
      }
      this._fertig(a, a.geschafft ? `${a.geschafft}× eingesammelt.` : 'Hier liegt nichts zum Einsammeln.');
    })();
    return 'Ich sammle ein, was hier herumliegt.';
  }

  _schlafen() {
    const bot = this.bot;
    const ids = Object.keys(bot.registry.blocksByName).filter((n) => n.endsWith('_bed')).map((n) => bot.registry.blocksByName[n].id);
    const bett = bot.findBlock({ matching: ids, maxDistance: 32 });
    if (!bett) throw new Error('Hier in der Nähe ist kein Bett.');
    const { GoalNear } = this.pf.goals;
    const a = { art: 'schlafen' };
    this.auftrag = a;
    (async () => {
      try {
        await bot.pathfinder.goto(new GoalNear(bett.position.x, bett.position.y, bett.position.z, 2));
        if (this.auftrag !== a) return;
        await bot.sleep(bett);
        this._fertig(a, 'Gute Nacht – ich liege im Bett.');
      } catch (e) {
        this._fertig(a, /night|thunder|nacht/i.test(e.message) ? 'Schlafen geht nur nachts oder bei Gewitter.' : `Schlafen klappt nicht: ${e.message}`);
      }
    })();
    return 'Ich gehe schlafen.';
  }

  _jagen(tier, anzahl) {
    let tiere = [...TIERE];
    if (tier) {
      const w = String(tier).toLowerCase();
      const t = TIER_WOERTER[w] || w;
      if (!TIERE.has(t)) throw new Error('Jagen geht auf Kühe, Schweine, Hühner, Schafe und Hasen.');
      tiere = [t];
    }
    this._ausruesten();
    const n = Math.max(1, Math.min(10, Math.round(Number(anzahl) || 3)));
    this.auftrag = { art: 'jagen', tiere, anzahl: n, geschafft: 0, zielId: null, bis: this.ticks + 20 * 180 };
    return `Ich jage ${n}× ${tier || 'Tiere'} fürs Essen.`;
  }

  // Nach der Jagd das Fleisch aufsammeln.
  _jagdEnde(a) {
    if (this.auftrag !== a) return;
    this.auftrag = null;
    this._melden('fertig', `${a.geschafft} Tiere erlegt – ich sammle das Essen ein.`);
    this._sammeln();
  }

  _herstellen(item, anzahl) {
    const bot = this.bot;
    const namen = itemNamen(item, Object.keys(bot.registry.itemsByName));
    if (!namen.length) throw new Error(`Einen Gegenstand "${item}" kenne ich nicht. Englische Namen wie torch gehen immer.`);
    const wunsch = Math.max(1, Math.min(64, Math.round(Number(anzahl) || 1)));
    const { GoalNear } = this.pf.goals;
    const a = { art: 'herstellen', item };
    this.auftrag = a;
    (async () => {
      try {
        const tischBlock = bot.registry.blocksByName.crafting_table;
        const tisch = tischBlock ? bot.findBlock({ matching: tischBlock.id, maxDistance: 32 }) : null;
        // Erst im Inventar (2×2), sonst an der nächsten Werkbank.
        let wahl = null;
        for (const mitTisch of [null, tisch]) {
          if (wahl || (mitTisch === null ? false : !mitTisch)) continue;
          for (const n of namen) {
            const r = bot.recipesFor(bot.registry.itemsByName[n].id, null, 1, mitTisch)[0];
            if (r) { wahl = { r, n, tisch: mitTisch }; break; }
          }
        }
        if (!wahl) {
          this._fertig(a, tisch ? `Für ${item} fehlen mir die Zutaten.` : `Für ${item} fehlen mir die Zutaten – oder es braucht eine Werkbank in der Nähe.`);
          return;
        }
        if (wahl.tisch) {
          await bot.pathfinder.goto(new GoalNear(wahl.tisch.position.x, wahl.tisch.position.y, wahl.tisch.position.z, 2));
          if (this.auftrag !== a) return;
        }
        let geschafft = 0;
        while (geschafft < wunsch && this.auftrag === a) {
          const r = bot.recipesFor(wahl.r.result.id, null, 1, wahl.tisch)[0];
          if (!r) break;
          await bot.craft(r, 1, wahl.tisch || undefined);
          geschafft += r.result.count;
        }
        this._fertig(a, geschafft ? `${geschafft}× ${wahl.n} hergestellt.` : `Für ${item} fehlen mir die Zutaten.`);
      } catch (e) {
        this._fertig(a, `Herstellen hat nicht geklappt: ${e.message}`);
      }
    })();
    return `Ich stelle ${wunsch}× ${item} her.`;
  }

  _verstauen() {
    const bot = this.bot;
    const ids = ['chest', 'trapped_chest', 'barrel'].map((n) => bot.registry.blocksByName[n]).filter(Boolean).map((b) => b.id);
    const truhe = bot.findBlock({ matching: ids, maxDistance: 32 });
    if (!truhe) throw new Error('Hier in der Nähe ist keine Truhe.');
    const { GoalNear } = this.pf.goals;
    const a = { art: 'verstauen', geschafft: 0 };
    this.auftrag = a;
    (async () => {
      try {
        await bot.pathfinder.goto(new GoalNear(truhe.position.x, truhe.position.y, truhe.position.z, 2));
        if (this.auftrag !== a) return;
        const kiste = await bot.openContainer(truhe);
        try {
          for (const it of bot.inventory.items()) {
            if (this.auftrag !== a) break;
            if (BEHALTEN.test(it.name) || ESSEN.includes(it.name) || HEILEN.includes(it.name)) continue;
            try {
              await kiste.deposit(it.type, null, it.count);
              a.geschafft += it.count;
            } catch {
              break; // Truhe voll
            }
          }
        } finally {
          kiste.close();
        }
        this._fertig(a, a.geschafft ? `${a.geschafft} Sachen in die Truhe gelegt – Waffen, Werkzeug und Essen behalte ich.` : 'Es gab nichts zum Einräumen.');
      } catch (e) {
        this._fertig(a, `Einräumen hat nicht geklappt: ${e.message}`);
      }
    })();
    return 'Ich räume das Inventar in die Truhe.';
  }

  // Im Ofen schmelzen oder braten: Brennstoff und Ware rein, Ergebnis wieder raus.
  _schmelzen(item, anzahl) {
    const bot = this.bot;
    const namen = itemNamen(item, Object.keys(bot.registry.itemsByName));
    if (!namen.length) throw new Error(`Einen Gegenstand "${item}" kenne ich nicht. Englische Namen wie raw_iron gehen immer.`);
    // "eisen" meint zum Schmelzen das Roheisen, "steak" das rohe Fleisch – nicht das fertige Ergebnis.
    const roh = namen.flatMap((n) => [n, `raw_${n.replace(/_ingot$/, '')}`, n.replace(/^cooked_/, '')]).filter((n) => bot.registry.itemsByName[n]);
    const vorrat = bot.inventory.items().filter((i) => roh.includes(i.name) || namen.includes(i.name));
    if (!vorrat.length) throw new Error(`Ich habe kein ${item} zum Schmelzen dabei.`);
    const items = bot.inventory.items();
    const brenn = BRENNSTOFF.map(([n, schafft]) => ({ it: items.find((i) => (n.startsWith('_') ? i.name.endsWith(n) : i.name === n)), schafft })).find((b) => b.it);
    if (!brenn) throw new Error('Mir fehlt Brennstoff – Kohle, Holzkohle, Bretter oder Holz.');
    const ofenBlock = bot.registry.blocksByName.furnace;
    const ofen = ofenBlock ? bot.findBlock({ matching: ofenBlock.id, maxDistance: 32 }) : null;
    if (!ofen) throw new Error('Hier ist kein Ofen. Stell einen hin (!stell ofen hin) – oder lass mich erst einen herstellen.');
    const ware = vorrat[0];
    const n = Math.max(1, Math.min(64, ware.count, Math.round(Number(anzahl) || ware.count)));
    const { GoalNear } = this.pf.goals;
    const a = { art: 'schmelzen', item, geschafft: 0, anzahl: n };
    this.auftrag = a;
    (async () => {
      try {
        await bot.pathfinder.goto(new GoalNear(ofen.position.x, ofen.position.y, ofen.position.z, 2));
        if (this.auftrag !== a) return;
        const f = await bot.openFurnace(ofen);
        try {
          if (!f.fuelItem()) await f.putFuel(brenn.it.type, null, Math.min(brenn.it.count, Math.ceil(n / brenn.schafft)));
          await f.putInput(ware.type, null, n);
          const bis = Date.now() + (n * 10 + 20) * 1000; // zehn Sekunden je Stück
          while (this.auftrag === a && Date.now() < bis) {
            await new Promise((r) => setTimeout(r, 2000));
            const aus = f.outputItem();
            if (aus && aus.count) {
              a.geschafft += aus.count;
              await f.takeOutput();
            }
            if (!f.inputItem() && !f.outputItem()) break;
          }
        } finally {
          f.close();
        }
        this._fertig(a, a.geschafft ? `${a.geschafft}× fertig aus dem Ofen.` : 'Im Ofen ist nichts fertig geworden – fehlt Brennstoff?');
      } catch (e) {
        this._fertig(a, `Schmelzen hat nicht geklappt: ${e.message}`);
      }
    })();
    return `Ich schmelze ${n}× ${ware.name}.`;
  }

  // Einen Block aus dem Inventar direkt neben sich hinstellen (Werkbank, Ofen, Truhe …).
  _platzieren(item) {
    const bot = this.bot;
    const namen = itemNamen(item, Object.keys(bot.registry.itemsByName));
    const it = bot.inventory.items().find((i) => namen.includes(i.name) && bot.registry.blocksByName[i.name]);
    if (!it) throw new Error(`Ich habe kein ${item} zum Hinstellen dabei.`);
    const { Vec3 } = require('vec3');
    const fuesse = bot.entity.position.floored();
    let ziel = null;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
      const ort = fuesse.offset(dx, 0, dz);
      const boden = bot.blockAt(ort.offset(0, -1, 0));
      const frei = bot.blockAt(ort);
      if (boden && boden.boundingBox === 'block' && frei && frei.name === 'air') { ziel = { ort, boden }; break; }
    }
    if (!ziel) throw new Error('Hier ist kein freier Platz auf festem Boden.');
    const a = { art: 'platzieren', item };
    this.auftrag = a;
    (async () => {
      try {
        await bot.equip(it, 'hand');
        await bot.placeBlock(ziel.boden, new Vec3(0, 1, 0));
        this._fertig(a, `${it.name} steht bei ${ortText(ziel.ort)}.`);
      } catch (e) {
        this._fertig(a, `Hinstellen hat nicht geklappt: ${e.message}`);
      } finally {
        this._ausruesten();
      }
    })();
    return `Ich stelle ${it.name} hin.`;
  }

  // Etwas Bestimmtes in die Hand nehmen oder anziehen.
  _ausruestenMit(item) {
    const bot = this.bot;
    const namen = itemNamen(item, Object.keys(bot.registry.itemsByName));
    const it = bot.inventory.items().find((i) => namen.includes(i.name));
    if (!it) throw new Error(`Ich habe kein ${item} dabei.`);
    const teil = ruestungTeil(it.name);
    bot.equip(it, teil ? teil.platz : 'hand').catch((e) => { this.letzterFehler = e.message; });
    return teil ? `Ich ziehe ${it.name} an.` : `Ich nehme ${it.name} in die Hand.`;
  }

  // Für die KI: warten, bis die laufende Aufgabe fertig ist – dann das Ergebnis.
  async warten(sekunden = 60) {
    if (!this.verbunden) throw new Error('Julia ist mit keinem Minecraft-Server verbunden.');
    const bis = Date.now() + Math.max(1, Math.min(180, Number(sekunden) || 60)) * 1000;
    const vorher = this.letzteMeldung;
    while (this.verbunden && this.auftrag && !DAUERHAFT.includes(this.auftrag.art) && Date.now() < bis) {
      await new Promise((r) => setTimeout(r, 400));
    }
    const a = this.auftrag;
    let hinweis = null;
    if (a && DAUERHAFT.includes(a.art)) hinweis = 'Diese Aufgabe läuft dauerhaft, bis eine neue kommt.';
    else if (a) hinweis = 'Noch nicht fertig – später noch einmal warten.';
    return {
      fertig: !a,
      laeuft_noch: a ? a.art : null,
      hinweis,
      ergebnis: this.letzteMeldung && this.letzteMeldung !== vorher ? this.letzteMeldung.text : null,
      status: this.verbunden ? this.status() : { verbunden: false },
    };
  }

  // Was es im Umkreis gibt: Bäume, Erze, Wasser, Werkbank … – jeweils Anzahl und der nächste.
  umsehen() {
    if (!this.verbunden) throw new Error('Julia ist mit keinem Minecraft-Server verbunden.');
    const bot = this.bot;
    const p = bot.entity.position;
    const alle = Object.keys(bot.registry.blocksByName);
    const bloecke = {};
    for (const [was, passt] of Object.entries(UMSEHEN)) {
      const ids = alle.filter(passt).map((n) => bot.registry.blocksByName[n].id);
      if (!ids.length) continue;
      const orte = bot.findBlocks({ matching: ids, maxDistance: 32, count: 40 });
      if (!orte.length) continue;
      const n = orte.reduce((b, v) => (v.distanceTo(p) < b.distanceTo(p) ? v : b));
      bloecke[was] = { anzahl: orte.length >= 40 ? '40+' : orte.length, naechster: { x: n.x, y: n.y, z: n.z, abstand: Math.round(n.distanceTo(p)) } };
    }
    const tiere = {};
    const feinde = {};
    for (const e of Object.values(bot.entities)) {
      if (!e.position || e.position.distanceTo(p) > 32) continue;
      if (TIERE.has(e.name)) tiere[e.name] = (tiere[e.name] || 0) + 1;
      else if (istFeind(e)) feinde[e.name] = (feinde[e.name] || 0) + 1;
    }
    return {
      position: { x: Math.round(p.x), y: Math.round(p.y), z: Math.round(p.z) },
      dimension: bot.game && bot.game.dimension,
      tageszeit: bot.time ? (bot.time.isDay ? 'Tag' : 'Nacht') : null,
      voraus: this._voraus(),
      bloecke,
      tiere,
      feinde,
    };
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
        gruppe: ctx.minecraftGruppe ? ctx.minecraftGruppe() : null,
      });
      return `Verbunden als ${s.name} (Minecraft ${s.version}). Im Spiel nennt „!hilfe“ alle Befehle.\n${fremd('dem Minecraft-Server', JSON.stringify(s))}`;
    },
  },
  {
    name: 'minecraft_aufgabe',
    description: 'Der eigenen Spielfigur in Minecraft eine Aufgabe geben; sie läuft danach selbstständig in Echtzeit und meldet sich, wenn sie fertig ist. folgen: dem Spieler hinterher. kommen: zum Spieler laufen. beschuetzen: Monster in der Nähe des Spielers bekämpfen. kaempfen: Duell gegen einen Spieler – nur, wenn der Nutzer das will; Waffe und Rüstung legt die Figur selbst an. abbauen: Blöcke abbauen und einsammeln (block z. B. oak_log, stone, iron_ore oder holz, stein, eisen, kohle, diamant; anzahl bis 64). gehen: zu Koordinaten laufen (x, z, optional y). geben: dem Spieler etwas aus dem Inventar bringen (item, anzahl). sammeln: herumliegende Gegenstände aufheben. jagen: Tiere für Essen jagen (tier: kuh, schwein, huhn, schaf, hase; anzahl bis 10). herstellen: etwas craften (item z. B. fackel, werkbank, bretter, stock oder torch; anzahl) – im Inventar oder an einer Werkbank in der Nähe. verstauen: Inventar in die nächste Truhe legen (Waffen, Werkzeug, Essen bleiben). schlafen: ins nächste Bett. schmelzen: im Ofen in der Nähe schmelzen oder braten (item z. B. eisen, raw_iron, beef; anzahl) – Brennstoff nimmt die Figur selbst. platzieren: einen Block aus dem Inventar neben sich hinstellen (item z. B. werkbank, ofen, truhe). ausruesten: ein bestimmtes Teil in die Hand nehmen oder anziehen. essen: sofort etwas essen. stopp: alles anhalten. Ohne spieler gilt der Spielername aus den Einstellungen. Nach Aufgaben, die dauern, mit minecraft_warten auf das Ergebnis warten, bevor der nächste Schritt kommt.',
    input_schema: {
      type: 'object',
      properties: {
        aufgabe: { type: 'string', enum: ['folgen', 'kommen', 'beschuetzen', 'kaempfen', 'abbauen', 'gehen', 'geben', 'sammeln', 'jagen', 'herstellen', 'verstauen', 'schlafen', 'schmelzen', 'platzieren', 'ausruesten', 'essen', 'stopp'] },
        spieler: { type: 'string' },
        block: { type: 'string' },
        item: { type: 'string', description: 'für geben und herstellen, z. B. brot, fackel, diamant, oak_planks' },
        anzahl: { type: 'number' },
        x: { type: 'number' },
        y: { type: 'number' },
        z: { type: 'number' },
        tier: { type: 'string', description: 'für jagen: kuh, schwein, huhn, schaf oder hase' },
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
    name: 'minecraft_warten',
    fremd: true,
    description: 'Warten, bis die laufende Aufgabe der Spielfigur fertig ist (höchstens sekunden, Standard 60, bis 180) – danach das Ergebnis und der Status. Nach jeder Aufgabe, die dauert (abbauen, gehen, herstellen, schmelzen, jagen …), aufrufen, bevor der nächste Schritt kommt.',
    input_schema: { type: 'object', properties: { sekunden: { type: 'number' } } },
    einstufen: () => gruen(),
    async ausfuehren(e, ctx) {
      return fremd('dem Minecraft-Server', JSON.stringify(await brauchtMinecraft(ctx).warten(e.sekunden)));
    },
  },
  {
    name: 'minecraft_umsehen',
    fremd: true,
    description: 'Was es im Umkreis von 32 Blöcken gibt: Bäume, Stein, Erze (Kohle, Eisen, Kupfer, Gold, Redstone, Diamant, Smaragd), Obsidian, Wasser, Lava, Werkbank, Ofen, Truhe, Bett – jeweils Anzahl und der nächste mit Koordinaten; dazu Tiere, Monster, Tageszeit und Dimension. Zum Planen vor größeren Zielen.',
    input_schema: { type: 'object', properties: {} },
    einstufen: () => gruen(),
    async ausfuehren(_e, ctx) {
      return fremd('dem Minecraft-Server', JSON.stringify(brauchtMinecraft(ctx).umsehen()));
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
  itemNamen, ortLesen, mengeLesen, endeText, HILFE,
};
