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

  const voiceText = (v) => tx(`mc.vc_${(v && v.zustand) || 'aus'}`, { version: (v && v.version) || '' });

  function werteZeigen(s) {
    const box = $('mcWerte');
    box.hidden = !s.verbunden;
    if (!s.verbunden) { box.innerHTML = ''; return; }
    const a = s.aufgabe;
    const aufgabe = a ? tx(`mc.l_${a.art}`, { spieler: a.spieler || '', n: a.geschafft || 0, ort: a.ort || '' }) : tx('mc.l_frei');
    const spieler = (s.spieler || []).map((p) => (p.abstand != null ? `${p.name} (${p.abstand} m)` : p.name)).join(', ');
    const feinde = Object.entries(s.feinde_nah || {}).map(([n, z]) => `${z}× ${n}`).join(', ');
    box.innerHTML = [
      ['mc.w_figur', `${s.name} · ${s.version}`],
      ['mc.w_leben', `❤ ${s.leben}/20 · 🍗 ${s.hunger}/20`],
      ['mc.w_ort', `${s.position.x} / ${s.position.y} / ${s.position.z}`],
      ['mc.w_aufgabe', aufgabe],
      ['mc.w_spieler', spieler || '–'],
      ['mc.w_feinde', feinde || '–'],
      ['mc.w_voice', voiceText(s.stimme)],
    ].map(([k, v]) => `<div><span>${esc(tx(k))}</span><b>${esc(v)}</b></div>`).join('');
  }

  // Crash-Screen: Warum ist die Figur vom Server geflogen – und kommt sie zurück?
  const aufgabeName = (art) => {
    const k = `mc.a_${art}`;
    const t = tx(k);
    return t !== k ? t : tx(`mc.${art}`);
  };

  function dauerText(s) {
    if (s < 60) return tx('mc.dauer_s', { n: s });
    const m = Math.round(s / 60);
    return m < 60 ? tx('mc.dauer_min', { n: m }) : tx('mc.dauer_std', { h: Math.floor(m / 60), m: m % 60 });
  }

  function crashZeigen(t) {
    $('mcCrash').hidden = !t;
    if (!t) return;
    $('mcCrashArt').textContent = tx(t.rauswurf ? 'mc.crash_rauswurf' : 'mc.crash_verbindung');
    $('mcCrashGrund').textContent = t.grund;
    const uhr = new Date(t.zeit).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const infos = [
      [tx('mc.crash_wann'), tx('mc.crash_wann_wert', { zeit: uhr, dauer: dauerText(t.dauerS || 0) })],
      [tx('mc.crash_server'), t.server || '–'],
    ];
    if (t.aufgabe) infos.push([tx('mc.crash_aufgabe'), aufgabeName(t.aufgabe)]);
    if (t.fehler && t.fehler !== t.grund) infos.push([tx('mc.crash_fehler'), t.fehler]);
    $('mcCrashInfos').innerHTML = infos.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('');
    let v = '';
    if (t.naechsterVersuch) v = tx('mc.crash_versuch', { s: Math.max(0, Math.ceil((t.naechsterVersuch - Date.now()) / 1000)), n: t.versuch, max: 3 });
    else if (t.aufgegeben) v = tx('mc.crash_aufgegeben');
    else if (t.rauswurf) v = tx('mc.crash_kein_versuch');
    $('mcCrashVersuch').textContent = v;
  }

  function zeigen(s) {
    stand = s;
    const an = !!s.verbunden;
    crashZeigen(!an && s.trennung);
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
  $('mcGeben').onsubmit = (e) => {
    e.preventDefault();
    const item = $('mcGebenItem').value.trim();
    if (!item) { $('mcGebenItem').focus(); return; }
    aufgabe({ aufgabe: 'geben', item, anzahl: $('mcGebenAnzahl').value });
  };
  $('mcHerstellen').onsubmit = (e) => {
    e.preventDefault();
    const item = $('mcHerstellenItem').value.trim();
    if (!item) { $('mcHerstellenItem').focus(); return; }
    aufgabe({ aufgabe: 'herstellen', item, anzahl: $('mcHerstellenAnzahl').value });
  };
  $('mcGehen').onsubmit = (e) => {
    e.preventDefault();
    if ($('mcX').value === '' || $('mcZ').value === '') { ($('mcX').value === '' ? $('mcX') : $('mcZ')).focus(); return; }
    aufgabe({ aufgabe: 'gehen', x: $('mcX').value, y: $('mcY').value, z: $('mcZ').value });
  };
  $('mcNeu').onclick = () => $('mcBeitreten').onclick();
  $('mcCrashWeg').onclick = async () => { await julia.mcTrennungWeg(); laden(); };
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

  // "Hey Julia" beim Spielen – derselbe Schalter wie in den Einstellungen.
  function schalterSetzen(c) {
    if (!c) return;
    if (c.weckwort) $('mcStimme').checked = !!c.weckwort.an;
    if (c.minecraft) $('mcVoice').checked = c.minecraft.stimme !== false;
  }
  async function stimmeZeigen() {
    try { schalterSetzen(await julia.config()); } catch { /* Fenster wird geschlossen */ }
  }
  $('mcStimme').onchange = async () => {
    const r = await julia.setzen('weckwort.an', $('mcStimme').checked);
    if (r && r.fehler) { fehler(r.fehler); stimmeZeigen(); }
  };
  // Simple Voice Chat: gilt ab dem nächsten Beitreten.
  $('mcVoice').onchange = async () => {
    const r = await julia.setzen('minecraft.stimme', $('mcVoice').checked);
    if (r && r.fehler) { fehler(r.fehler); stimmeZeigen(); }
  };
  julia.on('config:geaendert', schalterSetzen);

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
    $('mcGebenItem').placeholder = tx('mc.item_platz');
    $('mcHerstellenItem').placeholder = tx('mc.herstellen_platz');
    $('mcChatText').placeholder = tx('mc.chat_platz');
    if (stand) zeigen(stand);
  }

  window.juliaAnsichtBeimOeffnen.minecraft = () => { texte(); laden(); stimmeZeigen(); beobachten(); };
  julia.on('texte:geaendert', () => setTimeout(texte, 0));
  bereit.then(() => { if (window.juliaIcons) window.juliaIcons(document.getElementById('ansichtMinecraft')); texte(); });
})();
