'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Apps, APPS, appInfo } = require('../src/main/apps');

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
    aufrufe.push({ url: String(url), optionen, body: optionen.body ? JSON.parse(optionen.body) : null });
    for (const [muster, antwort] of routen) {
      if (String(url).includes(muster)) {
        const a = typeof antwort === 'function' ? antwort(url, optionen) : antwort;
        return { ok: a.ok !== false, status: a.status || 200, text: async () => JSON.stringify(a.daten ?? {}) };
      }
    }
    return { ok: false, status: 404, text: async () => '{"error":"nicht gefunden"}' };
  };
  fn.aufrufe = aufrufe;
  return fn;
}

function verbunden(t, id, token = 'tok') {
  t.schreiben(id, { basisUrl: `https://${id}.example.de`, token });
}

test('Apps: Registry kennt die eigenen Apps', () => {
  assert.equal(appInfo('Todoist').name, 'ToDoch');
  assert.equal(appInfo('stremio').name, 'Streamo');
  assert.equal(appInfo('vibework').name, 'VibeWork');
  assert.throws(() => appInfo('gibtsnicht'), /Unbekannte App/);
});

test('Apps: Verbinden prüft die Domain und meldet Status', () => {
  const t = tresor();
  const apps = new Apps({ fetch: fakeFetch([]), tresor: t });
  assert.throws(() => apps.verbindenApp('todoist', { basisUrl: 'keine-url' }), /Adresse/);
  apps.verbindenApp('todoist', { basisUrl: 'https://todoch.example.de/', token: 'abc' });
  const v = apps.verbunden();
  assert.equal(v.todoist, true);
  assert.equal(v.todoistUrl, 'https://todoch.example.de');
  assert.equal(v.stremio, false);
});

test('ToDoch: Aufgabe wird an {basis}/tasks mit Bearer-Token gepostet', async () => {
  const t = tresor();
  verbunden(t, 'todoist', 'tok123');
  const fetch = fakeFetch([['/tasks', { daten: { id: '9', text: 'Milch kaufen', due: 'morgen' } }]]);
  const apps = new Apps({ fetch, tresor: t });
  const r = await apps.todoistAufgabe('Milch kaufen', { faellig: 'morgen' });
  assert.equal(r.inhalt, 'Milch kaufen');
  const a = fetch.aufrufe[0];
  assert.equal(a.url, 'https://todoist.example.de/tasks');
  assert.equal(a.optionen.method, 'POST');
  assert.equal(a.optionen.headers.Authorization, 'Bearer tok123');
  assert.equal(a.body.text, 'Milch kaufen');
  assert.equal(a.body.due, 'morgen');
});

test('ToDoch: ohne Verbindung klare Fehlermeldung', async () => {
  const apps = new Apps({ fetch: fakeFetch([]), tresor: tresor() });
  await assert.rejects(() => apps.todoistAufgabe('x'), /nicht verbunden/);
});

test('Streamo: Suchen liest results, Hinzufügen postet an /list', async () => {
  const t = tresor();
  verbunden(t, 'stremio');
  const fetch = fakeFetch([
    ['/search', { daten: { results: [{ id: '1', title: 'Iron Man', type: 'film', year: '2008' }] } }],
    ['/list', { daten: { title: 'Iron Man', type: 'film' } }],
  ]);
  const apps = new Apps({ fetch, tresor: t });
  const gefunden = await apps.stremioSuchen('Iron Man');
  assert.equal(gefunden[0].name, 'Iron Man');
  const r = await apps.stremioHinzufuegen('Iron Man', { typ: 'film' });
  assert.equal(r.name, 'Iron Man');
  const put = fetch.aufrufe.find((a) => a.url.includes('/list'));
  assert.equal(put.optionen.method, 'POST');
  assert.equal(put.body.title, 'Iron Man');
  assert.equal(put.body.type, 'film');
});

test('VibeWork: Projekt anlegen, einladen, letzten Commit holen', async () => {
  const t = tresor();
  verbunden(t, 'vibework', 'tokV');
  const fetch = fakeFetch([
    ['/projects/p7/invites', { daten: { ok: true } }],
    ['/projects/p7/commits/latest', { daten: { sha: 'abc123def4', message: 'Fix', author: 'Anna', date: '2026-09-15' } }],
    ['/projects', { daten: { id: 'p7', name: 'Website' } }],
  ]);
  const apps = new Apps({ fetch, tresor: t });
  const p = await apps.vibeworkProjektAnlegen('Website');
  assert.equal(p.id, 'p7');
  const anlegen = fetch.aufrufe[0];
  assert.equal(anlegen.optionen.headers.Authorization, 'Bearer tokV');
  const ein = await apps.vibeworkEinladen('p7', 'anna@example.com');
  assert.equal(ein.person, 'anna@example.com');
  const c = await apps.vibeworkLetzterCommit('p7');
  assert.equal(c.sha, 'abc123def4');
  assert.equal(c.author, 'Anna');
});

test('Apps: Trennen und Öffnen-Ziel', () => {
  const t = tresor();
  verbunden(t, 'vibework');
  const apps = new Apps({ fetch: fakeFetch([]), tresor: t });
  assert.equal(apps.zielZumOeffnen('vibework'), 'https://vibework.example.de');
  t.loeschen('vibework');
  assert.throws(() => apps.zielZumOeffnen('vibework'), /nicht verbunden/);
});
