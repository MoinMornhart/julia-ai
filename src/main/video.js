'use strict';

// Videos schneiden & Thumbnails (Nutzerwunsch): eine dünne, sichere Hülle um
// ffmpeg. Die reine Logik – Zeit-Parsing, Argument-Bau, ffmpeg-Pfadwahl,
// Concat-Liste – ist frei von Seiteneffekten und getestet; nur `ausfuehren`
// startet ffmpeg als Kindprozess. Nichts wird hochgeladen: alles lokal.

const { execFile } = require('child_process');
const fs = require('fs');

// ffmpeg finden: 1) vom Nutzer gesetzter Pfad, 2) mitgeliefertes ffmpeg-static,
// 3) „ffmpeg" aus dem PATH. `existiert` ist injizierbar (Tests).
function ffmpegPfad({ gesetzt, statisch, existiert } = {}) {
  const da = existiert || ((p) => { try { return !!p && fs.existsSync(p); } catch { return false; } });
  if (gesetzt && da(gesetzt)) return gesetzt;
  if (statisch && da(statisch)) return statisch;
  return 'ffmpeg';
}

// „HH:MM:SS(.mmm)", „MM:SS", „SS" oder eine Sekundenzahl → Sekunden (>= 0).
// Wirft bei ungültiger Eingabe eine klare Meldung.
function zeitSekunden(text) {
  const s = String(text == null ? '' : text).trim();
  if (s === '') throw new Error('Es fehlt eine Zeitangabe.');
  if (/^\d+(\.\d+)?$/.test(s)) return Number(s);
  const teile = s.split(':').map((t) => t.trim());
  if (teile.length < 2 || teile.length > 3 || teile.some((t) => !/^\d+(\.\d+)?$/.test(t))) {
    throw new Error(`„${s}" ist keine gültige Zeit (z. B. 90, 1:30 oder 00:01:30).`);
  }
  return teile.map(Number).reduce((sek, z) => sek * 60 + z, 0);
}

// Argumente fürs Schneiden/Trimmen. Standard schnell ohne Neukodieren
// (`-c copy`, schneidet an Keyframes); `genau=true` kodiert neu (exakt, langsamer).
function argsSchneiden({ eingabe, ausgabe, von, bis, genau = false }) {
  if (!eingabe || !ausgabe) throw new Error('eingabe und ausgabe sind nötig.');
  const vonS = von == null || von === '' ? null : zeitSekunden(von);
  const bisS = bis == null || bis === '' ? null : zeitSekunden(bis);
  if (vonS != null && bisS != null && bisS <= vonS) throw new Error('„bis" muss nach „von" liegen.');
  const a = ['-y'];
  if (vonS != null) a.push('-ss', String(vonS));
  a.push('-i', eingabe);
  if (bisS != null) a.push('-t', String(vonS != null ? bisS - vonS : bisS));
  if (genau) a.push('-c:v', 'libx264', '-c:a', 'aac');
  else a.push('-c', 'copy');
  a.push(ausgabe);
  return a;
}

// Thumbnail: ein Standbild zur Zeit `zeit` (optional auf `breite` skaliert).
function argsThumbnail({ eingabe, ausgabe, zeit = 0, breite }) {
  if (!eingabe || !ausgabe) throw new Error('eingabe und ausgabe sind nötig.');
  const a = ['-y', '-ss', String(zeitSekunden(zeit)), '-i', eingabe, '-frames:v', '1'];
  if (breite && Number(breite) > 0) a.push('-vf', `scale=${Math.round(Number(breite))}:-1`);
  a.push(ausgabe);
  return a;
}

// Mehrere Videos gleicher Kodierung aneinanderhängen (concat-Demuxer + Listendatei).
function argsZusammenfuegen({ listeDatei, ausgabe }) {
  if (!listeDatei || !ausgabe) throw new Error('listeDatei und ausgabe sind nötig.');
  return ['-y', '-f', 'concat', '-safe', '0', '-i', listeDatei, '-c', 'copy', ausgabe];
}

// Inhalt der concat-Listendatei (ffmpeg-Escaping der einfachen Anführungszeichen).
function concatListe(dateien) {
  if (!Array.isArray(dateien) || dateien.length < 2) throw new Error('Mindestens zwei Dateien zum Zusammenfügen angeben.');
  return `${dateien.map((p) => `file '${String(p).replace(/'/g, "'\\''")}'`).join('\n')}\n`;
}

function fehlerText(err, stderr) {
  if (err && err.code === 'ENOENT') return 'ffmpeg wurde nicht gefunden. Bitte ffmpeg installieren (oder den Pfad in den Einstellungen angeben) – dann kann ich Videos schneiden.';
  const rest = String(stderr || (err && err.message) || '').trim().split('\n').filter(Boolean).slice(-3).join(' ');
  return `Video-Werkzeug (ffmpeg) fehlgeschlagen: ${rest || 'unbekannter Fehler'}`;
}

// ffmpeg ausführen (Kindprozess). `starten` ist injizierbar (Tests).
function ausfuehren(pfad, args, { starten = execFile, zeitlimit = 600000 } = {}) {
  return new Promise((resolve, reject) => {
    starten(pfad, args, { windowsHide: true, timeout: zeitlimit, maxBuffer: 16 * 1024 * 1024 }, (err, _out, stderr) => {
      if (err) reject(new Error(fehlerText(err, stderr)));
      else resolve(true);
    });
  });
}

module.exports = { ffmpegPfad, zeitSekunden, argsSchneiden, argsThumbnail, argsZusammenfuegen, concatListe, fehlerText, ausfuehren };
