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

// Die Form der Assistenz bestimmt, wie der deutsche Prompt über sie spricht.
const FORMEN = {
  weiblich: { ROLLE: 'die persönliche Assistentin', KOLLEGE: 'eine kompetente Kollegin', BERUFE: 'keine Ärztin, Anwältin oder Finanzberaterin' },
  maennlich: { ROLLE: 'der persönliche Assistent', KOLLEGE: 'ein kompetenter Kollege', BERUFE: 'kein Arzt, Anwalt oder Finanzberater' },
  neutral: { ROLLE: 'die persönliche KI', KOLLEGE: 'jemand Kompetentes aus dem Team', BERUFE: 'kein Ersatz für ärztlichen, rechtlichen oder finanziellen Rat' },
};

// Namen gelangen in den System-Prompt. Alles, was dort Anweisungen oder
// Formatierung einschleusen könnte, fliegt raus (Config prüft das auch).
function sichererName(text, max, ersatz) {
  const s = String(text || '').replace(/[^\p{L}\p{N} .'’-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, max);
  return s || ersatz;
}

function genitiv(name) {
  return /[sßxz]$/i.test(name) ? `${name}'` : `${name}s`;
}

// Pronomen für den deutschen Text; im Englischen bleibt der Prompt beim
// neutralen "they", dort steht nur die Hinweiszeile.
function pronomenWerte(pronomen, eigen, name) {
  const neutral = { ER: name, IHN: name, IHM: name, SEIN: genitiv(name), SEINEM: genitiv(name) };
  switch (pronomen) {
    case 'er':
      return { ER: 'er', IHN: 'ihn', IHM: 'ihm', SEIN: 'sein', SEINEM: 'seinem', de: `Sprich über ${name} mit er/ihm.`, en: `Refer to ${name} as he/him.` };
    case 'sie':
      return { ER: 'sie', IHN: 'sie', IHM: 'ihr', SEIN: 'ihr', SEINEM: 'ihrem', de: `Sprich über ${name} mit sie/ihr.`, en: `Refer to ${name} as she/her.` };
    case 'eigene': {
      // Eigene Pronomen brauchen den Schrägstrich ("xier/xiem"), Ziffern und Punkte nicht.
      const p = String(eigen || '').replace(/[^\p{L} /'’-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 30);
      if (p) {
        return {
          ...neutral,
          de: `${name} verwendet die Pronomen „${p}". Nutze sie, wenn du über ${name} sprichst; im Zweifel nimm einfach den Namen.`,
          en: `${name} uses the pronouns "${p}". Use them when you refer to ${name}.`,
        };
      }
      return { ...neutral, de: `Sprich über ${name} ohne Pronomen, nur mit dem Namen.`, en: `Refer to ${name} as they/them or simply by name.` };
    }
    default:
      return { ...neutral, de: `Sprich über ${name} ohne Pronomen, nur mit dem Namen.`, en: `Refer to ${name} as they/them or simply by name.` };
  }
}

function platzhalterWerte({ sprachcode, name, arbeitsverzeichnisse, assistent, pronomen, pronomenEigen }) {
  const en = sprachcode === 'en';
  const nutzer = sichererName(name, 40, en ? 'the user' : 'Nutzer');
  const a = assistent || {};
  const form = FORMEN[a.form] || FORMEN.weiblich;
  const p = pronomenWerte(pronomen, pronomenEigen, nutzer);
  return {
    NUTZER: nutzer,
    ASSISTENT: sichererName(a.name, 24, 'Julia'),
    ...form,
    ER: p.ER,
    IHN: p.IHN,
    IHM: p.IHM,
    SEIN: p.SEIN,
    SEINEM: p.SEINEM,
    PRONOMEN_ZEILE: en ? p.en : p.de,
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
function laufzeitKontext({ sprachcode, kanal, version, monitore, gedaechtnis, vorgemerkt, konten, minecraft }) {
  const en = sprachcode === 'en';
  const mon = (monitore || [])
    .map((m) => `${m.index}${m.haupt ? (en ? ' (primary)' : ' (Hauptmonitor)') : ''}: ${m.breite}x${m.hoehe}`)
    .join(', ');
  const kontoText = (konten || []).map((k) => `${k.dienst}${k.konto ? ` – ${k.konto}` : ''}`).join('; ');
  // Nur was sich während einer Runde nicht ändert – sonst verfällt der Cache.
  const mc = minecraft && minecraft.verbunden ? `${minecraft.name} @ ${minecraft.server} (${minecraft.version})` : '';
  const zeilen = en
    ? [
      '## Runtime',
      `- Channel: \`${kanal}\``,
      `- Julia version: ${version}`,
      `- Monitors: ${mon || 'unknown'}`,
      `- Connected accounts: ${kontoText || 'none'}`,
      ...(mc ? [`- Minecraft: in game as ${mc} – use the minecraft_* tools for anything in the game`] : []),
      '',
      '## Memory',
      gedaechtnis,
    ]
    : [
      '## Laufzeit',
      `- Kanal: \`${kanal}\``,
      `- Julia-Version: ${version}`,
      `- Monitore: ${mon || 'unbekannt'}`,
      `- Verbundene Konten: ${kontoText || 'keine'}`,
      ...(mc ? [`- Minecraft: im Spiel als ${mc} – für alles im Spiel die minecraft_*-Werkzeuge`] : []),
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
