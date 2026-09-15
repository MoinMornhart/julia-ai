'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Apps, APPS, appInfo, zielZumOeffnen } = require('../src/main/apps');

// Einfacher Tresor im Speicher (wie der echte: null löscht ein Feld).
function tresor(anfang = {}) {
  const daten = JSON.parse(JSON.stringify(anfang));
  return {
    daten,
    lesen: (d) => (daten[d] ? { ...daten[d] } : null),
    schreiben: (d, w) => {
      const e = { ...(daten[d] || {}) };
      for (const [k, v] of Object.entries(w)) { if (v === null) delete e[k]; else e[k] = v; }
      daten[d] = e;
    },
    loeschen: (d) => { delete daten[d]; },
  };
}

// fetch-Attrappe: sammelt die Aufrufe und gibt vorbereitete Antworten zurück.
function fakeFetch(routen) {
  const aufrufe = [];
  const fn = async (url, optionen = {}) => {
    aufrufe.push({ url, optionen, body: optionen.body ? JSON.parse(optionen.body) : null });
    for (const [muster, antwort] of routen) {
      if (url.includes(muster)) {
        const a = typeof antwort === 'function' ? antwort(url, optionen) : antwort;
        return { ok: a.ok !== false, status: a.status || 200, text: async () => JSON.stringify(a.daten ?? {}) };
      }
    }
    return { ok: false, status: 404, text: async () => '{"error":"nicht gefunden"}' };
  };
  fn.aufrufe = aufrufe;
  return fn;
}

test('Apps: Registry und Öffnen-Ziele', () => {
  assert.equal(appInfo('Todoist').name, 'Todoist');
  assert.equal(zielZumOeffnen('stremio'), 'stremio://');
  assert.throws(() => appInfo('gibtsnicht'), /Unbekannte App/);
});

test('Apps: Status zeigt verbunden / nicht verbunden', () => {
  const apps = new Apps({ fetch: fakeFetch([]), tresor: tresor({ todoist: { token_verschluesselt: 'x' } }) });
  // Der echte Tresor entschlüsselt; hier prüfen wir nur verbunden() über token.
  const t = tresor();
  t.schreiben('todoist', { token: 'abc' });
  const apps2 = new Apps({ fetch: fakeFetch([]), tresor: t });
  const v = apps2.verbunden();
  assert.equal(v.todoist, true);
  assert.equal(v.stremio, false);
});

test('Todoist: Token wird geprüft', () => {
  const apps = new Apps({ fetch: fakeFetch([]), tresor: tresor() });
  assert.throws(() => apps.todoistVerbinden('zu-kurz'), /Token/);
  apps.todoistVerbinden('0123456789abcdef0123');
  assert.equal(apps.verbunden().todoist, true);
});

test('Todoist: Aufgabe wird über die REST-API angelegt', async () => {
  const t = tresor();
  t.schreiben('todoist', { token: '0123456789abcdef0123' });
  const fetch = fakeFetch([['/tasks', { daten: { id: '99', content: 'Milch kaufen', due: { string: 'morgen' } } }]]);
  const apps = new Apps({ fetch, tresor: t });
  const r = await apps.todoistAufgabe('Milch kaufen', { faellig: 'morgen' });
  assert.equal(r.inhalt, 'Milch kaufen');
  const auf = fetch.aufrufe[0];
  assert.match(auf.url, /api\.todoist\.com/);
  assert.equal(auf.optionen.method, 'POST');
  assert.equal(auf.optionen.headers.Authorization, 'Bearer 0123456789abcdef0123');
  assert.equal(auf.body.content, 'Milch kaufen');
  assert.equal(auf.body.due_string, 'morgen');
});

test('Todoist: ohne Verbindung klare Fehlermeldung', async () => {
  const apps = new Apps({ fetch: fakeFetch([]), tresor: tresor() });
  await assert.rejects(() => apps.todoistAufgabe('irgendwas'), /nicht verbunden/);
});

test('Stremio: Anmeldung merkt sich nur den authKey, nicht das Passwort', async () => {
  const t = tresor();
  const fetch = fakeFetch([['/api/login', { daten: { result: { authKey: 'KEYKEYKEYKEYKEYKEYKEY' } } }]]);
  const apps = new Apps({ fetch, tresor: t });
  await apps.stremioAnmelden({ email: 'du@example.com', passwort: 'geheim' });
  assert.equal(t.daten.stremio.token, 'KEYKEYKEYKEYKEYKEYKEY');
  assert.equal(t.daten.stremio.email, 'du@example.com');
  assert.equal(t.daten.stremio.passwort, undefined);
  // Login-Aufruf enthielt das Passwort, aber gespeichert wird es nicht.
  assert.equal(fetch.aufrufe[0].body.password, 'geheim');
});

test('Stremio: authKey darf auch direkt hinterlegt werden', async () => {
  const t = tresor();
  const apps = new Apps({ fetch: fakeFetch([]), tresor: t });
  await apps.stremioAnmelden({ authKey: 'DIREKTER-KEY-1234567890' });
  assert.equal(t.daten.stremio.token, 'DIREKTER-KEY-1234567890');
});

test('Stremio: Titel wird gesucht und in die Bibliothek gelegt', async () => {
  const t = tresor();
  t.schreiben('stremio', { token: 'KEYKEYKEYKEYKEYKEYKEY' });
  const fetch = fakeFetch([
    ['cinemeta', { daten: { metas: [{ id: 'tt0371746', name: 'Iron Man', type: 'movie', releaseInfo: '2008', poster: 'p.jpg' }] } }],
    ['datastorePut', { daten: { success: true } }],
  ]);
  const apps = new Apps({ fetch, tresor: t });
  const r = await apps.stremioHinzufuegen('Iron Man', { typ: 'film' });
  assert.equal(r.name, 'Iron Man');
  assert.equal(r.id, 'tt0371746');
  const put = fetch.aufrufe.find((a) => a.url.includes('datastorePut'));
  assert.ok(put, 'datastorePut wurde aufgerufen');
  assert.equal(put.body.authKey, 'KEYKEYKEYKEYKEYKEYKEY');
  assert.equal(put.body.collection, 'libraryItem');
  assert.equal(put.body.changes[0]._id, 'tt0371746');
  assert.equal(put.body.changes[0].removed, false);
});

test('Stremio: nichts gefunden gibt eine klare Meldung', async () => {
  const t = tresor();
  t.schreiben('stremio', { token: 'KEYKEYKEYKEYKEYKEYKEY' });
  const fetch = fakeFetch([['cinemeta', { daten: { metas: [] } }]]);
  const apps = new Apps({ fetch, tresor: t });
  await assert.rejects(() => apps.stremioHinzufuegen('gibtsnichtxyz'), /nichts/i);
});
