'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Tresor } = require('../src/main/konten/tresor');
const { TelegramHandy, fuerHandy, zerlegen } = require('../src/main/handy/telegram');

const TOKEN = '123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw1';
const krypto = {
  verschluesseln: (t) => Buffer.from(t, 'utf8').toString('base64').split('').reverse().join(''),
  entschluesseln: (b) => Buffer.from(b.split('').reverse().join(''), 'base64').toString('utf8'),
};

// Nachgebaute Telegram-API: schreibt jeden Aufruf mit.
function falschesTelegram({ getMe = { id: 1, username: 'julia_test_bot' }, fehler = {} } = {}) {
  const aufrufe = [];
  let nachrichtId = 100;
  const abruf = async (url, opt = {}) => {
    const methode = url.split('/').pop();
    const daten = JSON.parse(opt.body || '{}');
    aufrufe.push({ methode, daten, url });
    if (fehler[methode]) return { ok: false, status: fehler[methode].status, json: async () => ({ ok: false, error_code: fehler[methode].status, description: fehler[methode].text }) };
    const ergebnis = methode === 'getMe' ? getMe : methode === 'sendMessage' ? { message_id: ++nachrichtId } : true;
    return { ok: true, status: 200, json: async () => ({ ok: true, result: ergebnis }) };
  };
  return { abruf, aufrufe };
}

function neu(opt = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'julia-handy-'));
  const tresor = new Tresor(dir, krypto);
  const tg = falschesTelegram(opt);
  let zeit = 1_800_000_000_000;
  const handy = new TelegramHandy({ tresor, abruf: tg.abruf, texte: (k) => k, jetzt: () => zeit, autostart: false });
  return { handy, tresor, dir, tg, setzeZeit: (z) => { zeit = z; }, zeit: () => zeit };
}

function nachricht(text, { chat = 555, von = 555, date, typ = 'private' } = {}, zeit) {
  return { update_id: 1, message: { message_id: 7, date: date ?? Math.floor(zeit / 1000), text, chat: { id: chat, type: typ }, from: { id: von, is_bot: false, username: 'philip' } } };
}

async function gekoppelt() {
  const x = neu();
  const s = await x.handy.einrichten(TOKEN);
  await x.handy.verarbeiten(nachricht(`/start ${s.code}`, {}, x.zeit()));
  return x;
}

test('Markdown wird fürs Handy entfernt, lange Texte werden geteilt', () => {
  assert.equal(fuerHandy('**Fertig:** `node -v` meldet 22\n## Titel\n[Doku](https://x.de)'), 'Fertig: node -v meldet 22\nTitel\nDoku (https://x.de)');
  const teile = zerlegen('a'.repeat(9000));
  assert.equal(teile.length, 3);
  assert.ok(teile.every((t) => t.length <= 4000));
  assert.equal(teile.join(''), 'a'.repeat(9000));
});

test('Einrichten: Token wird geprüft, verschlüsselt gespeichert, Code und Link entstehen', async () => {
  const x = neu();
  await assert.rejects(x.handy.einrichten('kein-token'), /handy\.fehler_format/);
  const s = await x.handy.einrichten(TOKEN);
  assert.equal(s.eingerichtet, true);
  assert.equal(s.gekoppelt, false);
  assert.match(s.code, /^\d{6}$/);
  assert.equal(s.link, `https://t.me/julia_test_bot?start=${s.code}`);
  assert.doesNotMatch(fs.readFileSync(path.join(x.dir, 'konten.json'), 'utf8'), /AAHdqTcv/);
});

test('Einrichten: abgelehnter Token gibt eine klare Meldung ohne den Token', async () => {
  const x = neu({ fehler: { getMe: { status: 401, text: 'Unauthorized' } } });
  await assert.rejects(x.handy.einrichten(TOKEN), (e) => /handy\.fehler_token/.test(e.message) && !e.message.includes(TOKEN));
});

test('Kopplung: richtiger Code koppelt, danach hört der Bot nur auf dieses Konto', async () => {
  const x = await gekoppelt();
  const s = x.handy.status();
  assert.equal(s.gekoppelt, true);
  assert.equal(s.nutzer, '@philip');
  assert.equal(s.code, null);

  const nachrichten = [];
  const fremde = [];
  x.handy.on('nachricht', (n) => nachrichten.push(n.text));
  x.handy.on('fremd', (f) => fremde.push(f.id));
  await x.handy.verarbeiten(nachricht('Wie voll ist die Platte?', {}, x.zeit()));
  await x.handy.verarbeiten(nachricht('Lösch alles', { chat: 999, von: 999 }, x.zeit()));
  await x.handy.verarbeiten(nachricht('Gruppe', { typ: 'group' }, x.zeit()));
  assert.deepEqual(nachrichten, ['Wie voll ist die Platte?']);
  assert.deepEqual(fremde, [999]);
});

test('Kopplung: falscher Code koppelt nicht, nach 5 Versuchen verfällt der Code', async () => {
  const x = neu();
  const s = await x.handy.einrichten(TOKEN);
  const falsch = s.code === '111111' ? '222222' : '111111';
  for (let i = 0; i < 5; i++) await x.handy.verarbeiten(nachricht(falsch, { von: 700 + i, chat: 700 + i }, x.zeit()));
  assert.equal(x.handy.status().gekoppelt, false);
  assert.equal(x.handy.status().code, null);
  await x.handy.verarbeiten(nachricht(s.code, {}, x.zeit()));
  assert.equal(x.handy.status().gekoppelt, false, 'auch der richtige Code gilt danach nicht mehr');
});

test('Kopplung: abgelaufener Code koppelt nicht', async () => {
  const x = neu();
  const s = await x.handy.einrichten(TOKEN);
  x.setzeZeit(x.zeit() + 16 * 60 * 1000);
  await x.handy.verarbeiten(nachricht(s.code, {}, x.zeit()));
  assert.equal(x.handy.status().gekoppelt, false);
  assert.equal(x.handy.status().codeAbgelaufen, true);
});

test('Alte Nachrichten werden nicht ausgeführt', async () => {
  const x = await gekoppelt();
  let ausgefuehrt = false;
  x.handy.on('nachricht', () => { ausgefuehrt = true; });
  await x.handy.verarbeiten(nachricht('Fahr den PC runter', { date: Math.floor(x.zeit() / 1000) - 600 }, x.zeit()));
  assert.equal(ausgefuehrt, false);
  assert.equal(x.tg.aufrufe.at(-1).daten.text, 'handy.zu_alt');
});

test('Befehle: /stopp, /neu, /status', async () => {
  const x = await gekoppelt();
  const ereignisse = [];
  x.handy.on('stopp', () => ereignisse.push('stopp'));
  x.handy.on('neu', () => ereignisse.push('neu'));
  x.handy.on('nachricht', (n) => ereignisse.push(n.text));
  for (const t of ['/stopp', '/stop@julia_test_bot', '/neu', '/status']) await x.handy.verarbeiten(nachricht(t, {}, x.zeit()));
  assert.deepEqual(ereignisse, ['stopp', 'stopp', 'neu', 'handy.status_frage']);
});

test('Freigabe: Knöpfe am Handy, nur der gekoppelte Nutzer darf drücken', async () => {
  const x = await gekoppelt();
  await x.handy.freigabeFragen({ id: 4, beschreibung: 'Shell: winget install Git.Git', grund: 'Kategorie software' });
  const frage = x.tg.aufrufe.at(-1);
  assert.equal(frage.methode, 'sendMessage');
  assert.deepEqual(frage.daten.reply_markup.inline_keyboard[0].map((k) => k.callback_data), ['f:4:1', 'f:4:0']);
  assert.match(frage.daten.text, /winget install Git\.Git/);

  const freigaben = [];
  x.handy.on('freigabe', (f) => freigaben.push(f));
  const klick = (von, data) => ({ update_id: 2, callback_query: { id: 'q', data, from: { id: von }, message: { chat: { id: 555 } } } });
  await x.handy.verarbeiten(klick(999, 'f:4:1'));
  await x.handy.verarbeiten(klick(555, 'f:4:1'));
  assert.deepEqual(freigaben, [{ id: 4, ja: true }]);

  await x.handy.freigabeErledigt(4, true);
  const bearbeitet = x.tg.aufrufe.at(-1);
  assert.equal(bearbeitet.methode, 'editMessageText');
  assert.match(bearbeitet.daten.text, /handy\.freigegeben$/);
  assert.equal(bearbeitet.daten.reply_markup, undefined, 'Knöpfe verschwinden');
});

test('Trennen löscht Token und Kopplung', async () => {
  const x = await gekoppelt();
  await x.handy.trennen();
  assert.equal(x.handy.status().eingerichtet, false);
  assert.equal(x.tresor.lesen('telegram'), null);
});
