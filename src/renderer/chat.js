'use strict';

// Chatfenster: zeigt das Gespräch, Werkzeugschritte und Freigabekarten.
// Nachrichten laufen immer über den Hauptprozess, der sie zurückspiegelt.

const $ = (id) => document.getElementById(id);
// Dieselbe Seite dient als Gaming-Overlay (chat.html?overlay=1).
const imOverlay = new URLSearchParams(location.search).get('overlay') === '1';
if (imOverlay) document.body.classList.add('overlay');
let T = {};
let beschaeftigt = false;
let hoert = false;
let hotkey = '';
let antwortEl = null;
let antwortRoh = '';
const werkzeugEls = new Map();
const freigabeEls = new Map();

const ICON = {
  neu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
  einst: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/></svg>',
  mikro: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0"/><path d="M12 17v5"/></svg>',
  senden: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5"/><path d="m5 12 7-7 7 7"/></svg>',
  stopp: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2.5"/></svg>',
  zu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
};

function overlayModus(modus) {
  document.body.classList.toggle('passiv', modus === 'passiv');
  if (modus !== 'passiv') $('text').focus();
}

function tx(k, werte) {
  let s = T[k] ?? k;
  if (werte) for (const [a, b] of Object.entries(werte)) s = s.split(`{${a}}`).join(String(b));
  return s;
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// --- Kleines Markdown: Absätze, Listen, Code, fett/kursiv, Links ---

function formatieren(s) {
  return s
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*([^*\n]+)\*(?![*\w])/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
}

function inlineMd(s) {
  return s.split('`').map((teil, i) => (i % 2 ? `<code>${esc(teil)}</code>` : formatieren(esc(teil)))).join('');
}

function bloecke(text) {
  let out = '';
  let liste = null;
  let absatz = [];
  const absatzEnde = () => {
    if (absatz.length) out += `<p>${absatz.map(inlineMd).join('<br>')}</p>`;
    absatz = [];
  };
  const listeEnde = () => {
    if (liste) out += `<${liste.typ}>${liste.eintraege.map((e) => `<li>${inlineMd(e)}</li>`).join('')}</${liste.typ}>`;
    liste = null;
  };
  for (const z of text.split('\n')) {
    let m;
    if (!z.trim()) { absatzEnde(); listeEnde(); continue; }
    if ((m = /^\s*[-*•]\s+(.*)$/.exec(z)) || (m = /^\s*\d+[.)]\s+(.*)$/.exec(z))) {
      const typ = /^\s*\d/.test(z) ? 'ol' : 'ul';
      absatzEnde();
      if (!liste || liste.typ !== typ) { listeEnde(); liste = { typ, eintraege: [] }; }
      liste.eintraege.push(m[1]);
      continue;
    }
    if ((m = /^#{1,6}\s+(.*)$/.exec(z))) { absatzEnde(); listeEnde(); out += `<h4>${inlineMd(m[1])}</h4>`; continue; }
    if ((m = /^>\s?(.*)$/.exec(z))) { absatzEnde(); listeEnde(); out += `<blockquote>${inlineMd(m[1])}</blockquote>`; continue; }
    listeEnde();
    absatz.push(z);
  }
  absatzEnde();
  listeEnde();
  return out;
}

function md(text) {
  return text.split('```').map((teil, i) => {
    if (i % 2 === 0) return bloecke(teil);
    const nl = teil.indexOf('\n');
    const code = nl >= 0 && /^[\w+#.-]*$/.test(teil.slice(0, nl).trim()) ? teil.slice(nl + 1) : teil;
    return `<pre><code>${esc(code.replace(/\n$/, ''))}</code></pre>`;
  }).join('');
}

// --- Verlauf ---

const verlauf = $('verlauf');

function amEnde() {
  return verlauf.scrollHeight - verlauf.scrollTop - verlauf.clientHeight < 80;
}

function anhaengen(el) {
  const unten = amEnde();
  $('leer').hidden = true;
  verlauf.appendChild(el);
  if (unten) verlauf.scrollTop = verlauf.scrollHeight;
  return el;
}

function element(klasse, html) {
  const d = document.createElement('div');
  d.className = klasse;
  if (html != null) d.innerHTML = html;
  return d;
}

function nutzerNachricht(text, perSprache, vomHandy) {
  antwortEl = null;
  const meta = vomHandy ? `📱 ${esc(tx('chat.handy'))}` : perSprache ? `🎙 ${esc(tx('chat.sprache'))}` : '';
  anhaengen(element('nachricht nutzer',
    `<div class="blase">${esc(text).replace(/\n/g, '<br>')}</div>${meta ? `<div class="meta">${meta}</div>` : ''}`));
}

function juliaText(delta, ganz = false) {
  if (!antwortEl) {
    antwortEl = anhaengen(element('nachricht julia', '<div class="blase"></div>'));
    antwortRoh = '';
  }
  antwortRoh = ganz ? delta : antwortRoh + delta;
  const unten = amEnde();
  antwortEl.firstChild.innerHTML = md(antwortRoh);
  if (unten) verlauf.scrollTop = verlauf.scrollHeight;
}

function werkzeug({ id, name, eingabe }) {
  antwortEl = null;
  const d = element('werkzeug laeuft',
    `<span class="ico"></span><span class="wname">${esc(name)}</span><span class="weingabe">${esc(eingabe === '{}' ? '' : eingabe || '')}</span>`);
  werkzeugEls.set(id, d);
  anhaengen(d);
  return d;
}

function werkzeugFertig({ id, ok, rot }) {
  const d = werkzeugEls.get(id);
  if (!d) return;
  d.classList.remove('laeuft');
  d.classList.add(ok ? 'ok' : rot ? 'rot' : 'fehler');
}

function freigabe(f) {
  antwortEl = null;
  const auftrag = f.art === 'auftrag';
  const karte = element('karte');
  karte.innerHTML = `
    <div class="k-titel">⚠ ${esc(tx(auftrag ? 'chat.auftrag' : 'chat.freigabe'))}</div>
    <div class="k-text">${auftrag ? esc(f.beschreibung) : String(f.beschreibung).includes('\n') ? `<pre class="k-pre">${esc(f.beschreibung)}</pre>` : `<code>${esc(f.beschreibung)}</code>`}</div>
    ${f.grund ? `<div class="k-grund">${esc(f.grund)}</div>` : ''}
    ${auftrag && f.schritte && f.schritte.length ? `<ol>${f.schritte.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>` : ''}
    ${auftrag && f.kategorien && f.kategorien.length ? `<div class="k-grund">${esc(tx('chat.auftrag_kategorien'))}:</div><div class="chips">${f.kategorien.map((k) => `<span class="chip">${esc(k)}</span>`).join('')}</div>` : ''}
    <div class="k-knoepfe"><button class="ja">${esc(tx('chat.ja'))}</button><button class="nein">${esc(tx('chat.nein'))}</button></div>`;
  karte.querySelector('.ja').onclick = () => julia.freigabe(f.id, true);
  karte.querySelector('.nein').onclick = () => julia.freigabe(f.id, false);
  freigabeEls.set(f.id, karte);
  anhaengen(karte);
  karte.querySelector('.ja').focus();
}

function freigabeErledigt({ id, ja }) {
  const karte = freigabeEls.get(id);
  if (!karte) return;
  karte.classList.add('erledigt');
  const knoepfe = karte.querySelector('.k-knoepfe');
  knoepfe.outerHTML = `<div class="k-ergebnis ${ja ? 'ja-text' : 'nein-text'}">${ja ? '✓ ' + esc(tx('chat.freigegeben')) : '✕ ' + esc(tx('chat.abgelehnt'))}</div>`;
}

function systemzeile(text, art = '') {
  antwortEl = null;
  const d = element(`systemzeile ${art}`);
  d.textContent = text;
  anhaengen(d);
}

function leeren() {
  verlauf.querySelectorAll(':scope > :not(#leer)').forEach((e) => e.remove());
  $('leer').hidden = false;
  antwortEl = null;
  antwortRoh = '';
  werkzeugEls.clear();
  freigabeEls.clear();
}

// --- Kopf, Eingabe ---

function statusText(zustand) {
  if (hoert) return tx('chat.hoert');
  if (beschaeftigt || zustand === 'thinking') return tx('chat.denkt');
  return tx(`zustand.${zustand || 'idle'}`);
}

function zustandAnzeigen(z) {
  document.body.dataset.zustand = z;
  $('status').textContent = statusText(z);
}

function knopfSenden() {
  const b = $('btnSenden');
  b.classList.toggle('stopp', beschaeftigt);
  b.innerHTML = beschaeftigt ? ICON.stopp : ICON.senden;
  b.title = tx(beschaeftigt ? 'chat.stopp' : 'chat.senden');
}

function beschaeftigtSetzen(b) {
  beschaeftigt = b;
  knopfSenden();
  zustandAnzeigen(document.body.dataset.zustand || 'idle');
}

// "Control+Alt+Space" so, wie es auf der Tastatur steht.
function tastenAnzeige(kombi) {
  const de = document.documentElement.lang === 'de';
  const namen = de
    ? { Control: 'Strg', CommandOrControl: 'Strg', CmdOrCtrl: 'Strg', Space: 'Leertaste', Shift: 'Umschalt' }
    : { Control: 'Ctrl', CommandOrControl: 'Ctrl', CmdOrCtrl: 'Ctrl' };
  return String(kombi || '').split('+').map((t) => namen[t] || t).join('+');
}

function texteAnwenden(daten) {
  T = daten.texte;
  document.documentElement.lang = daten.sprachcode;
  const hk = tastenAnzeige(hotkey);
  $('assistentName').textContent = tx('chat.titel');
  document.title = tx('chat.titel');
  $('text').placeholder = tx('chat.platzhalter');
  $('btnNeu').title = tx('chat.neu');
  $('btnEinst').title = tx('chat.einstellungen');
  $('btnZu').title = tx('chat.schliessen');
  $('btnMikro').title = `${tx('chat.mikro')} (${hk})`;
  $('leerText').textContent = tx('chat.leer', { hotkey: hk });
  knopfSenden();
  zustandAnzeigen(document.body.dataset.zustand || 'idle');
}

function hoehe() {
  const t = $('text');
  t.style.height = 'auto';
  t.style.height = Math.min(160, t.scrollHeight) + 'px';
}

function absenden() {
  const t = $('text');
  const text = t.value.trim();
  if (!text) return;
  if (beschaeftigt) { systemzeile(tx('chat.beschaeftigt')); return; }
  t.value = '';
  hoehe();
  julia.senden(text);
}

function demo(eintraege) {
  leeren();
  for (const e of eintraege) {
    if (e.typ === 'nutzer') nutzerNachricht(e.text, false);
    else if (e.typ === 'julia') { antwortEl = null; juliaText(e.text, true); }
    else if (e.typ === 'werkzeug') { const id = 'demo' + Math.random(); werkzeug({ id, name: e.name, eingabe: e.eingabe }); werkzeugFertig({ id, ok: e.ok }); }
    else if (e.typ === 'freigabe') freigabe(e.f);
  }
  verlauf.scrollTop = verlauf.scrollHeight;
}

async function init() {
  $('btnNeu').innerHTML = ICON.neu;
  $('btnEinst').innerHTML = ICON.einst;
  $('btnMikro').innerHTML = ICON.mikro;
  if (imOverlay) {
    $('btnZu').hidden = false;
    $('btnZu').innerHTML = ICON.zu;
    $('btnZu').onclick = () => julia.schliessen();
  }

  const st = await julia.status();
  hotkey = st.hotkey;
  hoert = st.hoert;
  beschaeftigt = st.beschaeftigt;
  texteAnwenden(await julia.texte());
  zustandAnzeigen(st.zustand);
  $('btnMikro').classList.toggle('aktiv', hoert);

  $('btnNeu').onclick = () => julia.neu();
  $('btnEinst').onclick = () => julia.einstellungen();
  $('btnMikro').onclick = () => julia.sprechen();
  $('btnSenden').onclick = () => (beschaeftigt ? julia.abbrechen() : absenden());
  $('text').addEventListener('input', hoehe);
  $('text').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      absenden();
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (beschaeftigt) julia.abbrechen();
    else julia.schliessen();
  });

  julia.on('agent:nutzer', ({ text, perSprache, handy }) => nutzerNachricht(text, perSprache, handy));
  julia.on('agent:start', () => beschaeftigtSetzen(true));
  julia.on('agent:text', (d) => juliaText(d));
  julia.on('agent:werkzeug', werkzeug);
  julia.on('agent:werkzeugFertig', werkzeugFertig);
  julia.on('agent:freigabe', freigabe);
  julia.on('agent:freigabeErledigt', freigabeErledigt);
  julia.on('agent:fertig', () => { beschaeftigtSetzen(false); antwortEl = null; $('text').focus(); });
  julia.on('agent:fehler', (e) => systemzeile(e.art === 'kein_schluessel' ? tx('chat.kein_schluessel') : e.text, 'fehler'));
  julia.on('agent:hinweis', (h) => {
    const k = { abgebrochen: 'chat.abgebrochen', beschaeftigt: 'chat.beschaeftigt', verweigert: 'hinweis.verweigert', max_tokens: 'hinweis.max_tokens', zu_viele_runden: 'hinweis.zu_viele_runden' }[h.art];
    if (k) systemzeile(tx(k));
  });
  julia.on('zustand', zustandAnzeigen);
  julia.on('sprache:hoert', (b) => {
    hoert = b;
    $('btnMikro').classList.toggle('aktiv', b);
    zustandAnzeigen(document.body.dataset.zustand || 'idle');
  });
  julia.on('texte:geaendert', texteAnwenden);
  julia.on('config:geaendert', (c) => {
    if (c.hotkey && c.hotkey.sprechen !== hotkey) {
      hotkey = c.hotkey.sprechen;
      texteAnwenden({ sprachcode: document.documentElement.lang, texte: T });
    }
  });
  julia.on('chat:geleert', leeren);
  julia.on('erinnerung', ({ text }) => systemzeile(`⏰ ${text}`, 'erinnerung'));

  $('text').focus();
}

// Ereignisse, die schon während des Starts eintreffen (Vorführmodus), warten,
// bis Texte und Status geladen sind.
const bereit = init();
julia.on('demo', (eintraege) => bereit.then(() => demo(eintraege)));
julia.on('overlay:modus', (modus) => bereit.then(() => overlayModus(modus)));
