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
