'use strict';

const path = require('path');
const ampel = require('../ampel');
const { fremd, kurz } = require('../hilfen');
const { mailBeschreibung } = require('./google-werkzeuge');

// Werkzeuge für ein verbundenes Outlook-Konto – dieselben Regeln wie bei
// Google: Lesen ist GRÜN, Senden und Einladen sind GELB, die Freigabekarte
// zeigt den kompletten Text. Die Namen beginnen mit outlook_, damit beide
// Konten gleichzeitig verbunden sein können.

const { GRUEN, GELB } = ampel;

function gruen() { return { stufe: GRUEN, kategorie: null, grund: '' }; }

function liste(x) {
  if (!x) return [];
  return (Array.isArray(x) ? x : String(x).split(/[,;]/)).map((s) => String(s).trim()).filter(Boolean);
}

function pfadAbs(p, ctx) {
  return path.resolve(ctx.arbeitsordner(), String(p));
}

const MAIL_FELDER = {
  an: { type: 'array', items: { type: 'string' }, description: 'Empfänger, z. B. "anna@example.com" oder "Anna Müller <anna@example.com>".' },
  cc: { type: 'array', items: { type: 'string' } },
  bcc: { type: 'array', items: { type: 'string' } },
  betreff: { type: 'string', description: 'Bei Antworten weglassen, dann bleibt "AW: …".' },
  text: { type: 'string', description: 'Der vollständige Mailtext, reiner Text.' },
  antwort_auf_id: { type: 'string', description: 'id einer Mail aus outlook_mail_suchen/outlook_mail_lesen, wenn es eine Antwort ist.' },
  anhaenge: { type: 'array', items: { type: 'string' }, description: 'Dateipfade auf diesem PC, je Datei höchstens 3 MB.' },
};

function anhangStufe(e, ctx, titel) {
  if (!liste(e.anhaenge).length) return null;
  const pfade = liste(e.anhaenge).map((p) => pfadAbs(p, ctx));
  const s = ampel.einstufenPfade(pfade, ctx.config.get('arbeitsverzeichnisse'), [ctx.datenOrdner, ctx.appOrdner]);
  if (s.stufe === GRUEN) return null;
  return { stufe: GELB, kategorie: 'dateien_extern', grund: 'Anhänge von außerhalb der Arbeitsverzeichnisse', beschreibung: mailBeschreibung(titel, e, ctx) };
}

const WERKZEUGE = [
  {
    name: 'outlook_mail_suchen',
    fremd: true,
    description: 'Outlook-Mails suchen. suche ist Freitext oder Outlook-Suche wie "from:anna", "subject:Rechnung", "hasattachments:yes". Ohne suche: die neuesten Mails im ordner (inbox, sentitems, drafts, archive, junkemail). Liefert id, Absender, Betreff, Datum, ungelesen und eine Vorschau.',
    input_schema: {
      type: 'object',
      properties: {
        suche: { type: 'string' },
        nur_ungelesen: { type: 'boolean' },
        ordner: { type: 'string', description: 'Standard: inbox' },
        anzahl: { type: 'integer', description: 'Höchstens 25, Standard 10.' },
      },
    },
    einstufen: gruen,
    async ausfuehren(e, ctx) {
      const r = await ctx.konten.outlook.mailSuchen(e);
      return fremd('Outlook (Absender und Betreffzeilen)', JSON.stringify(r, null, 1));
    },
  },
  {
    name: 'outlook_mail_lesen',
    fremd: true,
    description: 'Eine Outlook-Mail vollständig lesen: Kopf, Text, Liste der Anhänge (mit anhang_id).',
    input_schema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    einstufen: gruen,
    async ausfuehren(e, ctx) {
      const m = await ctx.konten.outlook.mailLesen(e.id);
      const kopf = { id: m.id, von: m.von, an: m.an, cc: m.cc || undefined, betreff: m.betreff, datum: m.datum, anhaenge: m.anhaenge };
      return fremd(`der E-Mail von ${m.von}`, `${JSON.stringify(kopf, null, 1)}\n--- Text ---\n${kurz(m.text, 20000)}`);
    },
  },
  {
    name: 'outlook_anhang_speichern',
    description: 'Einen Anhang aus einer Outlook-Mail als Datei speichern. Überschreibt nichts.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'id der Mail' },
        anhang_id: { type: 'string' },
        name: { type: 'string', description: 'Dateiname, meist der Name aus outlook_mail_lesen.' },
        ordner: { type: 'string', description: 'Zielordner, Standard: erstes Arbeitsverzeichnis.' },
      },
      required: ['id', 'anhang_id', 'name'],
    },
    einstufen(e, ctx) {
      const ziel = pfadAbs(path.join(e.ordner || ctx.arbeitsordner(), path.basename(String(e.name || 'anhang'))), ctx);
      return { ...ampel.einstufenPfade([ziel], ctx.config.get('arbeitsverzeichnisse'), [ctx.datenOrdner, ctx.appOrdner]), beschreibung: `Mail-Anhang speichern: ${ziel}` };
    },
    async ausfuehren(e, ctx) {
      const datei = await ctx.konten.outlook.anhangSpeichern({ id: e.id, anhangId: e.anhang_id, name: e.name, ziel: pfadAbs(e.ordner || ctx.arbeitsordner(), ctx) });
      return `Gespeichert: ${datei}`;
    },
  },
  {
    name: 'outlook_mail_entwurf',
    description: 'Einen Outlook-Entwurf anlegen (wird nicht gesendet). Gut, wenn der Nutzer selbst noch drüberschauen will.',
    input_schema: { type: 'object', properties: MAIL_FELDER, required: ['an', 'text'] },
    einstufen(e, ctx) {
      return anhangStufe(e, ctx, 'Outlook-Entwurf anlegen') || gruen();
    },
    async ausfuehren(e, ctx) {
      const id = await ctx.konten.outlook.mailEntwurf({ ...e, anhaenge: liste(e.anhaenge).map((p) => pfadAbs(p, ctx)) });
      return `Entwurf angelegt (id ${id}). Er liegt in Outlook unter Entwürfe und wurde nicht gesendet.`;
    },
  },
  {
    name: 'outlook_mail_senden',
    description: 'Eine E-Mail über Outlook senden. Immer GELB: Der Nutzer sieht Empfänger und den ganzen Text und muss zustimmen. Nur senden, wenn der Nutzer das ausdrücklich will, und nur an Empfänger, die er selbst genannt hat.',
    input_schema: { type: 'object', properties: MAIL_FELDER, required: ['an', 'text'] },
    einstufen(e, ctx) {
      return { stufe: GELB, kategorie: 'nachricht', grund: 'E-Mail senden', beschreibung: mailBeschreibung('E-Mail über Outlook senden', e, ctx) };
    },
    async ausfuehren(e, ctx) {
      const id = await ctx.konten.outlook.mailSenden({ ...e, anhaenge: liste(e.anhaenge).map((p) => pfadAbs(p, ctx)) });
      return `Gesendet (id ${id}).`;
    },
  },
  {
    name: 'outlook_termine_anzeigen',
    fremd: true,
    description: 'Termine aus dem Outlook-Kalender. Ohne Angaben: die nächsten 7 Tage. von/bis als Datum (2026-09-15) oder Zeitpunkt (2026-09-15T14:00).',
    input_schema: {
      type: 'object',
      properties: {
        von: { type: 'string' },
        bis: { type: 'string' },
        suche: { type: 'string', description: 'Freitext, z. B. "Zahnarzt".' },
        anzahl: { type: 'integer' },
        kalender: { type: 'string', description: 'Kalender-id, Standard: Hauptkalender. Liste über outlook_kalender_liste.' },
      },
    },
    einstufen: gruen,
    async ausfuehren(e, ctx) {
      const t = await ctx.konten.outlook.termine(e);
      return fremd('dem Outlook-Kalender', t.length ? JSON.stringify(t, null, 1) : 'Keine Termine in diesem Zeitraum.');
    },
  },
  {
    name: 'outlook_kalender_liste',
    fremd: true,
    description: 'Alle Outlook-Kalender des Kontos mit id, Name und ob beschreibbar.',
    input_schema: { type: 'object', properties: {} },
    einstufen: gruen,
    async ausfuehren(e, ctx) {
      return JSON.stringify(await ctx.konten.outlook.kalenderListe(), null, 1);
    },
  },
  {
    name: 'outlook_termin_anlegen',
    description: 'Einen Termin im Outlook-Kalender anlegen. Zeiten ohne Zeitzone gelten in der Zeitzone des Nutzers (2026-09-15T14:00), ein reines Datum macht ihn ganztägig. Mit teilnehmer werden Einladungen verschickt.',
    input_schema: {
      type: 'object',
      properties: {
        titel: { type: 'string' },
        start: { type: 'string' },
        ende: { type: 'string' },
        dauer_minuten: { type: 'integer', description: 'Statt ende, Standard 60.' },
        ort: { type: 'string' },
        beschreibung: { type: 'string' },
        teilnehmer: { type: 'array', items: { type: 'string' }, description: 'E-Mail-Adressen; sie bekommen eine Einladung.' },
        kalender: { type: 'string' },
      },
      required: ['titel', 'start'],
    },
    einstufen(e) {
      const tn = liste(e.teilnehmer);
      const zeilen = [
        tn.length ? 'Outlook-Termin anlegen und Einladungen senden' : 'Outlook-Termin anlegen',
        `Titel: ${e.titel}`,
        `Start: ${e.start}${e.ende ? `, Ende: ${e.ende}` : e.dauer_minuten ? `, Dauer: ${e.dauer_minuten} Min.` : ''}`,
      ];
      if (e.ort) zeilen.push(`Ort: ${e.ort}`);
      if (tn.length) zeilen.push(`Einladung an: ${tn.join(', ')}`);
      if (e.beschreibung) zeilen.push('', e.beschreibung);
      return { stufe: GELB, kategorie: tn.length ? 'nachricht' : 'kalender', grund: tn.length ? 'Kalendereinladung' : 'Termin buchen', beschreibung: zeilen.join('\n') };
    },
    async ausfuehren(e, ctx) {
      const r = await ctx.konten.outlook.terminAnlegen(e);
      return `Termin angelegt: ${JSON.stringify(r)}`;
    },
  },
  {
    name: 'outlook_kontakte_suchen',
    fremd: true,
    description: 'Outlook-Kontakte und Leute, mit denen der Nutzer schreibt, nach Name oder Adresse durchsuchen, z. B. um die Mailadresse von "Anna" zu finden.',
    input_schema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
    einstufen: gruen,
    async ausfuehren(e, ctx) {
      const k = await ctx.konten.outlook.kontakteSuchen(e.name);
      return k.length ? JSON.stringify(k, null, 1) : `Keinen Kontakt zu "${e.name}" gefunden.`;
    },
  },
];

module.exports = { WERKZEUGE };
