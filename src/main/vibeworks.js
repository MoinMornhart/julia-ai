'use strict';

// VibeWorks-MCP-Anbindung (Issue #51/#13/#18/#21). VibeWorks ist ein MCP-Server
// über „Streamable HTTP". Die eigentliche Verbindung übernimmt das allgemeine
// MCP-Modul (src/main/mcp.js, art:'http'); hier liegt nur der VibeWorks-eigene
// Teil: die Login-Box mit Schlüssel-Prüfung und die genauen „nicht angemeldet"-
// Codes. Angemeldet wird mit einem API-Schlüssel (Bearer), NICHT per OAuth/Passkey.
// Der Schlüssel liegt verschlüsselt im Tresor (als Authorization-Kopfzeile), nie
// in der config.json und nie für die KI lesbar.

const BASIS = 'https://vibeworks.morncloud.de';
const MCP_URL = `${BASIS}/api/mcp`;
const REGELN_URL = `${BASIS}/api/mcp/rules`;
const KONTO_URL = `${BASIS}/account#mcp`;
const ID = 'vibeworks';

function schluesselNormal(k) {
  return String(k == null ? '' : k).trim();
}

// Schlüssel beginnen immer mit „vw_". Grobe Formprüfung, bevor überhaupt gefragt wird.
function schluesselGueltig(k) {
  return /^vw_[A-Za-z0-9._-]{8,256}$/.test(schluesselNormal(k));
}

// Aus HTTP-Status, Antwort-Body und WWW-Authenticate den genauen Code lesen.
// Der Server antwortet 401 mit { code: "missing" | "malformed" |
// "invalid_or_revoked" | "account_inactive" } und einem WWW-Authenticate-Kopf
// mit error_description="<code>".
function fehlerCode(status, body, wwwAuth) {
  if (status === 200) return { ok: true };
  let code = '';
  try {
    const j = typeof body === 'string' ? JSON.parse(body) : body;
    if (j && j.code) code = String(j.code);
  } catch { /* kein JSON */ }
  if (!code && wwwAuth) {
    const m = /error_description="([^"]+)"/.exec(String(wwwAuth));
    if (m) code = m[1];
  }
  if (status === 401) return { ok: false, status, code: code || 'missing' };
  if (status === 403) return { ok: false, status, code: 'origin' };
  if (status === 429) return { ok: false, status, code: 'zu_viele' };
  return { ok: false, status, code: code || 'fehler' };
}

// Welchen Hinweistext zeigt die Login-Box zu welchem Code?
function hinweisSchluessel(code) {
  switch (code) {
    case 'invalid_or_revoked': return 'vibe.hinweis_ungueltig';
    case 'account_inactive': return 'vibe.hinweis_konto_inaktiv';
    case 'missing':
    case 'malformed': return 'vibe.hinweis_nicht_angemeldet';
    case 'zu_viele': return 'vibe.hinweis_zu_viele';
    case 'netz': return 'vibe.hinweis_netz';
    default: return 'vibe.hinweis_fehler';
  }
}

// Schlüssel prüfen, OHNE MCP: GET /api/mcp/rules mit Bearer. 200 = gültig,
// 401 = fehlt/ungültig/gesperrt. Bewusst KEIN Origin-Kopf (der Server lehnt
// fremde Origins mit 403 ab; ohne Origin ist alles gut).
//
// Schutzfunktion (Issue #13): mit einem Abbruch-Zeitlimit, damit ein hängender/
// nicht antwortender Server die Anmeldung NICHT einfrieren lässt („nichts lädt").
// Läuft die Zeit ab, wird die Anfrage abgebrochen und als klarer „Netz"-Hinweis
// gemeldet, statt ewig zu warten.
async function pruefen(key, { holen = (u, o) => globalThis.fetch(u, o), zeitlimit = 12000 } = {}) {
  const k = schluesselNormal(key);
  if (!schluesselGueltig(k)) return { ok: false, code: 'malformed' };

  const abbruch = typeof AbortController !== 'undefined' ? new AbortController() : null;
  let timer = null;
  const zeitAus = new Promise((_, ab) => {
    timer = setTimeout(() => {
      if (abbruch) { try { abbruch.abort(); } catch { /* egal */ } }
      ab(new Error('zeitlimit'));
    }, zeitlimit);
    if (timer && timer.unref) timer.unref(); // hält den Prozess nicht wach
  });

  let r;
  try {
    r = await Promise.race([
      holen(REGELN_URL, {
        method: 'GET',
        headers: { Authorization: `Bearer ${k}`, Accept: 'text/markdown, text/plain, */*' },
        redirect: 'error',
        signal: abbruch ? abbruch.signal : undefined,
      }),
      zeitAus,
    ]);
  } catch (e) {
    return { ok: false, code: 'netz', fehler: e && e.message };
  } finally {
    if (timer) clearTimeout(timer);
  }
  let body = '';
  try { body = await r.text(); } catch { /* egal */ }
  const wwwAuth = r.headers && r.headers.get ? r.headers.get('www-authenticate') : '';
  return fehlerCode(r.status, body, wwwAuth);
}

// Der MCP-Server-Eintrag (für config.mcp.server). Fester Id, damit sich VibeWorks
// eindeutig anlegen/aktualisieren/entfernen lässt. vertraut:false → jeder Aufruf
// läuft über die Ampel (GELB) und fragt vorher. `url` kann überschrieben werden
// (die Geräte-Anmeldung liefert die genaue mcp_url der Instanz zurück).
function serverEintrag(url = MCP_URL) {
  return { id: ID, name: 'VibeWorks', art: 'http', url, an: true, vertraut: false };
}

// ─── Geräte-Anmeldung (RFC 8628, VibeWorks ≥ 1.1.9, Issue #17/#13) ──────
// Julia holt sich selbst einen Code, der Kontoinhaber erlaubt einmal – kein
// Schlüssel-Kopieren, kein OAuth-Redirect. Der abgeholte Schlüssel wandert sofort
// in den Tresor, wird der KI nie gezeigt.

// Gemeinsamer POST-JSON-Helfer mit Abbruch-Zeitlimit (wie bei `pruefen`).
async function postJson(url, daten, { holen = (u, o) => globalThis.fetch(u, o), zeitlimit = 12000 } = {}) {
  const abbruch = typeof AbortController !== 'undefined' ? new AbortController() : null;
  let timer = null;
  const zeitAus = new Promise((_, ab) => {
    timer = setTimeout(() => {
      if (abbruch) { try { abbruch.abort(); } catch { /* egal */ } }
      ab(new Error('zeitlimit'));
    }, zeitlimit);
    if (timer && timer.unref) timer.unref();
  });
  let r;
  try {
    r = await Promise.race([
      holen(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(daten),
        redirect: 'error',
        signal: abbruch ? abbruch.signal : undefined,
      }),
      zeitAus,
    ]);
  } catch (e) {
    return { ok: false, fehler: e && e.message };
  } finally {
    if (timer) clearTimeout(timer);
  }
  let body = {};
  try { const t = await r.text(); body = t ? JSON.parse(t) : {}; } catch { /* kein JSON */ }
  return { ok: true, status: r.status, body };
}

function geraetStartUrl(basis = BASIS) { return `${basis}/api/mcp/device`; }
function geraetTokenUrl(basis = BASIS) { return `${basis}/api/mcp/device/token`; }

// Anmeldung starten: liefert user_code + Verifizierungs-URL zurück.
async function geraetStart({ basis = BASIS, scope = 'tasks', holen, zeitlimit = 12000 } = {}) {
  const r = await postJson(geraetStartUrl(basis), { client_name: 'Julia', scope }, { holen, zeitlimit });
  if (!r.ok) return { ok: false, code: 'netz', fehler: r.fehler };
  if (r.status !== 200) return { ok: false, code: (r.body && r.body.error) || 'fehler', status: r.status };
  const b = r.body || {};
  if (!b.device_code || !b.user_code) return { ok: false, code: 'unerwartet' };
  return {
    ok: true,
    device_code: b.device_code,
    user_code: b.user_code,
    verification_uri: b.verification_uri,
    verification_uri_complete: b.verification_uri_complete,
    interval: Number(b.interval) || 5,
    expires_in: Number(b.expires_in) || 600,
    mcp_url: b.mcp_url,
  };
}

// Einmal den Token-Endpunkt abfragen; Status gemäß RFC 8628.
async function geraetToken({ basis = BASIS, device_code, holen, zeitlimit = 12000 } = {}) {
  const r = await postJson(geraetTokenUrl(basis), { device_code }, { holen, zeitlimit });
  if (!r.ok) return { status: 'fehler', code: 'netz', fehler: r.fehler };
  if (r.status === 200) {
    const b = r.body || {};
    return { status: 'fertig', access_token: b.access_token, scope: b.scope, mcp_url: b.mcp_url };
  }
  const fehler = r.body && r.body.error;
  switch (fehler) {
    case 'authorization_pending': return { status: 'warten' };
    case 'slow_down': return { status: 'langsamer' };
    case 'access_denied': return { status: 'abgelehnt' };
    case 'expired_token': return { status: 'abgelaufen' };
    default: return { status: 'fehler', code: fehler || 'fehler' };
  }
}

// Den Token-Endpunkt in Abständen abfragen, bis fertig/abgelehnt/abgelaufen.
// `warten`/`holen` sind injizierbar (für Tests). `slow_down` erhöht das Intervall.
async function geraetSchleife({
  basis = BASIS, device_code, interval = 5, maxSekunden = 600,
  holen, warten = (ms) => new Promise((r) => setTimeout(r, ms)),
} = {}) {
  let wartezeit = Math.max(1, interval);
  let vergangen = 0;
  while (vergangen < maxSekunden) {
    await warten(wartezeit * 1000);
    vergangen += wartezeit;
    const t = await geraetToken({ basis, device_code, holen });
    if (t.status === 'warten') continue;
    if (t.status === 'langsamer') { wartezeit += 5; continue; }
    return t;
  }
  return { status: 'abgelaufen' };
}

// Die Kopfzeile fürs verschlüsselte Ablegen im Tresor (mcp.umgebungSetzen).
function kopfzeile(key) {
  return `Authorization=Bearer ${schluesselNormal(key)}`;
}

module.exports = {
  ID, BASIS, MCP_URL, REGELN_URL, KONTO_URL,
  schluesselNormal, schluesselGueltig, fehlerCode, hinweisSchluessel, pruefen, serverEintrag, kopfzeile,
  geraetStartUrl, geraetTokenUrl, geraetStart, geraetToken, geraetSchleife,
};
