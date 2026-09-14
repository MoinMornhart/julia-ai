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
let kontenStand = null;

const AKZENTE = [
  ['glut', '#FF7A1A'],
  ['neon', '#8B5CFF'],
  ['cyber', '#00D1FF'],
  ['toxic', '#39FF88'],
  ['magenta', '#FF3DA5'],
  ['blut', '#FF3B3B'],
  ['gold', '#FFC23D'],
];

const ANLEITUNG = {
  de: 'https://github.com/MoinMornhart/julia-ai-web/blob/main/docs/google-einrichten.md',
  en: 'https://github.com/MoinMornhart/julia-ai-web/blob/main/docs/google-setup.en.md',
};
const ANLEITUNG_OUTLOOK = {
  de: 'https://github.com/MoinMornhart/julia-ai-web/blob/main/docs/outlook-einrichten.md',
  en: 'https://github.com/MoinMornhart/julia-ai-web/blob/main/docs/outlook-setup.en.md',
};
const ANLEITUNG_UNTERWEGS = {
  de: 'https://github.com/MoinMornhart/julia-ai-web/blob/main/docs/unterwegs.md',
  en: 'https://github.com/MoinMornhart/julia-ai-web/blob/main/docs/unterwegs.en.md',
};

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
    anbieterZeigen();
  }
  $('googleAnleitung').href = ANLEITUNG[daten.sprachcode] || ANLEITUNG.de;
  $('outlookAnleitung').href = ANLEITUNG_OUTLOOK[daten.sprachcode] || ANLEITUNG_OUTLOOK.de;
  $('handyUnterwegsAnleitung').href = ANLEITUNG_UNTERWEGS[daten.sprachcode] || ANLEITUNG_UNTERWEGS.de;
  if (kontenStand) kontenZeigen(kontenStand);
  if (handyStand) handyZeigen(handyStand);
  if (syncStand) syncZeigen(syncStand);
  if (cfg) designZeigen();
}

// --- Kostenbremse ---

function kostenZeigen(k) {
  const betrag = Number(k && k.usd) || 0;
  const zahl = betrag.toLocaleString(document.documentElement.lang === 'en' ? 'en-GB' : 'de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  $('kostenHeute').textContent = tx('einst.kosten_heute', { usd: zahl, anfragen: (k && k.anfragen) || 0 });
}

// --- Handy im WLAN ---

let handyStand = null;
let qrTimer = null;

function handyZeigen(s) {
  handyStand = s;
  $('kontoHandy').classList.toggle('verbunden', s.laeuft && s.gekoppelt);
  let status = tx('handy.aus');
  if (s.fehler === 'port_belegt') status = tx('handy.fehler_port', { port: cfg ? cfg.handy.port : '' });
  else if (s.fehler) status = s.fehler;
  else if (s.laeuft && s.gekoppelt) status = tx('handy.gekoppelt', { geraet: s.geraet || '?' });
  else if (s.laeuft) status = tx('handy.bereit');
  $('handyStatus').textContent = status;
  $('handyBereich').hidden = !s.laeuft;
  $('handyTrennen').hidden = !s.gekoppelt;
  $('handyKoppeln').textContent = tx(s.gekoppelt ? 'handy.neu_koppeln' : 'handy.koppeln');
  // Nach dem Koppeln (oder wenn der Code abgelaufen ist) verschwindet der QR-Code.
  if (!s.koppelnBis || s.koppelnBis < Date.now()) $('handyKopplung').hidden = true;
  $('handyFinger').textContent = s.fingerabdruck || '';
  const vpn = s.unterwegs || [];
  $('handyUnterwegs').textContent = vpn.length ? tx('handy.unterwegs_an', { adresse: vpn[0] }) : tx('handy.unterwegs_aus');
}

function handyMeldung(text, fehler = false) {
  const m = $('handyMeldung');
  m.textContent = text || '';
  m.classList.toggle('fehler', fehler);
}

function qrMalen(zeilen) {
  const c = $('handyQr');
  const n = zeilen.length;
  const zelle = Math.floor(c.width / (n + 8));
  const versatz = Math.floor((c.width - zelle * n) / 2);
  const g = c.getContext('2d');
  g.fillStyle = '#FFFFFF';
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#000000';
  zeilen.forEach((z, r) => {
    for (let i = 0; i < n; i++) if (z[i] === '1') g.fillRect(versatz + i * zelle, versatz + r * zelle, zelle, zelle);
  });
}

function handyVerbinden() {
  $('handyKoppeln').onclick = async () => {
    handyMeldung('');
    const r = await julia.handyKoppeln();
    handyZeigen(r.status);
    if (r.fehler) { handyMeldung(r.fehler, true); return; }
    qrMalen(r.qr);
    $('handyAdresse').textContent = r.url.split('#')[0];
    $('handyKopplung').hidden = false;
    clearTimeout(qrTimer);
    qrTimer = setTimeout(() => { $('handyKopplung').hidden = true; }, Math.max(0, r.bis - Date.now()));
  };
  $('handyTrennen').onclick = async () => {
    handyZeigen(await julia.handyTrennen());
    handyMeldung('');
  };
  julia.on('handy:status', handyZeigen);
}

// --- Geräte-Abgleich ---

let syncStand = null;

function syncFehlerText(code) {
  const k = `sync.fehler_${code}`;
  const t = tx(k);
  return t !== k ? t : tx('sync.problem', { fehler: code });
}

function syncZeigen(s) {
  syncStand = s;
  $('kontoSync').classList.toggle('verbunden', s.laeuft && s.geraete.length > 0);
  let status = tx('sync.aus');
  if (s.fehler === 'port_belegt') status = tx('sync.fehler_port', { port: cfg ? cfg.sync.port : '' });
  else if (s.fehler) status = s.fehler;
  else if (s.laeuft) status = tx('sync.bereit', { geraet: s.name, n: s.geraete.length });
  $('syncStatus').textContent = status;
  $('syncBereich').hidden = !s.laeuft;
  $('syncAdressen').textContent = s.adressen.length ? tx('sync.adressen', { adressen: s.adressen.join(', ') }) : '';
  const liste = $('syncGeraete');
  liste.innerHTML = '';
  if (!s.geraete.length) {
    const li = document.createElement('li');
    li.className = 'leer';
    li.textContent = tx('sync.keine');
    liste.appendChild(li);
  }
  for (const g of s.geraete) {
    const li = document.createElement('li');
    const text = document.createElement('div');
    const name = document.createElement('strong');
    name.textContent = g.name;
    const zeile = document.createElement('small');
    const uhr = g.zuletzt ? new Date(g.zuletzt).toLocaleTimeString(document.documentElement.lang || 'de', { hour: '2-digit', minute: '2-digit' }) : '';
    zeile.textContent = g.fehler ? syncFehlerText(g.fehler) : g.zuletzt ? tx('sync.zuletzt', { zeit: uhr }) : tx('sync.nie');
    text.append(name, zeile);
    const weg = document.createElement('button');
    weg.className = 'zweit';
    weg.textContent = tx('sync.entfernen');
    weg.onclick = async () => syncZeigen(await julia.syncEntfernen(g.id));
    li.append(text, weg);
    liste.appendChild(li);
  }
  $('syncCodeBox').hidden = !s.code;
  $('syncCode').textContent = s.code ? s.code.code : '';
}

function syncMeldung(text, fehler = false) {
  const m = $('syncMeldung');
  m.textContent = text || '';
  m.classList.toggle('fehler', fehler);
}

function syncVerbinden() {
  $('syncCodeZeigen').onclick = async () => {
    syncMeldung('');
    $('syncEingabeBox').hidden = true;
    const r = await julia.syncCode();
    syncZeigen(r.status);
    if (r.fehler) syncMeldung(r.fehler, true);
  };
  $('syncCodeEingeben').onclick = () => {
    syncMeldung('');
    $('syncEingabeBox').hidden = !$('syncEingabeBox').hidden;
    if (!$('syncEingabeBox').hidden) $('syncCodeFeld').focus();
  };
  $('syncVerbinden').onclick = async () => {
    const knopf = $('syncVerbinden');
    knopf.disabled = true;
    syncMeldung(tx('sync.sucht'));
    const r = await julia.syncBeitreten({ code: $('syncCodeFeld').value, adresse: $('syncAdresseFeld').value });
    knopf.disabled = false;
    syncZeigen(r.status);
    if (r.fehler) { syncMeldung(r.fehler, true); return; }
    $('syncCodeFeld').value = '';
    $('syncAdresseFeld').value = '';
    $('syncEingabeBox').hidden = true;
    syncMeldung(tx('sync.gekoppelt', { geraet: r.name }));
  };
  $('syncJetzt').onclick = async () => {
    syncMeldung('');
    syncZeigen(await julia.syncJetzt());
  };
  julia.on('sync:status', syncZeigen);
}

// --- Design ---

function mischen(hex, ziel, anteil) {
  const a = parseInt(hex.slice(1), 16);
  const b = parseInt(ziel.slice(1), 16);
  const kanal = (x, s) => (x >> s) & 255;
  const m = (s) => Math.round(kanal(a, s) + (kanal(b, s) - kanal(a, s)) * anteil);
  return '#' + [16, 8, 0].map((s) => m(s).toString(16).padStart(2, '0')).join('').toUpperCase();
}

function designZeigen() {
  const d = cfg.design;
  document.querySelectorAll('#modus button').forEach((b) => b.classList.toggle('aktiv', b.dataset.wert === d.modus));
  const box = $('akzente');
  box.innerHTML = '';
  const gleich = (a, b) => String(a).toUpperCase() === String(b).toUpperCase();
  for (const [name, hex] of AKZENTE) {
    const b = document.createElement('button');
    b.className = 'akzent-knopf' + (gleich(hex, d.akzent) ? ' aktiv' : '');
    b.style.setProperty('--farbe', hex);
    const muster = document.createElement('i');
    muster.style.background = hex;
    const text = document.createElement('span');
    text.textContent = tx(`design.p.${name}`);
    b.append(muster, text);
    b.onclick = () => akzentSetzen(hex);
    box.appendChild(b);
  }
  const eigen = document.createElement('label');
  const istEigen = !AKZENTE.some(([, h]) => gleich(h, d.akzent));
  eigen.className = 'akzent-knopf akzent-eigen' + (istEigen ? ' aktiv' : '');
  eigen.style.setProperty('--farbe', d.akzent);
  const muster = document.createElement('i');
  const text = document.createElement('span');
  text.textContent = tx('design.eigene');
  const waehler = document.createElement('input');
  waehler.type = 'color';
  waehler.value = d.akzent.toLowerCase();
  waehler.addEventListener('input', () => window.juliaDesign.setzen({ akzent: waehler.value }));
  waehler.addEventListener('change', () => akzentSetzen(waehler.value));
  eigen.append(muster, text, waehler);
  box.appendChild(eigen);
}

async function akzentSetzen(hex) {
  const r = await setzen('design.akzent', hex);
  if (!r.fehler) {
    cfg.design.akzent = r.wert;
    designZeigen();
  }
}

function designVerbinden() {
  document.querySelectorAll('#modus button').forEach((b) => {
    b.onclick = async () => {
      const r = await setzen('design.modus', b.dataset.wert);
      if (!r.fehler) { cfg.design.modus = r.wert; designZeigen(); }
    };
  });
  // Blasenfarben aus der Akzentfarbe ableiten, damit alles zusammenpasst.
  $('blaseAkzent').onclick = async () => {
    const a = cfg.design.akzent;
    const farben = {
      idle: [a, mischen(a, '#1A1030', 0.55)],
      listening: [mischen(a, '#FFFFFF', 0.25), '#FF6F9C'],
      thinking: [mischen(a, '#FFC15E', 0.4), a],
      speaking: [a, mischen(a, '#FFFFFF', 0.45)],
    };
    const r = await setzen('blase.farben', farben);
    if (!r.fehler) { cfg.blase.farben = r.wert; farbenZeigen(); }
  };
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
    const freigabe = { 'freigabe.immer': julia.alleFreigeben, 'freigabe.fremd': julia.fremdFreigeben }[el.dataset.k];
    if (freigabe) {
      // Einschalten nur über die Rückfrage im Hauptprozess.
      el.addEventListener('change', async () => { el.checked = !!(await freigabe(el.checked)).wert; });
      return;
    }
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

// Monitorauswahl für Blase und Overlay.
function monitoreFuellen() {
  for (const [id, gewaehlt] of [['monitor', cfg.blase.monitor], ['overlayMonitor', cfg.overlay.monitor]]) {
    const sel = $(id);
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

// --- KI-Anbieter ---

function aktuellerAnbieter() {
  const liste = cfg.anbieterListe || [];
  return liste.find((a) => a.id === cfg.anbieter) || liste[0] || { id: 'anthropic', art: 'anthropic', modelle: [], brauchtSchluessel: true };
}

function modelleZeigen(modelle) {
  const dl = $('modelle');
  dl.innerHTML = '';
  for (const m of modelle || []) {
    const o = document.createElement('option');
    o.value = m;
    dl.appendChild(o);
  }
}

function anbieterZeigen() {
  const sel = $('anbieter');
  sel.innerHTML = '';
  for (const a of cfg.anbieterListe || []) {
    const o = document.createElement('option');
    o.value = a.id;
    o.textContent = a.id === 'claude-abo' ? tx('einst.anbieter_abo') : a.name;
    sel.appendChild(o);
  }
  sel.value = cfg.anbieter;
  const a = aktuellerAnbieter();
  $('anbieterUrlFeld').hidden = !a.eigeneUrl;
  $('schluesselFeld').hidden = !(a.brauchtSchluessel || a.eigeneUrl);
  $('schluesselLabel').textContent = tx('einst.schluessel', { anbieter: a.name || '' });
  $('schluessel').placeholder = a.schluessel || '';
  $('schluesselSeite').hidden = !a.seite;
  if (a.seite) $('schluesselSeite').href = a.seite;
  $('aufwandFeld').hidden = !(a.art === 'anthropic' || a.art === 'claude-code');
  const hinweis = a.id === 'claude-abo' ? 'einst.abo_hinweis' : a.lokal ? 'einst.lokal_hinweis' : a.art === 'openai' ? 'einst.fremd_hinweis' : '';
  $('anbieterHinweis').hidden = !hinweis;
  $('anbieterHinweis').textContent = hinweis ? tx(hinweis) : '';
  $('modelleMeldung').textContent = '';
  modelleZeigen(a.modelle);
  schluesselHinweis();
}

function anbieterVerbinden() {
  $('anbieter').addEventListener('change', async () => {
    const r = await julia.anbieterSetzen($('anbieter').value);
    cfg = { ...cfg, ...r.config };
    felderFuellen();
    anbieterZeigen();
    if (r.fehler) melden(r.fehler, true);
  });
  $('modelleLaden').addEventListener('click', async (e) => {
    e.preventDefault();
    $('modelleMeldung').textContent = '…';
    const r = await julia.modelleLaden();
    if (r.fehler) {
      $('modelleMeldung').textContent = r.fehler;
      return;
    }
    modelleZeigen(r.modelle);
    $('modelleMeldung').textContent = tx('einst.modelle_geladen', { anzahl: r.modelle.length });
  });
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

// Mikrofon und Lautsprecher: "Windows-Standard" oder ein bestimmtes Gerät.
async function geraeteLaden() {
  const g = await julia.audioGeraete();
  $('audioHinweis').textContent = g.fehler ? tx('einst.audio_fehler', { fehler: g.fehler }) : '';
  for (const [id, liste, schluessel] of [['mikrofon', g.eingaenge, 'mikrofon'], ['lautsprecher', g.ausgaenge, 'lautsprecher']]) {
    const sel = $(id);
    const aktuell = cfg.sprache[schluessel] || '';
    sel.innerHTML = '';
    const optionen = [['', tx('einst.standardgeraet')], ...liste.map((n) => [n, n])];
    if (aktuell && !liste.includes(aktuell)) optionen.push([aktuell, `${aktuell} ${tx('einst.nicht_verbunden')}`]);
    for (const [wert, text] of optionen) {
      const o = document.createElement('option');
      o.value = wert;
      o.textContent = text;
      sel.appendChild(o);
    }
    sel.value = aktuell;
  }
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
  }
  cfg = await julia.config();
  schluesselHinweis();
  if (einrichtung) {
    if (!name) { melden(tx('einst.fehlt_name'), true); $('name').focus(); return; }
    if (!cfg.bereit) {
      const a = aktuellerAnbieter();
      if (a.eigeneUrl && !cfg.anbieter_url) { melden(tx('einst.fehlt_url'), true); $('anbieterUrl').focus(); return; }
      if (a.id === 'claude-abo') { melden(tx('einst.fehlt_claude'), true); return; }
      melden(tx('einst.fehlt_schluessel'), true);
      $('schluessel').focus();
      return;
    }
    await julia.einrichtungFertig();
    return;
  }
  melden(tx('einst.gespeichert'));
  setTimeout(() => julia.schliessen(), 600);
}

// --- Verbindungen ---

// Mit eingebauter Outlook-ID bleibt das Feld für eine eigene ID versteckt,
// bis man es ausdrücklich öffnet.
let outlookEigene = false;

function kontenZeigen(status) {
  kontenStand = status;
  const g = status.google;
  $('kontoGoogle').classList.toggle('verbunden', g.verbunden);
  $('googleStatus').textContent = g.verbunden ? tx('konten.verbunden_als', { email: g.email || '?' }) : tx('konten.nicht_verbunden');
  $('googleTrennen').hidden = !g.verbunden;
  $('googleEinrichten').hidden = g.verbunden;
  if (g.clientId && !$('googleClientId').value) $('googleClientId').value = g.clientId;
  $('googleSecretHinweis').textContent = g.clientIdGesetzt ? tx('konten.secret_gespeichert') : '';
  const o = status.outlook;
  if (o) {
    $('kontoOutlook').classList.toggle('verbunden', o.verbunden);
    $('outlookStatus').textContent = o.verbunden ? tx('konten.verbunden_als', { email: o.email || '?' }) : tx('konten.nicht_verbunden');
    $('outlookTrennen').hidden = !o.verbunden;
    $('outlookEinrichten').hidden = o.verbunden;
    if (o.clientId && !$('outlookClientId').value) $('outlookClientId').value = o.clientId;
    const einfach = o.eingebaut && !o.clientIdGesetzt && !outlookEigene;
    $('outlookText').textContent = tx(o.eingebaut ? 'konten.outlook_text_einfach' : 'konten.outlook_text');
    $('outlookIdFeld').hidden = einfach;
    $('outlookEigeneId').hidden = !einfach;
  }
}

function kontoMeldung(text, fehler = false, id = 'googleMeldung') {
  const m = $(id);
  m.textContent = text || '';
  m.classList.toggle('fehler', fehler);
}

function kontenVerbinden() {
  $('googleVerbinden').onclick = async () => {
    const knopf = $('googleVerbinden');
    knopf.disabled = true;
    kontoMeldung(tx('konten.warte_browser'));
    const r = await julia.googleVerbinden({
      clientId: $('googleClientId').value.trim(),
      clientSecret: $('googleClientSecret').value.trim(),
    });
    knopf.disabled = false;
    $('googleClientSecret').value = '';
    kontenZeigen(r.status);
    kontoMeldung(r.fehler || '', !!r.fehler);
  };
  $('googleTrennen').onclick = async () => {
    const r = await julia.googleTrennen();
    kontenZeigen(r.status);
    kontoMeldung(r.fehler || '', !!r.fehler);
  };
  $('outlookVerbinden').onclick = async () => {
    const knopf = $('outlookVerbinden');
    knopf.disabled = true;
    kontoMeldung(tx('konten.warte_browser'), false, 'outlookMeldung');
    const r = await julia.outlookVerbinden({ clientId: $('outlookClientId').value.trim() });
    knopf.disabled = false;
    kontenZeigen(r.status);
    kontoMeldung(r.fehler || '', !!r.fehler, 'outlookMeldung');
  };
  $('outlookEigeneId').onclick = (e) => {
    e.preventDefault();
    outlookEigene = true;
    if (kontenStand) kontenZeigen(kontenStand);
    $('outlookClientId').focus();
  };
  $('outlookTrennen').onclick = async () => {
    const r = await julia.outlookTrennen();
    kontenZeigen(r.status);
    kontoMeldung(r.fehler || '', !!r.fehler, 'outlookMeldung');
  };
}

async function init() {
  cfg = await julia.config();
  texteAnwenden(await julia.texte());
  $('version').textContent = `${tx('einst.version')} ${cfg.version}`;
  $('willkommen').hidden = !einrichtung;
  felderFuellen();
  felderVerbinden();
  const pronomenUmschalten = () => { $('pronomenEigenFeld').hidden = $('pronomen').value !== 'eigene'; };
  $('pronomen').addEventListener('change', pronomenUmschalten);
  pronomenUmschalten();
  // Neuer Name: Titel und Texte der Seite sofort nachziehen.
  $('assistentName').addEventListener('change', async () => texteAnwenden(await julia.texte()));
  monitoreFuellen();
  ordnerZeigen();
  farbenZeigen();
  anbieterZeigen();
  anbieterVerbinden();

  $('ordnerHinzu').onclick = async () => {
    const p = await julia.ordnerWaehlen();
    if (!p || cfg.arbeitsverzeichnisse.includes(p)) return;
    const r = await setzen('arbeitsverzeichnisse', [...cfg.arbeitsverzeichnisse, p]);
    if (!r.fehler) { cfg.arbeitsverzeichnisse = r.wert; ordnerZeigen(); }
  };
  $('blasePosition').onclick = async (e) => {
    e.preventDefault();
    await setzen('blase.position', null);
  };
  $('standardfarben').onclick = async () => {
    const r = await setzen('blase.farben', STANDARDFARBEN);
    if (!r.fehler) { cfg.blase.farben = r.wert; farbenZeigen(); }
  };
  $('speichern').onclick = speichern;
  kontenVerbinden();
  kontenZeigen(await julia.kontenStatus());
  handyVerbinden();
  handyZeigen(await julia.handyStatus());
  syncVerbinden();
  syncZeigen(await julia.syncStatus());
  designVerbinden();
  designZeigen();
  kostenZeigen(await julia.kostenHeute());
  julia.on('kosten', kostenZeigen);

  julia.on('config:geaendert', (neu) => {
    const fokus = document.activeElement;
    cfg = { ...neu };
    if (!document.activeElement || !document.activeElement.closest('#akzente')) designZeigen();
    document.querySelectorAll('[data-k]').forEach((el) => {
      if (el === fokus) return;
      const w = holen(cfg, el.dataset.k);
      if (el.type === 'checkbox') el.checked = !!w;
      else if (w != null && el.value !== String(w)) { el.value = String(w); if (el.type === 'range') ausgabe(el); }
    });
  });
  julia.on('texte:geaendert', texteAnwenden);

  stimmenLaden();
  geraeteLaden();
  $('stimmeTesten').onclick = async () => {
    $('stimmeTesten').disabled = true;
    await julia.spracheTesten();
    $('stimmeTesten').disabled = false;
  };
  if (einrichtung) $('name').focus();
}

init();
