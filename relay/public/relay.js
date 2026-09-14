'use strict';

// Relay-Seite: Anmeldung per Passkey, PC koppeln, Passkeys verwalten.
(() => {
  const $ = (id) => document.getElementById(id);
  const bytes = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
  const text = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const FEHLER = {
    code: 'Der Code stimmt nicht oder ist abgelaufen. Lass dir in Julia einen neuen anzeigen.',
    gesperrt: 'Zu viele Fehlversuche – bitte eine Viertelstunde warten.',
    einrichten: 'Der Einrichtungslink ist abgelaufen oder schon benutzt. Hol dir in der Proxmox-Konsole mit julia-relay-link einen neuen.',
    letzter: 'Der letzte Passkey bleibt – sonst käme niemand mehr rein.',
    doppelt: 'Diesen Passkey gibt es hier schon.',
    zu_viele: 'Es sind schon zehn Passkeys angelegt.',
  };

  let einrichtungsToken = null;

  function melden(t, fehler = false) {
    const m = $('meldung');
    m.textContent = t || '';
    m.classList.toggle('fehler', !!fehler);
  }

  async function api(pfad, daten) {
    try {
      const r = await fetch(pfad, daten === undefined
        ? { cache: 'no-store', credentials: 'same-origin' }
        : { method: 'POST', cache: 'no-store', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(daten) });
      let d = {};
      try { d = await r.json(); } catch { /* leer */ }
      return { code: r.status, d };
    } catch {
      return { code: 0, d: {} };
    }
  }

  const fehlerText = (r) => FEHLER[r.d.fehler] || r.d.text || (r.code === 0 ? 'Keine Verbindung zum Relay.' : `Das hat nicht geklappt (${r.code}).`);

  function zeigen(id) {
    for (const t of ['laden', 'anmelden', 'einrichten', 'keinZugang', 'bereich']) $(t).hidden = t !== id;
  }

  function datum(iso) {
    return iso ? new Date(iso).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' }) : '–';
  }

  function bereichMalen(s) {
    const z = $('pcZeile');
    z.className = 'pc';
    if (!s.pc) {
      z.textContent = 'Noch kein PC gekoppelt.';
      $('koppelnBox').open = true;
    } else if (s.pc.verbunden) {
      z.classList.add('an');
      z.textContent = `${s.pc.name} ist verbunden.`;
    } else {
      z.classList.add('aus');
      z.textContent = `${s.pc.name} ist gerade nicht verbunden – läuft der PC, und ist in Julia das Proxmox-Relay an?`;
    }
    $('zuJulia').hidden = !(s.pc && s.pc.verbunden);
    $('pcTrennen').hidden = !s.pc;
    const liste = $('passkeys');
    liste.replaceChildren();
    for (const p of s.passkeys) {
      const li = document.createElement('li');
      const name = document.createElement('span');
      name.textContent = `${p.name}${p.dieser ? ' (dieses Gerät)' : ''}`;
      const wann = document.createElement('small');
      wann.textContent = `angelegt ${datum(p.seit)} · zuletzt ${datum(p.zuletzt)}`;
      li.append(name, wann);
      if (s.passkeys.length > 1) {
        const weg = document.createElement('button');
        weg.type = 'button';
        weg.className = 'leise';
        weg.textContent = 'Entfernen';
        weg.onclick = async () => {
          if (!confirm(`Passkey „${p.name}“ entfernen?`)) return;
          const r = await api('/_relay/api/passkey/loeschen', { id: p.id });
          if (r.code !== 200) melden(fehlerText(r), true);
          laden();
        };
        li.append(weg);
      }
      liste.append(li);
    }
  }

  async function laden() {
    const r = await api('/_relay/api/status');
    if (r.code !== 200) { zeigen('laden'); melden(fehlerText(r), true); return; }
    const s = r.d;
    if (s.angemeldet) { zeigen('bereich'); bereichMalen(s); return; }
    if (einrichtungsToken) { zeigen('einrichten'); return; }
    zeigen(s.eingerichtet ? 'anmelden' : 'keinZugang');
  }

  async function passkeyAnlegen() {
    if (!window.PublicKeyCredential) { melden('Dieser Browser kann keine Passkeys.', true); return; }
    melden('');
    const beginn = await api('/_relay/api/passkey/beginn', einrichtungsToken ? { token: einrichtungsToken } : {});
    if (beginn.code !== 200) { melden(fehlerText(beginn), true); return; }
    const o = beginn.d;
    let cred;
    try {
      cred = await navigator.credentials.create({
        publicKey: {
          ...o,
          challenge: bytes(o.challenge),
          user: { ...o.user, id: bytes(o.user.id) },
          excludeCredentials: o.excludeCredentials.map((c) => ({ ...c, id: bytes(c.id) })),
        },
      });
    } catch (e) {
      melden(e && e.name === 'InvalidStateError' ? FEHLER.doppelt : 'Abgebrochen.', true);
      return;
    }
    const antwort = { id: text(cred.rawId), clientDataJSON: text(cred.response.clientDataJSON), attestationObject: text(cred.response.attestationObject) };
    const r = await api('/_relay/api/passkey/fertig', { token: einrichtungsToken, antwort, name: $('passkeyName').value });
    if (r.code !== 200) { melden(fehlerText(r), true); return; }
    einrichtungsToken = null;
    melden('Passkey angelegt.');
    laden();
  }

  async function anmelden() {
    if (!window.PublicKeyCredential) { melden('Dieser Browser kann keine Passkeys.', true); return; }
    melden('');
    const beginn = await api('/_relay/api/anmelden/beginn', {});
    if (beginn.code !== 200) { melden(fehlerText(beginn), true); return; }
    let cred;
    try {
      cred = await navigator.credentials.get({ publicKey: { challenge: bytes(beginn.d.challenge), rpId: beginn.d.rpId, userVerification: 'required', timeout: beginn.d.timeout } });
    } catch {
      melden('Abgebrochen.', true);
      return;
    }
    const antwort = {
      id: text(cred.rawId),
      clientDataJSON: text(cred.response.clientDataJSON),
      authenticatorData: text(cred.response.authenticatorData),
      signature: text(cred.response.signature),
    };
    const r = await api('/_relay/api/anmelden/fertig', { antwort });
    if (r.code !== 200) { melden(fehlerText(r), true); return; }
    laden();
  }

  // Den Einrichtungslink sofort aus Adresse und Verlauf entfernen.
  const m = /^#einrichten=([A-Za-z0-9_-]{43})$/.exec(location.hash);
  if (m) {
    einrichtungsToken = m[1];
    history.replaceState(null, '', '/_relay/');
  }

  $('anmeldenKnopf').onclick = anmelden;
  $('einrichtenKnopf').onclick = passkeyAnlegen;
  $('passkeyNeu').onclick = passkeyAnlegen;
  $('abmelden').onclick = async () => { await api('/_relay/api/abmelden', {}); melden(''); laden(); };
  $('pcTrennen').onclick = async () => {
    if (!confirm('Den PC trennen? Julia ist dann von unterwegs nicht mehr erreichbar, bis du neu koppelst.')) return;
    await api('/_relay/api/pc/trennen', {});
    laden();
  };
  $('koppelnForm').onsubmit = async (e) => {
    e.preventDefault();
    const r = await api('/_relay/api/pc/koppeln', { code: $('code').value });
    if (r.code !== 200) { melden(fehlerText(r), true); return; }
    $('code').value = '';
    melden(`Gekoppelt mit ${r.d.name}.`);
    laden();
  };
  document.addEventListener('visibilitychange', () => { if (!document.hidden) laden(); });
  laden();
})();
