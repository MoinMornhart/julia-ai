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

// ─── Geräte-Anmeldung (RFC 8628, Issue #17/#13) ─────────────────────────

function jsonAntwort(status, obj) {
  return { status, headers: new Map(), text: async () => JSON.stringify(obj) };
}

test('geraetStart: liefert Code und Verifizierungs-URL', async () => {
  let gesehen = null;
  const holen = async (url, opt) => {
    gesehen = { url, body: JSON.parse(opt.body) };
    return jsonAntwort(200, {
      device_code: 'dev-123', user_code: 'BCDF-GHJK',
      verification_uri: 'https://vw.example/verbinden',
      verification_uri_complete: 'https://vw.example/verbinden?code=BCDF-GHJK',
      expires_in: 600, interval: 5, mcp_url: 'https://vw.example/api/mcp',
    });
  };
  const r = await vw.geraetStart({ basis: 'https://vw.example', scope: 'tasks', holen });
  assert.equal(r.ok, true);
  assert.equal(r.user_code, 'BCDF-GHJK');
  assert.equal(r.device_code, 'dev-123');
  assert.equal(r.mcp_url, 'https://vw.example/api/mcp');
  assert.equal(gesehen.url, 'https://vw.example/api/mcp/device');
  assert.equal(gesehen.body.client_name, 'Julia');
  assert.equal(gesehen.body.scope, 'tasks');
});

test('geraetStart: Netzfehler und unerwartete Antwort sauber', async () => {
  assert.equal((await vw.geraetStart({ holen: async () => { throw new Error('offline'); } })).code, 'netz');
  const r = await vw.geraetStart({ holen: async () => jsonAntwort(200, { foo: 1 }) });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'unerwartet');
});

test('geraetToken: bildet die RFC-8628-Zustände ab', async () => {
  const mk = (status, obj) => async () => jsonAntwort(status, obj);
  assert.equal((await vw.geraetToken({ device_code: 'd', holen: mk(400, { error: 'authorization_pending' }) })).status, 'warten');
  assert.equal((await vw.geraetToken({ device_code: 'd', holen: mk(400, { error: 'slow_down' }) })).status, 'langsamer');
  assert.equal((await vw.geraetToken({ device_code: 'd', holen: mk(400, { error: 'access_denied' }) })).status, 'abgelehnt');
  assert.equal((await vw.geraetToken({ device_code: 'd', holen: mk(400, { error: 'expired_token' }) })).status, 'abgelaufen');
  const fertig = await vw.geraetToken({ device_code: 'd', holen: mk(200, { access_token: 'vw_geheim', scope: 'tasks', mcp_url: 'u' }) });
  assert.equal(fertig.status, 'fertig');
  assert.equal(fertig.access_token, 'vw_geheim');
});

test('geraetSchleife: wartet, wird langsamer und wird am Ende fertig', async () => {
  const folge = ['authorization_pending', 'slow_down', 'authorization_pending'];
  let i = 0;
  const holen = async () => {
    if (i < folge.length) {
      const e = folge[i]; i += 1;
      return jsonAntwort(400, { error: e });
    }
    return jsonAntwort(200, { access_token: 'vw_final', scope: 'tasks', mcp_url: 'u' });
  };
  const r = await vw.geraetSchleife({ device_code: 'd', interval: 1, holen, warten: () => Promise.resolve() });
  assert.equal(r.status, 'fertig');
  assert.equal(r.access_token, 'vw_final');
});

test('geraetSchleife: Ablehnung bricht ab', async () => {
  const r = await vw.geraetSchleife({
    device_code: 'd', interval: 1,
    holen: async () => jsonAntwort(400, { error: 'access_denied' }),
    warten: () => Promise.resolve(),
  });
  assert.equal(r.status, 'abgelehnt');
});
