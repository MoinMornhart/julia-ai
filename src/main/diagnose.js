'use strict';

const os = require('os');

// Diagnose- und Crash-Berichte für Julia – aber sicher: Bevor irgendetwas den PC
// verlässt, wird es bereinigt. Es werden NIEMALS IP-Adressen, Tokens, Passwörter,
// E-Mail-Adressen oder der Windows-Benutzername mitgeschickt. Das Senden ist
// grundsätzlich opt-in (Einstellung diagnose.senden), Standard aus.

// Ersetzt alles, was persönlich oder geheim sein könnte, durch Platzhalter.
function bereinigen(text, { nutzer = '' } = {}) {
  let s = String(text == null ? '' : text);
  // Windows-/Unix-Benutzerpfade: den Namen entfernen, Struktur behalten.
  s = s.replace(/([A-Za-z]:\\Users\\)[^\\/\r\n"']+/g, '$1[nutzer]');
  s = s.replace(/(\/(?:home|Users)\/)[^/\r\n"']+/g, '$1[nutzer]');
  s = s.replace(/(%USERPROFILE%|%APPDATA%|%LOCALAPPDATA%)/gi, '$1'); // Umgebungsplatzhalter sind ok
  // Der konkrete Benutzername, falls bekannt.
  if (nutzer) s = s.split(nutzer).join('[nutzer]');
  // E-Mail-Adressen.
  s = s.replace(/\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, '[email]');
  // IPv4, volles und komprimiertes IPv6 (::). Uhrzeiten wie 17:13:43 bleiben,
  // weil sie kein „::" haben und keine acht Gruppen bilden.
  s = s.replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, '[ip]');
  s = s.replace(/\b(?:[0-9a-f]{1,4}:){7}[0-9a-f]{1,4}\b/gi, '[ip]');
  s = s.replace(/\b(?:[0-9a-f]{1,4}:){1,6}:[0-9a-f]{1,4}(?::[0-9a-f]{1,4}){0,5}\b/gi, '[ip]');
  // Bekannte Schlüssel-/Token-Formate.
  s = s.replace(/\b(?:sk|pk|ghp|gho|ghs|xox[baprs])[-_][A-Za-z0-9]{10,}\b/g, '[key]');
  s = s.replace(/\b(Bearer|Token|Authorization)\b\s*[:=]?\s*[A-Za-z0-9._\-]{8,}/gi, '$1 [token]');
  // Lange zusammenhängende Zeichenketten (Tokens, Hashes, base64) maskieren.
  s = s.replace(/\b[A-Za-z0-9+/_\-]{32,}={0,2}\b/g, '[gekuerzt]');
  return s;
}

// Baut einen rein technischen Bericht. Nur Werte, die bei Grafik-/Startproblemen
// helfen – nichts Persönliches. Alle Textteile laufen durch bereinigen().
function bericht({ version = '', windows = '', electron = '', gpu = {}, software = false, logZeilen = [], grund = '' } = {}) {
  const nutzer = (() => { try { return os.userInfo().username || ''; } catch { return ''; } })();
  const b = (t) => bereinigen(t, { nutzer });
  const zeilen = [
    `Julia-Version: ${b(version)}`,
    `Windows: ${b(windows)}`,
    `Electron: ${b(electron)}`,
    `GPU: ${b(gpu.renderer || gpu.vendor || 'unbekannt')}${gpu.treiber ? ` (Treiber ${b(String(gpu.treiber))})` : ''}`,
    `Software-Rendering: ${software ? 'ja' : 'nein'}`,
  ];
  if (grund) zeilen.unshift(`Anlass: ${b(grund)}`);
  const log = (Array.isArray(logZeilen) ? logZeilen : []).slice(-40).map((z) => b(String(z)));
  const titel = `Diagnose ${b(version)}${grund ? ` – ${b(grund).slice(0, 60)}` : ''}`;
  const text = [zeilen.join('\n'), log.length ? `\n--- Logbuch (bereinigt) ---\n${log.join('\n')}` : ''].join('\n').trim();
  return { titel, text };
}

module.exports = { bereinigen, bericht };
