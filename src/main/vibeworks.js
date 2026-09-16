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
async function pruefen(key, { holen = (u, o) => globalThis.fetch(u, o) } = {}) {
  const k = schluesselNormal(key);
  if (!schluesselGueltig(k)) return { ok: false, code: 'malformed' };
  let r;
  try {
    r = await holen(REGELN_URL, {
      method: 'GET',
      headers: { Authorization: `Bearer ${k}`, Accept: 'text/markdown, text/plain, */*' },
      redirect: 'error',
    });
  } catch (e) {
    return { ok: false, code: 'netz', fehler: e && e.message };
  }
  let body = '';
  try { body = await r.text(); } catch { /* egal */ }
  const wwwAuth = r.headers && r.headers.get ? r.headers.get('www-authenticate') : '';
  return fehlerCode(r.status, body, wwwAuth);
}

// Der MCP-Server-Eintrag (für config.mcp.server). Fester Id, damit sich VibeWorks
// eindeutig anlegen/aktualisieren/entfernen lässt. vertraut:false → jeder Aufruf
// läuft über die Ampel (GELB) und fragt vorher.
function serverEintrag() {
  return { id: ID, name: 'VibeWorks', art: 'http', url: MCP_URL, an: true, vertraut: false };
}

// Die Kopfzeile fürs verschlüsselte Ablegen im Tresor (mcp.umgebungSetzen).
function kopfzeile(key) {
  return `Authorization=Bearer ${schluesselNormal(key)}`;
}

module.exports = {
  ID, BASIS, MCP_URL, REGELN_URL, KONTO_URL,
  schluesselNormal, schluesselGueltig, fehlerCode, hinweisSchluessel, pruefen, serverEintrag, kopfzeile,
};
