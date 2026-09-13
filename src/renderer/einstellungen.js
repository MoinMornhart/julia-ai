'use strict';

// Einstellungen und Ersteinrichtung. Jede Änderung wird sofort gespeichert und
// wirkt ohne Neustart; nur der API-Schlüssel wird erst mit dem Knopf übernommen.

const $ = (id) => document.getElementById(id);
const einrichtung = new URLSearchParams(location.search).get('einrichtung') === '1';
const ZUSTAENDE = ['idle', 'listening', 'thinking', 'speaking'];
const STANDARDFARBEN = {
  idle: ['#6B5CFF', '#35E0C8'],
  listening: ['#35E0C8', '#FF6F9C'],
  thinking: ['#FFC15E', '#FF6F9C'],
  speaking: ['#FF6F9C', '#6B5CFF'],
};

let T = {};
let cfg = null;

function tx(k, werte) {
  let s = T[k] ?? k;
  if (werte) for (const [a, b] of Object.entries(werte)) s = s.split(`{${a}}`).join(String(b));
  return s;
}

function holen(obj, schluessel) {
  return schluessel.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

function texteAnwenden(daten) {
  T = daten.texte;
  document.documentElement.lang = daten.sprachcode;
  document.title = tx('einst.titel');
  document.querySelectorAll('[data-t]').forEach((el) => { el.textContent = tx(el.dataset.t); });
  $('speichern').textContent = tx(einrichtung ? 'einst.fertig' : 'einst.speichern');
  if (cfg) {
    monitoreFuellen();
    ordnerZeigen();
    farbenZeigen();
    schluesselHinweis();
  }
}

function fehlerZeigen(el, text) {
  const behaelter = el.closest('.feld, .regler, .farbe') || el.parentElement;
  let f = behaelter.querySelector('.fehler');
  if (!text) { if (f) f.remove(); return; }
  if (!f) {
    f = document.createElement('small');
    f.className = 'fehler';
    behaelter.appendChild(f);
  }
  f.textContent = text;
}

async function setzen(schluessel, wert, el) {
  const r = await julia.setzen(schluessel, wert);
  if (el) fehlerZeigen(el, r.fehler);
  return r;
}

function wertLesen(el) {
  if (el.type === 'checkbox') return el.checked;
  if ('zahl' in el.dataset) return Number(el.value);
  return el.value;
}

function ausgabe(el) {
  const out = el.parentElement.querySelector('output');
  if (out) out.textContent = el.value;
}

function felderFuellen() {
  document.querySelectorAll('[data-k]').forEach((el) => {
    const w = holen(cfg, el.dataset.k);
    if (el.type === 'checkbox') el.checked = !!w;
    else if (w != null) el.value = String(w);
    if (el.type === 'range') ausgabe(el);
  });
}

function felderVerbinden() {
  document.querySelectorAll('[data-k]').forEach((el) => {
    if (el.type === 'range') {
      el.addEventListener('input', () => {
        ausgabe(el);
        if ('live' in el.dataset) setzen(el.dataset.k, wertLesen(el), el);
      });
    }
    el.addEventListener('change', async () => {
      const r = await setzen(el.dataset.k, wertLesen(el), el);
      if (!r.fehler && el.dataset.k === 'sprachcode') texteAnwenden(await julia.texte());
    });
  });
}

function monitoreFuellen() {
  const sel = $('monitor');
  const gewaehlt = cfg.blase.monitor;
  sel.innerHTML = '';
  const liste = cfg.monitore.map((m) => ({ i: m.index, text: `${m.index === 0 ? tx('monitor.0') : tx('monitor.n', { n: m.index + 1 })} · ${m.breite}×${m.hoehe}` }));
  if (!liste.some((m) => m.i === gewaehlt)) liste.push({ i: gewaehlt, text: `${tx('monitor.n', { n: gewaehlt + 1 })} · –` });
  for (const m of liste) {
    const o = document.createElement('option');
    o.value = String(m.i);
    o.textContent = m.text;
    sel.appendChild(o);
  }
  sel.value = String(gewaehlt);
}

function ordnerZeigen() {
  const ul = $('ordnerListe');
  ul.innerHTML = '';
  if (!cfg.arbeitsverzeichnisse.length) {
    const li = document.createElement('li');
    li.className = 'leer';
    li.textContent = '–';
    ul.appendChild(li);
  }
  cfg.arbeitsverzeichnisse.forEach((p, i) => {
    const li = document.createElement('li');
    const span = document.createElement('span');
    span.textContent = p;
    span.title = p;
    const b = document.createElement('button');
    b.textContent = tx('einst.entfernen');
    b.onclick = async () => {
      const neu = cfg.arbeitsverzeichnisse.filter((_, j) => j !== i);
      const r = await setzen('arbeitsverzeichnisse', neu);
      if (!r.fehler) { cfg.arbeitsverzeichnisse = r.wert; ordnerZeigen(); }
    };
    li.append(span, b);
    ul.appendChild(li);
  });
}

function farbenZeigen() {
  const box = $('farben');
  box.innerHTML = '';
  for (const z of ZUSTAENDE) {
    const zeile = document.createElement('div');
    zeile.className = 'farbe';
    const name = document.createElement('span');
    name.className = 'zname';
    name.textContent = tx(`zustand.${z}`);
    const muster = document.createElement('span');
    muster.className = 'muster';
    const input = document.createElement('input');
    input.value = cfg.blase.farben[z].join(', ');
    input.spellcheck = false;
    const malen = (liste) => {
      muster.innerHTML = '';
      for (const f of liste) {
        const i = document.createElement('i');
        i.style.background = f;
        muster.appendChild(i);
      }
    };
    malen(cfg.blase.farben[z]);
    input.addEventListener('change', async () => {
      const r = await setzen(`blase.farben.${z}`, input.value, input);
      if (!r.fehler) { cfg.blase.farben[z] = r.wert; input.value = r.wert.join(', '); malen(r.wert); }
    });
    zeile.append(name, muster, input);
    box.appendChild(zeile);
  }
}

function schluesselHinweis() {
  $('schluesselHinweis').textContent = cfg.schluesselGesetzt ? tx('einst.schluessel_gesetzt') : tx('einst.schluessel_hinweis');
}

async function stimmenLaden() {
  const sel = $('stimme');
  const stimmen = await julia.stimmen();
  sel.innerHTML = '';
  const aktuell = cfg.sprache.stimme;
  if (!stimmen.some((s) => s.name === aktuell)) stimmen.unshift({ name: aktuell, kultur: '?' });
  for (const s of stimmen) {
    const o = document.createElement('option');
    o.value = s.name;
    o.textContent = `${s.name.replace(/^Microsoft /, '').replace(/ Desktop$/, '')} (${s.kultur})`;
    sel.appendChild(o);
  }
  sel.value = aktuell;
}

function melden(text, fehler = false) {
  const m = $('meldung');
  m.textContent = text;
  m.classList.toggle('fehler', fehler);
}

async function speichern() {
  const name = $('name').value.trim();
  const schluessel = $('schluessel').value.trim();
  if (name) await setzen('nutzer.name', name, $('name'));
  if (schluessel) {
    const r = await julia.schluesselSetzen(schluessel);
    if (r.fehler) { melden(r.fehler, true); return; }
    $('schluessel').value = '';
    cfg.schluesselGesetzt = true;
    schluesselHinweis();
  }
  if (einrichtung) {
    if (!name) { melden(tx('einst.fehlt_name'), true); $('name').focus(); return; }
    if (!cfg.schluesselGesetzt) { melden(tx('einst.fehlt_schluessel'), true); $('schluessel').focus(); return; }
    await julia.einrichtungFertig();
    return;
  }
  melden(tx('einst.gespeichert'));
  setTimeout(() => julia.schliessen(), 600);
}

async function init() {
  cfg = await julia.config();
  texteAnwenden(await julia.texte());
  $('version').textContent = `${tx('einst.version')} ${cfg.version}`;
  $('willkommen').hidden = !einrichtung;
  felderFuellen();
  felderVerbinden();
  monitoreFuellen();
  ordnerZeigen();
  farbenZeigen();
  schluesselHinweis();

  $('ordnerHinzu').onclick = async () => {
    const p = await julia.ordnerWaehlen();
    if (!p || cfg.arbeitsverzeichnisse.includes(p)) return;
    const r = await setzen('arbeitsverzeichnisse', [...cfg.arbeitsverzeichnisse, p]);
    if (!r.fehler) { cfg.arbeitsverzeichnisse = r.wert; ordnerZeigen(); }
  };
  $('standardfarben').onclick = async () => {
    const r = await setzen('blase.farben', STANDARDFARBEN);
    if (!r.fehler) { cfg.blase.farben = r.wert; farbenZeigen(); }
  };
  $('speichern').onclick = speichern;

  julia.on('config:geaendert', (neu) => {
    const fokus = document.activeElement;
    cfg = { ...neu };
    document.querySelectorAll('[data-k]').forEach((el) => {
      if (el === fokus) return;
      const w = holen(cfg, el.dataset.k);
      if (el.type === 'checkbox') el.checked = !!w;
      else if (w != null && el.value !== String(w)) { el.value = String(w); if (el.type === 'range') ausgabe(el); }
    });
  });
  julia.on('texte:geaendert', texteAnwenden);

  stimmenLaden();
  if (einrichtung) $('name').focus();
}

init();
