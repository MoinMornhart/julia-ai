// Verbindung zur PC-Julia (App-Server) im Heimnetz/VPN. Klartext-HTTP, per Code
// gekoppelt; danach Token. Die Adresse ist z. B. 192.168.1.20:8770 oder eine
// VPN-Adresse (100.x.x.x:8770).

function basis(adresse) {
  const a = String(adresse || '').trim().replace(/^https?:\/\//, '').replace(/\/+$/, '');
  if (!a) throw new Error('Keine PC-Adresse angegeben.');
  return `http://${a}`;
}

async function bitte(url, koerper, token) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(koerper),
  });
  let j = null;
  try { j = await r.json(); } catch { /* kein JSON */ }
  return { code: r.status, j };
}

// Mit dem PC koppeln: Code eingeben → Token zurück.
export async function koppeln(adresse, code) {
  const r = await bitte(`${basis(adresse)}/api/koppeln`, { code });
  if (r.code === 200 && r.j && r.j.token) return r.j.token;
  if (r.code === 401) throw new Error('Code stimmt nicht oder ist abgelaufen. Zeig am PC einen neuen an.');
  if (r.code === 429) throw new Error('Zu viele Versuche – kurz warten.');
  throw new Error(`PC nicht erreichbar (${r.code}). Läuft der Zugriff am PC, und stimmt die Adresse?`);
}

// Eine Nachricht an die PC-Julia; Antwort als Text.
export async function frage(adresse, token, text) {
  const r = await bitte(`${basis(adresse)}/api/chat`, { text }, token);
  if (r.code === 200 && r.j) return r.j.antwort || '';
  if (r.code === 401) throw new Error('Nicht mehr am PC angemeldet – neu koppeln.');
  if (r.code === 503 && r.j && r.j.fehler === 'beschaeftigt') throw new Error('Julia arbeitet gerade am PC. Kurz warten.');
  throw new Error(`PC nicht erreichbar (${r.code}).`);
}
