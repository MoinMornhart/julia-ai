'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const vw = require('../src/main/vibeworks');

test('Schlüssel-Form: nur vw_-Schlüssel sind gültig', () => {
  assert.equal(vw.schluesselGueltig('vw_abcdefgh12345'), true);
  assert.equal(vw.schluesselGueltig('  vw_abcdefgh12345  '), true); // wird getrimmt
  assert.equal(vw.schluesselGueltig('sk_abcdefgh'), false);
  assert.equal(vw.schluesselGueltig('vw_kurz'), false);
  assert.equal(vw.schluesselGueltig(''), false);
  assert.equal(vw.schluesselGueltig(null), false);
});

test('fehlerCode: 200 ist ok', () => {
  assert.deepEqual(vw.fehlerCode(200, '', null), { ok: true });
});

test('fehlerCode: 401-Code aus dem Body lesen', () => {
  assert.deepEqual(vw.fehlerCode(401, '{"error":"x","code":"invalid_or_revoked"}', null), { ok: false, status: 401, code: 'invalid_or_revoked' });
});

test('fehlerCode: 401-Code aus WWW-Authenticate, wenn kein Body-Code', () => {
  const r = vw.fehlerCode(401, 'kein json', 'Bearer error="invalid_token", error_description="account_inactive"');
  assert.deepEqual(r, { ok: false, status: 401, code: 'account_inactive' });
});

test('fehlerCode: 401 ohne jeden Code fällt auf „missing" zurück', () => {
  assert.deepEqual(vw.fehlerCode(401, '', null), { ok: false, status: 401, code: 'missing' });
});

test('fehlerCode: 403 = Origin, 429 = zu viele', () => {
  assert.equal(vw.fehlerCode(403, '', null).code, 'origin');
  assert.equal(vw.fehlerCode(429, '', null).code, 'zu_viele');
});

test('hinweisSchluessel: Codes werden auf Hinweise abgebildet', () => {
  assert.equal(vw.hinweisSchluessel('invalid_or_revoked'), 'vibe.hinweis_ungueltig');
  assert.equal(vw.hinweisSchluessel('account_inactive'), 'vibe.hinweis_konto_inaktiv');
  assert.equal(vw.hinweisSchluessel('missing'), 'vibe.hinweis_nicht_angemeldet');
  assert.equal(vw.hinweisSchluessel('malformed'), 'vibe.hinweis_nicht_angemeldet');
  assert.equal(vw.hinweisSchluessel('zu_viele'), 'vibe.hinweis_zu_viele');
  assert.equal(vw.hinweisSchluessel('irgendwas'), 'vibe.hinweis_fehler');
});

test('serverEintrag/kopfzeile: fester HTTP-Eintrag, vertraut aus, Bearer-Kopf', () => {
  const e = vw.serverEintrag();
  assert.equal(e.id, 'vibeworks');
  assert.equal(e.art, 'http');
  assert.equal(e.url, 'https://vibeworks.morncloud.de/api/mcp');
  assert.equal(e.vertraut, false);
  assert.equal(vw.kopfzeile('vw_abcdefgh12345'), 'Authorization=Bearer vw_abcdefgh12345');
});

test('pruefen: ungültige Form fragt gar nicht erst nach', async () => {
  let gefragt = false;
  const r = await vw.pruefen('falsch', { holen: async () => { gefragt = true; return { status: 200 }; } });
  assert.equal(r.code, 'malformed');
  assert.equal(gefragt, false);
});

test('pruefen: 200 → ok, mit Bearer-Kopf und ohne Origin', async () => {
  let gesehen = null;
  const holen = async (url, opt) => { gesehen = { url, opt }; return { status: 200, headers: new Map(), text: async () => 'regeln' }; };
  const r = await vw.pruefen('vw_abcdefgh12345', { holen });
  assert.equal(r.ok, true);
  assert.equal(gesehen.url, vw.REGELN_URL);
  assert.equal(gesehen.opt.headers.Authorization, 'Bearer vw_abcdefgh12345');
  assert.equal(gesehen.opt.headers.Origin, undefined); // niemals Origin senden
});

test('pruefen: 401 wird mit Code zurückgegeben', async () => {
  const holen = async () => ({
    status: 401,
    headers: new Map([['www-authenticate', 'Bearer error_description="invalid_or_revoked"']]),
    text: async () => '{"code":"invalid_or_revoked"}',
  });
  const r = await vw.pruefen('vw_abcdefgh12345', { holen });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'invalid_or_revoked');
});

test('pruefen: Netzfehler wird sauber gemeldet', async () => {
  const holen = async () => { throw new Error('offline'); };
  const r = await vw.pruefen('vw_abcdefgh12345', { holen });
  assert.equal(r.code, 'netz');
});

test('pruefen: hängender Server läuft ins Zeitlimit statt einzufrieren (Schutz #13)', async () => {
  // Ein „holen", das nie antwortet – ohne Zeitlimit würde die Box ewig laden.
  const holen = (_u, opt) => new Promise((_, ab) => {
    if (opt && opt.signal) opt.signal.addEventListener('abort', () => ab(new Error('abgebrochen')));
  });
  const r = await vw.pruefen('vw_abcdefgh12345', { holen, zeitlimit: 20 });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'netz');
});
