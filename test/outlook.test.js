'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Tresor } = require('../src/main/konten/tresor');
const { OutlookKonto, erklaeren } = require('../src/main/konten/outlook');
const { WERKZEUGE } = require('../src/main/konten/outlook-werkzeuge');
const { WERKZEUGE: GOOGLE } = require('../src/main/konten/google-werkzeuge');
const { Konten } = require('../src/main/konten');
const ampel = require('../src/main/ampel');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'julia-outlook-'));
const krypto = {
  verschluesseln: (t) => Buffer.from(t, 'utf8').toString('base64').split('').reverse().join(''),
  entschluesseln: (b) => Buffer.from(b.split('').reverse().join(''), 'base64').toString('utf8'),
};
const ID = '1a2b3c4d-1234-4abc-9def-0123456789ab';

// Ein nachgebautes Microsoft, das nur die Aufrufe mitschreibt.
function falschesMicrosoft(antworten) {
  const aufrufe = [];
  const abruf = async (url, opt = {}) => {
    aufrufe.push({ url, opt });
    for (const [muster, antwort] of antworten) {
      if (muster.test(url) && (!antwort.methode || antwort.methode === (opt.method || 'GET'))) {
        const a = typeof antwort.body === 'function' ? antwort.body(url, opt) : antwort;
        const status = a.status || antwort.status || 200;
        const body = a.body !== undefined && typeof antwort.body === 'function' ? a.body : antwort.body;
        return { ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) };
      }
    }
    throw new Error(`unerwarteter Aufruf ${opt.method || 'GET'} ${url}`);
  };
  return { abruf, aufrufe };
}

function verbundenesKonto(antworten, zeitzone = 'Europe/Berlin') {
  const tresor = new Tresor(tmp(), krypto);
  tresor.schreiben('outlook', { client_id: ID, refresh_token: 'r1' });
  const ms = falschesMicrosoft([[/oauth2\/v2\.0\/token/, { body: { access_token: 'AT', refresh_token: 'r2', expires_in: 3600 } }], ...antworten]);
  return { o: new OutlookKonto({ tresor, oeffnen: () => {}, abruf: ms.abruf, zeitzone: () => zeitzone }), tresor, ...ms };
}

test('Outlook: Anmeldung im Browser über localhost mit PKCE, ohne Secret', async () => {
  const tresor = new Tresor(tmp(), krypto);
  let felder = null;
  const { abruf } = falschesMicrosoft([
    [/oauth2\/v2\.0\/token/, { body: (url, opt) => { felder = new URLSearchParams(opt.body); return { body: { access_token: 'AT', refresh_token: 'RT', expires_in: 3600 } }; } }],
    [/graph\.microsoft\.com\/v1\.0\/me\?/, { body: { mail: 'p@outlook.com' } }],
  ]);
  let authUrl = null;
  const oeffnen = (url) => {
    authUrl = new URL(url);
    const redirect = authUrl.searchParams.get('redirect_uri');
    const q = new URLSearchParams({ state: authUrl.searchParams.get('state'), code: 'CODE1' });
    setTimeout(() => http.get(`${redirect}/?${q}`, (res) => res.resume()), 10);
  };
  const o = new OutlookKonto({ tresor, oeffnen, abruf });
  const status = await o.verbinden({ clientId: ID });
  assert.match(authUrl.searchParams.get('redirect_uri'), /^http:\/\/localhost:\d+$/);
  assert.equal(authUrl.searchParams.get('code_challenge_method'), 'S256');
  assert.match(authUrl.searchParams.get('scope'), /offline_access/);
  assert.match(authUrl.searchParams.get('scope'), /Mail\.Send/);
  assert.equal(felder.get('grant_type'), 'authorization_code');
  assert.equal(felder.get('code'), 'CODE1');
  assert.ok(felder.get('code_verifier').length >= 43);
  assert.equal(felder.get('client_secret'), null, 'öffentlicher Client, kein Secret');
  assert.equal(status.verbunden, true);
  assert.equal(status.email, 'p@outlook.com');
  const roh = fs.readFileSync(path.join(path.dirname(tresor.datei), 'konten.json'), 'utf8');
  assert.doesNotMatch(roh, /"RT"/, 'Token nie im Klartext');
});

test('Outlook: falsche Anwendungs-ID wird vor dem Browser abgelehnt', async () => {
  let geoeffnet = false;
  const o = new OutlookKonto({ tresor: new Tresor(tmp(), krypto), oeffnen: () => { geoeffnet = true; }, abruf: async () => { throw new Error('nie'); } });
  await assert.rejects(o.verbinden({ clientId: 'abc.apps.googleusercontent.com' }), /Anwendungs-ID/);
  assert.equal(geoeffnet, false);
});

test('Outlook: Token wird erneuert und das neue dauerhafte Token gespeichert', async () => {
  const { o, tresor, aufrufe } = verbundenesKonto([
    [/mailFolders\/inbox\/messages/, { body: { value: [{ id: 'm1', subject: 'Treffen', isRead: false, from: { emailAddress: { name: 'Anna', address: 'anna@example.com' } }, bodyPreview: 'Hallo' }] } }],
  ]);
  const r = await o.mailSuchen({ nur_ungelesen: true });
  assert.equal(r.mails[0].von, 'Anna <anna@example.com>');
  assert.equal(r.mails[0].ungelesen, true);
  assert.equal(tresor.lesen('outlook').refresh_token, 'r2');
  const liste = aufrufe.find((a) => /mailFolders/.test(a.url));
  assert.equal(liste.opt.headers.Authorization, 'Bearer AT');
  assert.match(decodeURIComponent(liste.url), /\$filter=isRead eq false/);
});

test('Outlook: Suche nutzt $search ohne Sortierung', async () => {
  const { o, aufrufe } = verbundenesKonto([[/\/me\/messages\?/, { body: { value: [] } }]]);
  await o.mailSuchen({ suche: 'from:anna Rechnung' });
  const u = decodeURIComponent(aufrufe.find((a) => /\/me\/messages\?/.test(a.url)).url);
  assert.match(u, /\$search="from:anna Rechnung"/);
  assert.doesNotMatch(u, /\$orderby/);
});

test('Outlook: abgelaufene Verbindung trennt sauber mit verständlicher Meldung', async () => {
  const tresor = new Tresor(tmp(), krypto);
  tresor.schreiben('outlook', { client_id: ID, refresh_token: 'r1' });
  const { abruf } = falschesMicrosoft([[/token/, { status: 400, body: { error: 'invalid_grant' } }]]);
  const o = new OutlookKonto({ tresor, oeffnen: () => {}, abruf });
  await assert.rejects(o.mailSuchen({}), /neu verbinden/);
  assert.equal(o.verbunden, false);
});

test('Outlook: Senden legt einen Entwurf an und schickt ihn ab', async () => {
  const { o, aufrufe } = verbundenesKonto([
    [/\/me\/messages$/, { methode: 'POST', body: { id: 'd1' } }],
    [/\/me\/messages\/d1\/send$/, { methode: 'POST', status: 202, body: {} }],
  ]);
  const id = await o.mailSenden({ an: ['Anna Müller <anna@example.com>'], betreff: 'Heute', text: 'Ich komme später.' });
  assert.equal(id, 'd1');
  const entwurf = JSON.parse(aufrufe.find((a) => /\/me\/messages$/.test(a.url)).opt.body);
  assert.deepEqual(entwurf.toRecipients, [{ emailAddress: { name: 'Anna Müller', address: 'anna@example.com' } }]);
  assert.deepEqual(entwurf.body, { contentType: 'Text', content: 'Ich komme später.' });
  assert.equal(entwurf.subject, 'Heute');
  assert.ok(aufrufe.some((a) => /\/d1\/send$/.test(a.url)));
});

test('Outlook: Antwort bleibt im Verlauf (createReply statt neuer Mail)', async () => {
  const { o, aufrufe } = verbundenesKonto([
    [/\/me\/messages\/m9\/createReply$/, { methode: 'POST', body: { id: 'd2' } }],
    [/\/me\/messages\/d2$/, { methode: 'PATCH', body: { id: 'd2' } }],
  ]);
  await o.mailEntwurf({ an: ['anna@example.com'], text: 'Passt!', antwort_auf_id: 'm9' });
  assert.ok(aufrufe.some((a) => /createReply$/.test(a.url)));
  assert.equal(aufrufe.some((a) => /\/me\/messages$/.test(a.url)), false);
});

test('Outlook: zu große Anhänge brechen ab, bevor ein Entwurf entsteht', async () => {
  const dir = tmp();
  const gross = path.join(dir, 'gross.bin');
  fs.writeFileSync(gross, Buffer.alloc(3 * 1024 * 1024 + 1));
  const { o, aufrufe } = verbundenesKonto([]);
  await assert.rejects(o.mailEntwurf({ an: ['a@example.com'], text: 'x', anhaenge: [gross] }), /3 MB/);
  assert.equal(aufrufe.filter((a) => /graph/.test(a.url)).length, 0);
});

test('Outlook: Termine ganztägig und mit Uhrzeit in der Zeitzone des Nutzers', async () => {
  const { o, aufrufe } = verbundenesKonto([[/\/me\/events$/, { methode: 'POST', body: { id: 'e1' } }]]);
  await o.terminAnlegen({ titel: 'Urlaub', start: '2026-09-15' });
  await o.terminAnlegen({ titel: 'Planung', start: '2026-09-15T14:00', dauer_minuten: 90, teilnehmer: ['anna@example.com'] });
  const [ganz, mit] = aufrufe.filter((a) => /\/me\/events$/.test(a.url)).map((a) => JSON.parse(a.opt.body));
  assert.equal(ganz.isAllDay, true);
  assert.deepEqual(ganz.start, { dateTime: '2026-09-15T00:00:00', timeZone: 'Europe/Berlin' });
  assert.deepEqual(ganz.end, { dateTime: '2026-09-16T00:00:00', timeZone: 'Europe/Berlin' });
  assert.deepEqual(mit.start, { dateTime: '2026-09-15T14:00:00', timeZone: 'Europe/Berlin' });
  assert.deepEqual(mit.end, { dateTime: '2026-09-15T15:30:00', timeZone: 'Europe/Berlin' });
  assert.deepEqual(mit.attendees, [{ emailAddress: { address: 'anna@example.com' }, type: 'required' }]);
});

test('Outlook: Werkzeuge – Lesen GRÜN, Senden GELB mit ganzem Text, keine Namensgleichheit mit Google', () => {
  const ctx = { arbeitsordner: () => 'C:\\Users\\p', config: { get: () => ['C:\\Users\\p'] }, datenOrdner: 'C:\\d', appOrdner: 'C:\\a' };
  const w = (n) => WERKZEUGE.find((x) => x.name === n);
  assert.equal(w('outlook_mail_suchen').einstufen({}, ctx).stufe, ampel.GRUEN);
  const s = w('outlook_mail_senden').einstufen({ an: ['anna@example.com'], text: 'Ich komme später.\nGruß' }, ctx);
  assert.equal(s.stufe, ampel.GELB);
  assert.equal(s.kategorie, 'nachricht');
  assert.match(s.beschreibung, /Ich komme später\.\nGruß/);
  assert.equal(w('outlook_termin_anlegen').einstufen({ titel: 'x', start: '2026-09-15T14:00', teilnehmer: ['a@example.com'] }).kategorie, 'nachricht');
  const namen = new Set(GOOGLE.map((x) => x.name));
  for (const x of WERKZEUGE) {
    assert.ok(!namen.has(x.name), x.name);
    assert.match(x.name, /^outlook_/);
  }
});

test('Outlook: Werkzeuge gibt es nur, solange das Konto verbunden ist', () => {
  const k = new Konten({ ordner: tmp(), krypto, oeffnen: () => {} });
  assert.equal(k.werkzeuge().some((x) => x.name.startsWith('outlook_')), false);
  k.tresor.schreiben('outlook', { client_id: ID, refresh_token: 'r', email: 'p@outlook.com' });
  assert.equal(k.werkzeuge().some((x) => x.name === 'outlook_mail_senden'), true);
  assert.match(k.beschreibung().map((b) => b.dienst).join(), /Outlook/);
});

test('Outlook: Microsoft-Fehlercodes werden verständlich erklärt', () => {
  assert.match(erklaeren('AADSTS700016: Application with identifier was not found'), /Anwendungs-ID/);
  assert.match(erklaeren('AADSTS50011: The redirect URI'), /localhost/);
  assert.match(erklaeren('AADSTS7000218: The request body must contain client_assertion'), /öffentlichen Clientflows/);
});

test('Outlook: mit eingebauter Anwendungs-ID reicht ein Klick, eine eigene ID geht vor', async () => {
  const EIGEN = '9f8e7d6c-1234-4abc-9def-0123456789ab';
  const ohneBrowser = (id) => {
    let gefragt = null;
    const o = new OutlookKonto({
      tresor: new Tresor(tmp(), krypto),
      oeffnen: (url) => { gefragt = new URL(url).searchParams.get('client_id'); throw new Error('Test: kein Browser'); },
      abruf: async () => { throw new Error('nie'); },
      eingebauteId: id,
    });
    return { o, gefragt: () => gefragt };
  };
  const mit = ohneBrowser(ID);
  assert.equal(mit.o.status().eingebaut, true);
  assert.equal(mit.o.status().clientId, '', 'eingebaute ID erscheint nicht als eigene');
  await assert.rejects(mit.o.verbinden({}), /kein Browser/);
  assert.equal(mit.gefragt(), ID);
  await assert.rejects(mit.o.verbinden({ clientId: EIGEN }), /kein Browser/);
  assert.equal(mit.gefragt(), EIGEN);
  const ohne = ohneBrowser('');
  assert.equal(ohne.o.status().eingebaut, false);
  await assert.rejects(ohne.o.verbinden({}), /Trag eine Anwendungs-ID ein/);
});
