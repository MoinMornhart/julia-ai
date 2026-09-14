'use strict';

// Minecraft: Server beitreten, Konto verbinden, Aufgaben geben, Chat.
// Die Spielfigur selbst läuft im Hauptprozess (src/main/minecraft.js).

(() => {
  if (imOverlay) return;

  let stand = null;
  let timer = null;
  let gefuellt = false; // Felder nur einmal aus der Konfiguration füllen

  function fehler(text) {
    $('mcFehler').textContent = text || '';
    $('mcFehler').hidden = !text;
  }

  function werteZeigen(s) {
    const box = $('mcWerte');
    box.hidden = !s.verbunden;
    if (!s.verbunden) { box.innerHTML = ''; return; }
    const a = s.aufgabe;
    const aufgabe = a ? tx(`mc.l_${a.art}`, { spieler: a.spieler || '', n: a.geschafft || 0 }) : tx('mc.l_frei');
    const spieler = (s.spieler || []).map((p) => (p.abstand != null ? `${p.name} (${p.abstand} m)` : p.name)).join(', ');
    const feinde = Object.entries(s.feinde_nah || {}).map(([n, z]) => `${z}× ${n}`).join(', ');
    box.innerHTML = [
      ['mc.w_figur', `${s.name} · ${s.version}`],
      ['mc.w_leben', `❤ ${s.leben}/20 · 🍗 ${s.hunger}/20`],
      ['mc.w_ort', `${s.position.x} / ${s.position.y} / ${s.position.z}`],
      ['mc.w_aufgabe', aufgabe],
      ['mc.w_spieler', spieler || '–'],
      ['mc.w_feinde', feinde || '–'],
    ].map(([k, v]) => `<div><span>${esc(tx(k))}</span><b>${esc(v)}</b></div>`).join('');
  }

  function zeigen(s) {
    stand = s;
    const an = !!s.verbunden;
    $('mcZustand').textContent = an ? tx('mc.verbunden', { server: s.server }) : tx('mc.getrennt');
    $('mcZustand').classList.toggle('an', an);
    $('mcBeitreten').hidden = an;
    $('mcVerlassen').hidden = !an;
    $('mcAdresse').disabled = an;
    $('mcSpieler').disabled = an;
    if (!gefuellt) {
      gefuellt = true;
      $('mcAdresse').value = s.adresse ? (s.port && s.port !== 25565 ? `${s.adresse}:${s.port}` : s.adresse) : '';
      $('mcSpieler').value = s.meinName || '';
    }
    $('mcKontoText').textContent = s.konto ? tx('mc.konto_an', { konto: s.konto }) : tx('mc.konto_aus');
    $('mcKontoVerbinden').hidden = !!s.konto;
    $('mcKontoAbmelden').hidden = !s.konto;
    document.querySelectorAll('#mcAufgaben button, #mcSenden button').forEach((b) => { b.disabled = !an; });
    werteZeigen(s);
    const z = $('mcZeilen');
    const zeilen = s.chat || [];
    z.innerHTML = zeilen.length
      ? zeilen.map((l) => `<p>${esc(l)}</p>`).join('')
      : `<p class="rt-leer">${esc(tx(an ? 'mc.chat_leer' : 'mc.chat_aus'))}</p>`;
    z.scrollTop = z.scrollHeight;
  }

  async function laden() {
    try { zeigen(await julia.mcStatus()); } catch { /* Fenster wird geschlossen */ }
  }

  // Leben, Aufgabe und Chat aktuell halten, solange der Reiter offen ist.
  function beobachten() {
    clearInterval(timer);
    timer = setInterval(() => {
      if (document.body.dataset.ansicht === 'minecraft') laden();
      else clearInterval(timer);
    }, 1500);
  }

  async function aufgabe(daten) {
    fehler('');
    const r = await julia.mcAufgabe(daten);
    if (r.fehler) fehler(r.fehler);
    laden();
  }

  $('mcBeitreten').onclick = async () => {
    const b = $('mcBeitreten');
    fehler('');
    b.disabled = true;
    const r = await julia.mcBeitreten({ adresse: $('mcAdresse').value, spieler: $('mcSpieler').value });
    b.disabled = false;
    if (r.fehler) fehler(r.fehler);
    laden();
  };
  $('mcVerlassen').onclick = async () => { await julia.mcVerlassen(); laden(); };
  document.querySelectorAll('.mc-aufgabe').forEach((b) => { b.onclick = () => aufgabe({ aufgabe: b.dataset.aufgabe }); });
  $('mcAbbauen').onsubmit = (e) => {
    e.preventDefault();
    const block = $('mcBlock').value.trim();
    if (!block) { $('mcBlock').focus(); return; }
    aufgabe({ aufgabe: 'abbauen', block, anzahl: $('mcAnzahl').value });
  };
  $('mcSenden').onsubmit = async (e) => {
    e.preventDefault();
    const text = $('mcChatText').value.trim();
    if (!text) return;
    const r = await julia.mcChat(text);
    if (r.fehler) fehler(r.fehler);
    else $('mcChatText').value = '';
    setTimeout(laden, 300);
  };
  $('mcKontoVerbinden').onclick = async () => {
    const b = $('mcKontoVerbinden');
    b.disabled = true;
    fehler('');
    const r = await julia.mcKontoVerbinden();
    b.disabled = false;
    $('mcCode').hidden = true;
    if (r.fehler) fehler(r.fehler);
    laden();
  };
  $('mcKontoAbmelden').onclick = async () => { await julia.mcKontoAbmelden(); laden(); };
  $('mcCodeKopieren').onclick = () => julia.kopieren($('mcCodeWert').textContent);

  julia.on('mc:code', (c) => {
    $('mcCodeWert').textContent = c && c.code ? c.code : '';
    $('mcCode').hidden = !(c && c.code);
  });
  julia.on('mc:geaendert', () => { if (document.body.dataset.ansicht === 'minecraft') laden(); });

  function texte() {
    document.querySelectorAll('#ansichtMinecraft [data-nav]').forEach((el) => { el.textContent = tx(el.dataset.nav); });
    $('mcAdresse').placeholder = tx('mc.adresse_platz');
    $('mcSpieler').placeholder = tx('mc.spieler_platz');
    $('mcBlock').placeholder = tx('mc.block_platz');
    $('mcChatText').placeholder = tx('mc.chat_platz');
    if (stand) zeigen(stand);
  }

  window.juliaAnsichtBeimOeffnen.minecraft = () => { texte(); laden(); beobachten(); };
  julia.on('texte:geaendert', () => setTimeout(texte, 0));
  bereit.then(() => { if (window.juliaIcons) window.juliaIcons(document.getElementById('ansichtMinecraft')); texte(); });
})();
