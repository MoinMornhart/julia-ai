'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// E-Mails bauen (RFC 5322 / MIME) und empfangene Mails lesbar machen.
// Ohne Abhängigkeiten, damit es auch für IMAP/SMTP wiederverwendbar ist.

const MIME_TYPEN = {
  '.pdf': 'application/pdf', '.txt': 'text/plain', '.csv': 'text/csv', '.html': 'text/html',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.zip': 'application/zip', '.json': 'application/json', '.xml': 'application/xml',
  '.doc': 'application/msword', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint', '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.ics': 'text/calendar', '.mp3': 'audio/mpeg', '.mp4': 'video/mp4',
};

const MAX_ANHAENGE_BYTES = 18 * 1024 * 1024;
const EMAIL = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]+$/;

function ohneZeilenumbruch(s) {
  return String(s ?? '').replace(/[\r\n]+/g, ' ').trim();
}

function kopfKodieren(s) {
  const t = ohneZeilenumbruch(s);
  return /^[\x20-\x7e]*$/.test(t) ? t : `=?UTF-8?B?${Buffer.from(t, 'utf8').toString('base64')}?=`;
}

// "Anna Müller <anna@x.de>" oder "anna@x.de" – prüft die Adresse und
// kodiert den Namen, damit Umlaute unterwegs heil bleiben.
function adresse(eingabe) {
  const s = ohneZeilenumbruch(eingabe);
  const m = /^(.*)<([^>]+)>$/.exec(s);
  const name = m ? m[1].trim().replace(/^"|"$/g, '') : '';
  const mail = (m ? m[2] : s).trim();
  if (!EMAIL.test(mail)) throw new Error(`"${s}" ist keine gültige E-Mail-Adresse.`);
  return name ? `${kopfKodieren(name)} <${mail}>` : mail;
}

function adressliste(liste) {
  const l = (Array.isArray(liste) ? liste : String(liste || '').split(/[,;]/)).map((x) => String(x).trim()).filter(Boolean);
  return l.map(adresse);
}

function base64Zeilen(buf) {
  return buf.toString('base64').replace(/.{76}/g, '$&\r\n');
}

function anhaengeLesen(pfade) {
  let summe = 0;
  return (pfade || []).map((p) => {
    const s = fs.statSync(p);
    if (!s.isFile()) throw new Error(`${p} ist keine Datei.`);
    summe += s.size;
    if (summe > MAX_ANHAENGE_BYTES) throw new Error('Anhänge sind zusammen größer als 18 MB.');
    return {
      name: path.basename(p),
      typ: MIME_TYPEN[path.extname(p).toLowerCase()] || 'application/octet-stream',
      daten: fs.readFileSync(p),
    };
  });
}

// Baut die komplette Mail als Text mit CRLF-Zeilenenden.
function bauen({ von, an, cc, bcc, betreff, text, inReplyTo, references, anhaenge }) {
  const empfaenger = adressliste(an);
  if (!empfaenger.length) throw new Error('Mindestens ein Empfänger ist nötig.');
  const kopf = [];
  if (von) kopf.push(`From: ${adresse(von)}`);
  kopf.push(`To: ${empfaenger.join(', ')}`);
  const ccL = adressliste(cc);
  if (ccL.length) kopf.push(`Cc: ${ccL.join(', ')}`);
  const bccL = adressliste(bcc);
  if (bccL.length) kopf.push(`Bcc: ${bccL.join(', ')}`);
  kopf.push(`Subject: ${kopfKodieren(betreff || '')}`);
  kopf.push(`Date: ${new Date().toUTCString().replace('GMT', '+0000')}`);
  if (inReplyTo) {
    kopf.push(`In-Reply-To: ${ohneZeilenumbruch(inReplyTo)}`);
    kopf.push(`References: ${ohneZeilenumbruch(references || inReplyTo)}`);
  }
  kopf.push('MIME-Version: 1.0');

  const textTeil = [
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    base64Zeilen(Buffer.from(String(text || ''), 'utf8')),
  ].join('\r\n');

  const dateien = anhaengeLesen(anhaenge);
  if (!dateien.length) return `${kopf.join('\r\n')}\r\n${textTeil}\r\n`;

  const grenze = `julia-${crypto.randomBytes(12).toString('hex')}`;
  kopf.push(`Content-Type: multipart/mixed; boundary="${grenze}"`);
  const teile = [textTeil];
  for (const d of dateien) {
    const name = kopfKodieren(d.name);
    teile.push([
      `Content-Type: ${d.typ}; name="${name}"`,
      `Content-Disposition: attachment; filename="${name}"`,
      'Content-Transfer-Encoding: base64',
      '',
      base64Zeilen(d.daten),
    ].join('\r\n'));
  }
  return `${kopf.join('\r\n')}\r\n\r\n${teile.map((t) => `--${grenze}\r\n${t}`).join('\r\n')}\r\n--${grenze}--\r\n`;
}

const ENTITAETEN = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", auml: 'ä', ouml: 'ö', uuml: 'ü', Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü', szlig: 'ß', euro: '€', hellip: '…', ndash: '–', mdash: '—' };

function htmlZuText(html) {
  return String(html || '')
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6]|blockquote)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_, url, t) => `${t} (${url})`)
    .replace(/<[^>]+>/g, '')
    .replace(/&(#x?[0-9a-f]+|\w+);/gi, (ganz, e) => {
      if (e[0] === '#') {
        const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(n) ? String.fromCodePoint(n) : ganz;
      }
      return ENTITAETEN[e] ?? ganz;
    })
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

module.exports = { bauen, adresse, adressliste, kopfKodieren, htmlZuText, anhaengeLesen, MIME_TYPEN };
