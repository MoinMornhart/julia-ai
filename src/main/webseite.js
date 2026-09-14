'use strict';

const dns = require('dns');
const net = require('net');

// Webseiten lesen für Anbieter ohne eigene Websuche. Nur öffentliche
// Adressen: Nichts auf diesem PC, im Heimnetz oder an Link-Local-Adressen –
// sonst könnte ein untergeschobener Auftrag den Router oder lokale Dienste
// abfragen. Auch jede Weiterleitung wird neu geprüft.

const MAX_BYTES = 2 * 1024 * 1024;
const MAX_TEXT = 30000;

function intern(roh) {
  const ip = String(roh || '').replace(/^\[|\]$/g, '').toLowerCase();
  const v4 = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(ip);
  if (v4) return intern(v4[1]);
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  if (net.isIPv6(ip)) return ip === '::' || ip === '::1' || /^f[cd]/.test(ip) || /^fe[89ab]/.test(ip);
  return true;
}

async function adresseErlaubt(roh, aufloesen = (h) => dns.promises.lookup(h, { all: true })) {
  let u;
  try { u = new URL(String(roh || '').trim()); } catch { throw new Error('Das ist keine gültige Webadresse.'); }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('Nur http:// und https://.');
  if (u.username || u.password) throw new Error('Adressen mit Zugangsdaten ruft Julia nicht ab.');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) throw new Error('Adressen auf diesem PC oder im Heimnetz ruft Julia nicht ab.');
  const ips = net.isIP(host) ? [host] : (await aufloesen(host)).map((x) => x.address);
  if (!ips.length || ips.some(intern)) throw new Error('Adressen auf diesem PC oder im Heimnetz ruft Julia nicht ab.');
  return u;
}

const ENTITAETEN = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…', auml: 'ä', ouml: 'ö', uuml: 'ü', Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü', szlig: 'ß', euro: '€', copy: '©' };

function htmlZuText(html) {
  const titel = (/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html) || [])[1];
  let t = String(html)
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|template|iframe|head)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6]|section|article|header|footer|blockquote|pre)>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '\n- ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
      if (e[0] === '#') {
        const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : ' ';
      }
      return ENTITAETEN[e] ?? m;
    })
    .replace(/[ \t\f\v\r]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (titel) t = `${htmlZuText(titel)}\n\n${t}`;
  return t;
}

async function koerperLesen(r) {
  if (!r.body || !r.body.getReader) return String(await r.text()).slice(0, MAX_BYTES);
  const leser = r.body.getReader();
  const teile = [];
  let n = 0;
  for (;;) {
    const { done, value } = await leser.read();
    if (done) break;
    n += value.length;
    teile.push(Buffer.from(value));
    if (n >= MAX_BYTES) { try { await leser.cancel(); } catch { /* egal */ } break; }
  }
  return Buffer.concat(teile).toString('utf8');
}

async function webseiteLesen(adresse, { holen = (u, o) => globalThis.fetch(u, o), aufloesen } = {}) {
  let u = await adresseErlaubt(adresse, aufloesen);
  for (let i = 0; i < 5; i++) {
    const r = await holen(u.toString(), {
      redirect: 'manual',
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Julia-AI', Accept: 'text/html,text/plain,application/json;q=0.9,*/*;q=0.5' },
      signal: AbortSignal.timeout(20000),
    });
    const ziel = r.status >= 300 && r.status < 400 && r.headers.get('location');
    if (ziel) {
      u = await adresseErlaubt(new URL(ziel, u).toString(), aufloesen);
      continue;
    }
    if (!r.ok) throw new Error(`Die Seite antwortet mit ${r.status}.`);
    const typ = r.headers.get('content-type') || '';
    if (typ && !/text\/|json|xml/i.test(typ)) throw new Error(`Das ist keine Textseite (${typ.split(';')[0]}).`);
    const roh = await koerperLesen(r);
    const text = /html/i.test(typ) || /^\s*</.test(roh) ? htmlZuText(roh) : roh;
    return `${u}\n\n${text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}\n… [gekürzt]` : text}`;
  }
  throw new Error('Zu viele Weiterleitungen.');
}

module.exports = { webseiteLesen, adresseErlaubt, htmlZuText, intern };
