'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

// Setzt den System-Prompt aus prompt/julia.<sprache>.md zusammen. Die
// Platzhalter kommen aus der Einrichtung und vom Rechner selbst.

const PROMPT_ORDNER = path.join(__dirname, '..', '..', 'prompt');

function windowsBezeichnung() {
  const build = Number(os.release().split('.')[2]) || 0;
  return `Windows ${build >= 22000 ? 11 : 10} (Build ${build})`;
}

function zeitzone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Berlin';
  } catch {
    return 'Europe/Berlin';
  }
}

function platzhalterWerte({ sprachcode, name, arbeitsverzeichnisse }) {
  const en = sprachcode === 'en';
  return {
    NUTZER: (name || '').trim() || (en ? 'your user' : 'deinem Nutzer'),
    HOSTNAME: os.hostname(),
    VERSION: windowsBezeichnung(),
    USERNAME: os.userInfo().username,
    ARBEITSVERZEICHNISSE: arbeitsverzeichnisse && arbeitsverzeichnisse.length
      ? arbeitsverzeichnisse.join(', ')
      : (en ? '(none set yet)' : '(noch keine festgelegt)'),
    ZEITZONE: zeitzone(),
  };
}

function ausfuellen(vorlage, werte) {
  return vorlage.replace(/\{\{(\w+)\}\}/g, (ganz, k) => (k in werte ? werte[k] : ganz));
}

function systemPrompt(opts) {
  const code = opts.sprachcode === 'en' ? 'en' : 'de';
  const vorlage = fs.readFileSync(path.join(PROMPT_ORDNER, `julia.${code}.md`), 'utf8');
  return ausfuellen(vorlage, platzhalterWerte({ ...opts, sprachcode: code }));
}

// Der zweite Block im System-Prompt: ändert sich selten (Gedächtnis, Kanal),
// deshalb getrennt vom großen, gecachten ersten Block.
function laufzeitKontext({ sprachcode, kanal, version, monitore, gedaechtnis, vorgemerkt }) {
  const en = sprachcode === 'en';
  const mon = (monitore || [])
    .map((m) => `${m.index}${m.haupt ? (en ? ' (primary)' : ' (Hauptmonitor)') : ''}: ${m.breite}x${m.hoehe}`)
    .join(', ');
  const zeilen = en
    ? [
      '## Runtime',
      `- Channel: \`${kanal}\``,
      `- Julia version: ${version}`,
      `- Monitors: ${mon || 'unknown'}`,
      '',
      '## Memory',
      gedaechtnis,
    ]
    : [
      '## Laufzeit',
      `- Kanal: \`${kanal}\``,
      `- Julia-Version: ${version}`,
      `- Monitore: ${mon || 'unbekannt'}`,
      '',
      '## Gedächtnis',
      gedaechtnis,
    ];
  if (vorgemerkt && vorgemerkt.length) {
    zeilen.push('', en ? '## Queued from unattended runs (present these once)' : '## Vorgemerkt aus unbeaufsichtigten Läufen (einmal vorlegen)');
    for (const v of vorgemerkt) zeilen.push(`- ${v.zeit.slice(0, 16).replace('T', ' ')}: ${v.beschreibung}`);
  }
  return zeilen.join('\n');
}

function zeitstempel(sprachcode) {
  const jetzt = new Date();
  return jetzt.toLocaleString(sprachcode === 'en' ? 'en-GB' : 'de-DE', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

module.exports = { systemPrompt, laufzeitKontext, platzhalterWerte, ausfuellen, zeitstempel, windowsBezeichnung };
