'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const mc = require('../src/main/minecraft');
const a = require('../src/main/ampel');

const dnsFake = (ips) => async () => ips.map((address) => ({ address }));

test('Minecraft: nur Server auf diesem PC oder im Heimnetz', async () => {
  assert.equal(await mc.adressePruefen('192.168.1.20'), '192.168.1.20');
  assert.equal(await mc.adressePruefen('localhost', dnsFake(['127.0.0.1', '::1'])), '127.0.0.1');
  await assert.rejects(mc.adressePruefen('8.8.8.8'), /Heimnetz/);
  await assert.rejects(mc.adressePruefen('play.example.net', dnsFake(['172.65.1.1'])), /Heimnetz/);
  await assert.rejects(mc.adressePruefen('mein-pc', dnsFake(['192.168.1.2', '1.2.3.4'])), /Heimnetz/);
  await assert.rejects(mc.adressePruefen('a b'), /gültige/);
});

test('Minecraft: SRV-Eintrag wie im Spiel, Handshake mit dem eingetragenen Namen', async () => {
  const srv = async (n) => {
    assert.equal(n, '_minecraft._tcp.play.example.de');
    return [{ name: 'b.proxy.example.', port: 25577, priority: 10, weight: 1 }, { name: 'a.proxy.example.', port: 25570, priority: 5, weight: 5 }];
  };
  const dns = async (h) => { assert.equal(h, 'a.proxy.example'); return [{ address: '5.9.1.1' }]; };
  assert.deepEqual(await mc.zielFinden('play.example.de', 25565, { aufloesen: dns, srv, oeffentlich: true }), { host: 'play.example.de', ip: '5.9.1.1', port: 25570 });

  let gefragt = false;
  const eigenerPort = await mc.zielFinden('play.example.de', 25570, { aufloesen: dnsFake(['5.9.1.2']), srv: async () => { gefragt = true; return []; }, oeffentlich: true });
  assert.deepEqual(eigenerPort, { host: 'play.example.de', ip: '5.9.1.2', port: 25570 });
  assert.equal(gefragt, false);

  const keinSrv = async () => { throw Object.assign(new Error('x'), { code: 'ENOTFOUND' }); };
  assert.deepEqual(await mc.zielFinden('mc.example.de', 25565, { aufloesen: dnsFake(['5.9.1.3']), srv: keinSrv, oeffentlich: true }), { host: 'mc.example.de', ip: '5.9.1.3', port: 25565 });

  // Ein SRV-Eintrag hebelt die Regeln nicht aus.
  const aufHypixel = async () => [{ name: 'mc.hypixel.net', port: 25565, priority: 0, weight: 0 }];
  await assert.rejects(mc.zielFinden('tarn.example.de', 25565, { aufloesen: dnsFake(['1.2.3.4']), srv: aufHypixel, oeffentlich: true }), /Bots/);
  const insInternet = async () => [{ name: 'x.example.de', port: 25565, priority: 0, weight: 0 }];
  await assert.rejects(mc.zielFinden('heim.example.de', 25565, { aufloesen: dnsFake(['5.9.1.1']), srv: insInternet }), /Heimnetz/);

  let opts;
  const m = new mc.Minecraft({ aufloesen: dns, srv, laden: () => ({ mineflayer: { createBot: (o) => { opts = o; throw new Error('halt'); } }, pf: {} }) });
  await assert.rejects(m.verbinden({ adresse: 'play.example.de', oeffentlich: true }), /halt/);
  assert.equal(opts.host, 'play.example.de');
  assert.equal(opts.port, 25565);
  assert.equal(typeof opts.connect, 'function');
});

test('Minecraft: Adresse mit Port', () => {
  assert.deepEqual(mc.adresseTeilen('192.168.1.20:25566'), { host: '192.168.1.20', port: 25566 });
  assert.deepEqual(mc.adresseTeilen('localhost', 25570), { host: 'localhost', port: 25570 });
  assert.deepEqual(mc.adresseTeilen('', undefined), { host: 'localhost', port: 25565 });
  assert.deepEqual(mc.adresseTeilen('[::1]:25567'), { host: '::1', port: 25567 });
});

test('Minecraft: fremder Server ist ROT, eigener GRÜN', () => {
  const w = mc.WERKZEUGE.find((x) => x.name === 'minecraft_verbinden');
  const ctx = { config: { get: () => ({ adresse: '', port: 25565 }) } };
  assert.equal(w.einstufen({ adresse: '5.9.1.1' }, ctx).stufe, a.ROT);
  assert.equal(w.einstufen({ adresse: '192.168.0.5:25565' }, ctx).stufe, a.GRUEN);
  assert.equal(w.einstufen({}, ctx).stufe, a.GRUEN);
});

test('Minecraft: verbinden prüft die Adresse, bevor irgendetwas aufgebaut wird', async () => {
  let erstellt = false;
  const m = new mc.Minecraft({ laden: () => { erstellt = true; return {}; } });
  await assert.rejects(m.verbinden({ adresse: '8.8.8.8' }), /Heimnetz/);
  assert.equal(erstellt, false);
  assert.throws(() => m.aufgabe({ aufgabe: 'folgen' }), /keinem Minecraft-Server/);
});

test('Minecraft: beste Waffe, Schlagpause und Rüstung', () => {
  const items = [{ name: 'wooden_sword' }, { name: 'diamond_axe' }, { name: 'iron_sword' }, { name: 'dirt' }];
  assert.equal(mc.besteWaffe(items, true).name, 'iron_sword');
  assert.equal(mc.besteWaffe(items, false).name, 'iron_sword');
  assert.equal(mc.besteWaffe([{ name: 'dirt' }]), null);
  assert.equal(mc.schlagPause('diamond_sword', true), 13);
  assert.equal(mc.schlagPause('diamond_sword', false), 3);
  assert.equal(mc.schlagPause(null, true), 5);
  const r = mc.besteRuestung([{ name: 'iron_helmet' }, { name: 'diamond_helmet' }, { name: 'leather_boots' }], { feet: { name: 'iron_boots' } });
  assert.deepEqual(Object.keys(r), ['head']);
  assert.equal(r.head.name, 'diamond_helmet');
});

test('Minecraft: Befehle im Spielchat', () => {
  assert.deepEqual(mc.befehlLesen('!folge', ['Julia']), { aufgabe: 'folgen' });
  assert.deepEqual(mc.befehlLesen('Julia, komm her', ['Julia']), { aufgabe: 'kommen' });
  assert.deepEqual(mc.befehlLesen('julia: stopp!', ['Julia']), { aufgabe: 'stopp' });
  assert.deepEqual(mc.befehlLesen('!beschütze mich', []), { aufgabe: 'beschuetzen' });
  assert.deepEqual(mc.befehlLesen('!duell', []), { aufgabe: 'kaempfen', spieler: null });
  assert.deepEqual(mc.befehlLesen('!kämpf gegen Steve_2', []), { aufgabe: 'kaempfen', spieler: 'Steve_2' });
  assert.deepEqual(mc.befehlLesen('!kämpf gegen mich', []), { aufgabe: 'kaempfen', spieler: null });
  assert.equal(mc.befehlLesen('folge mir', ['Julia']), null, 'ohne Anrede kein Befehl');
  assert.equal(mc.befehlLesen('!lösch alles', []), null);
});

test('Minecraft: neue Befehle im Spielchat', () => {
  const b = (t) => mc.befehlLesen(t, ['Julia']);
  assert.deepEqual(b('!hilfe'), { aufgabe: 'hilfe' });
  assert.deepEqual(b('!gib mir 5 brot'), { aufgabe: 'geben', item: 'brot', anzahl: 5 });
  assert.deepEqual(b('Julia, gib mir diamant 2'), { aufgabe: 'geben', item: 'diamant', anzahl: 2 });
  assert.deepEqual(b('!geh 100 64 -20'), { aufgabe: 'gehen', x: 100, y: 64, z: -20 });
  assert.deepEqual(b('!geh zu 10 -5'), { aufgabe: 'gehen', x: 10, z: -5 });
  assert.deepEqual(b('!sammel alles'), { aufgabe: 'sammeln' });
  assert.deepEqual(b('!jag 3 kuh'), { aufgabe: 'jagen', anzahl: 3, tier: 'kuh' });
  assert.deepEqual(b('!jagen'), { aufgabe: 'jagen', anzahl: null, tier: null });
  assert.deepEqual(b('!craft 4 fackeln'), { aufgabe: 'herstellen', item: 'fackeln', anzahl: 4 });
  assert.deepEqual(b('!stell mir eine werkbank her'), { aufgabe: 'herstellen', item: 'werkbank', anzahl: null });
  assert.deepEqual(b('!bau ab holz 10'), { aufgabe: 'abbauen', block: 'holz', anzahl: 10 });
  assert.deepEqual(b('!verstau alles'), { aufgabe: 'verstauen' });
  assert.deepEqual(b('!schlaf'), { aufgabe: 'schlafen' });
  assert.deepEqual(b('!ess was'), { aufgabe: 'essen' });
  assert.deepEqual(b('!schmelz 8 eisen'), { aufgabe: 'schmelzen', item: 'eisen', anzahl: 8 });
  assert.deepEqual(b('!stell eine werkbank hin'), { aufgabe: 'platzieren', item: 'werkbank' });
  assert.deepEqual(b('!platzier ofen'), { aufgabe: 'platzieren', item: 'ofen' });
  assert.deepEqual(b('!nimm dein schwert'), { aufgabe: 'ausruesten', item: 'schwert' });
  assert.deepEqual(b('!stell mir eine werkbank her'), { aufgabe: 'herstellen', item: 'werkbank', anzahl: null }, 'herstellen bleibt herstellen');
});

test('Minecraft: Gegenstände auf Deutsch und gültige Koordinaten', () => {
  const namen = ['bread', 'torch', 'crafting_table', 'oak_planks', 'birch_planks', 'stick', 'diamond', 'cooked_beef', 'iron_ingot', 'iron_ore'];
  assert.deepEqual(mc.itemNamen('brot', namen), ['bread']);
  assert.deepEqual(mc.itemNamen('fackeln', namen), ['torch']);
  assert.deepEqual(mc.itemNamen('werkbank', namen), ['crafting_table']);
  assert.deepEqual(mc.itemNamen('bretter', namen), ['oak_planks', 'birch_planks']);
  assert.deepEqual(mc.itemNamen('eisen', namen), ['iron_ingot']);
  assert.deepEqual(mc.itemNamen('torch', namen), ['torch']);
  assert.deepEqual(mc.itemNamen('xyz', namen), []);
  assert.deepEqual(mc.ortLesen({ x: '100', y: 64, z: -20.4 }), { x: 100, y: 64, z: -20 });
  assert.deepEqual(mc.ortLesen({ x: 1, z: 2, y: '' }), { x: 1, z: 2 });
  assert.throws(() => mc.ortLesen({ x: 'a', z: 1 }), /Koordinaten/);
  assert.throws(() => mc.ortLesen({ x: 1, y: 999, z: 1 }), /Koordinaten/);
  assert.throws(() => mc.ortLesen({ x: 1, y: -100, z: 1 }), /Höhe/);
});

test('Minecraft: Rauswurf und Abbruch werden verständlich erklärt', () => {
  assert.match(mc.rauswurfText('{"text":"Flying is not enabled on this server"}'), /Fliegen/);
  assert.match(mc.rauswurfText('You logged in from another location'), /eigenes Minecraft-Konto/);
  assert.match(mc.rauswurfText('Server closed'), /beendet|neu gestartet/);
  assert.match(mc.endeText('keepAliveError', null, 'mc.example.de:25565'), /Zeitüberschreitung/);
  assert.match(mc.endeText('socketClosed', null, 'mc.example.de:25565'), /abgebrochen/);
  assert.match(mc.endeText('socketClosed', 'read ECONNRESET', 'mc.example.de:25565'), /abrupt/);
});

test('Minecraft: Crash-Screen – Grund merken, nach Verbindungsabbruch selbst zurück, nach Rauswurf nicht', async () => {
  const { EventEmitter } = require('events');
  const boten = [];
  const pf = { pathfinder: () => {}, Movements: class {}, goals: {} };
  const laden = () => ({
    pf,
    mineflayer: {
      createBot: () => {
        const b = new EventEmitter();
        b.loadPlugin = () => {};
        b.pathfinder = { setMovements() {}, setGoal() {} };
        b.registry = null;
        b.clearControlStates = () => {};
        b.quit = () => b.emit('end', 'disconnect.quitting');
        boten.push(b);
        setImmediate(() => {
          Object.assign(b, { entity: { position: { x: 1, y: 64, z: 2 } }, username: 'Julia', version: '1.21.1', players: {}, entities: {}, inventory: { items: () => [] }, health: 20, food: 20, game: {} });
          b.emit('spawn');
        });
        return b;
      },
    },
  });
  const m = new mc.Minecraft({ laden, wiederPausen: [5, 5, 5] });
  const warten = (ms) => new Promise((r) => setTimeout(r, ms));
  await m.verbinden({ adresse: '127.0.0.1', botname: 'Julia' });

  boten[0].emit('end', 'socketClosed');
  const t = m.status().trennung;
  assert.equal(m.status().verbunden, false);
  assert.equal(t.rauswurf, false);
  assert.match(t.grund, /abgebrochen/);
  assert.equal(t.versuch, 1);
  await warten(60);
  assert.equal(boten.length, 2, 'nach dem Abbruch selbst wieder beigetreten');
  assert.equal(m.verbunden, true);
  assert.equal(m.status().trennung, undefined);

  boten[1].emit('kicked', '{"text":"Flying is not enabled on this server"}');
  boten[1].emit('end', 'socketClosed');
  assert.equal(m.status().trennung.rauswurf, true);
  assert.match(m.status().trennung.grund, /Fliegen/);
  await warten(40);
  assert.equal(boten.length, 2, 'nach einem Rauswurf kein neuer Versuch');

  m.trennungVergessen();
  assert.equal(m.status().trennung, null);
});

test('Minecraft: Chat ohne Befehle und Steuerzeichen, gültiger Figurname', () => {
  assert.equal(mc.chatText('/op Moin'), 'op Moin');
  assert.equal(mc.chatText('hi\nda §4rot'), 'hi da 4rot');
  assert.throws(() => mc.chatText('   '), /Leere/);
  assert.equal(mc.botName('', 'Jülia'), 'Julia');
  assert.equal(mc.botName('Mein Bot!', 'Julia'), 'MeinBot');
  assert.equal(mc.botName('x', 'Jo'), 'Julia_Bot');
});

test('Minecraft: Blöcke auf Deutsch und das passende Werkzeug', () => {
  const namen = ['oak_log', 'birch_log', 'stone', 'cobblestone', 'iron_ore', 'deepslate_iron_ore', 'dirt', 'grass_block'];
  assert.deepEqual(mc.blockNamen('holz', namen), ['oak_log', 'birch_log']);
  assert.deepEqual(mc.blockNamen('eisen', namen), ['iron_ore', 'deepslate_iron_ore']);
  assert.deepEqual(mc.blockNamen('oak_log', namen), ['oak_log']);
  assert.deepEqual(mc.blockNamen('log', namen), ['oak_log', 'birch_log']);
  assert.deepEqual(mc.blockNamen('xyz', namen), []);
  assert.equal(mc.werkzeugArt('oak_log'), 'axe');
  assert.equal(mc.werkzeugArt('dirt'), 'shovel');
  assert.equal(mc.werkzeugArt('iron_ore'), 'pickaxe');
  assert.equal(mc.besteWerkzeug([{ name: 'stone_pickaxe' }, { name: 'diamond_pickaxe' }, { name: 'diamond_axe' }], 'pickaxe').name, 'diamond_pickaxe');
  assert.equal(mc.besteWerkzeug([{ name: 'diamond_pickaxe' }], 'axe'), null);
});

test('Minecraft: Rauswurf wegen Konto wird verständlich erklärt', () => {
  assert.match(mc.rauswurfText('{"translate":"multiplayer.disconnect.unverified_username"}'), /online-mode=false/);
  assert.match(mc.rauswurfText('You are not whitelisted on this server!'), /Whitelist/);
  assert.equal(mc.istFeind({ type: 'hostile', name: 'zombie' }), true);
  assert.equal(mc.istFeind({ type: 'player', name: 'player' }), false);
  assert.equal(mc.istFeind({ type: 'mob', name: 'creeper' }), true);
  assert.equal(mc.istFeind({ type: 'animal', name: 'cow' }), false);
});

test('Minecraft: Server im Internet nur, wenn selbst eingetragen – große Netzwerke nie', async () => {
  assert.equal(await mc.adressePruefen('5.9.1.1', undefined, { oeffentlich: true }), '5.9.1.1');
  await assert.rejects(mc.adressePruefen('mc.hypixel.net', dnsFake(['1.2.3.4']), { oeffentlich: true }), /Bots/);
  const w = mc.WERKZEUGE.find((x) => x.name === 'minecraft_verbinden');
  const mit = (adresse) => ({ config: { get: () => ({ adresse, port: 25565 }) } });
  assert.equal(w.einstufen({}, mit('5.9.1.1')).stufe, a.GRUEN);
  assert.equal(w.einstufen({ adresse: '5.9.1.2' }, mit('5.9.1.1')).stufe, a.ROT);
  assert.equal(w.einstufen({ adresse: 'hypixel.net' }, mit('hypixel.net')).stufe, a.ROT);
});

test('Minecraft: Konto-Anmeldung liegt verschlüsselt und lässt sich löschen', async () => {
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const datei = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mc-')), 'konto.bin');
  const krypto = { verschluesseln: (t) => Buffer.from(t).toString('base64'), entschluesseln: (b) => Buffer.from(b, 'base64').toString() };
  const sp = mc.kontoSpeicher({ datei, krypto });
  const live = sp({ cacheName: 'live', username: 'julia' });
  await live.setCached({ token: 'geheim' });
  await live.setCachedPartial({ weiter: 1 });
  assert.deepEqual(await live.getCached(), { token: 'geheim', weiter: 1 });
  assert.ok(!fs.readFileSync(datei, 'utf8').includes('geheim'), 'nicht im Klartext');
  assert.deepEqual(await mc.kontoSpeicher({ datei, krypto })({ cacheName: 'live' }).getCached(), { token: 'geheim', weiter: 1 });
  assert.equal(sp.vorhanden(), true);
  sp.loeschen();
  assert.equal(fs.existsSync(datei), false);
  assert.deepEqual(await mc.kontoSpeicher({ datei, krypto })({ cacheName: 'live' }).getCached(), {});
});

test('Minecraft: Konto ohne Minecraft Java wird verständlich abgelehnt', async () => {
  let geloescht = false;
  const cache = Object.assign(() => ({}), { loeschen: () => { geloescht = true; } });
  const laden = () => ({
    Titles: { MinecraftNintendoSwitch: 'x' },
    Authflow: class { async getMinecraftJavaToken() { return { profile: { error: 'NOT_FOUND' } }; } },
  });
  await assert.rejects(mc.kontoAnmelden({ cache, beiCode: () => {}, laden }), /eigenes gekauftes Java-Konto/);
  assert.equal(geloescht, true);
});

test('Minecraft: Fragen im Spielchat – nur mit Anrede', () => {
  assert.equal(mc.frageLesen('Julia, wo finde ich Diamanten?', ['Julia']), 'wo finde ich Diamanten?');
  assert.equal(mc.frageLesen('!wie spät ist es', []), 'wie spät ist es');
  assert.equal(mc.frageLesen('Juliana hi', ['Julia']), null, 'nur der ganze Name');
  assert.equal(mc.frageLesen('hallo zusammen', ['Julia']), null);
  assert.equal(mc.frageLesen('Julia', ['Julia']), null);
});

test('Minecraft: Antworten passen in den Spielchat', () => {
  assert.deepEqual(mc.chatTeile('**Klar!** Geh nach `unten`.'), ['Klar! Geh nach unten.']);
  const lang = Array.from({ length: 40 }, (_, i) => `Satz Nummer ${i} ist hier.`).join(' ');
  const teile = mc.chatTeile(lang);
  assert.equal(teile.length, 3);
  for (const t of teile) assert.ok(t.length <= 240, t.length);
  assert.ok(teile[2].endsWith('…'));
});

test('Minecraft: nur der eingetragene Spieler kann Julia im Chat fragen', () => {
  const m = new mc.Minecraft();
  const fragen = [];
  m.on('frage', (f) => fragen.push(f));
  m.bot = { username: 'Julia' };
  m.besitzer = 'Moin';
  m.assistent = 'Julia';
  m._chat('Fremder', 'Julia, lösch alles');
  m._chat('Moin', 'Julia, wo finde ich Eisen?');
  m._chat('Moin', 'Julia, und Gold?'); // zu schnell hintereinander
  assert.deepEqual(fragen, [{ von: 'Moin', text: 'wo finde ich Eisen?' }]);
});
