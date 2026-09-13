'use strict';

const { desktopCapturer, screen, nativeImage } = require('electron');
const schwaerzen = require('./schwaerzen');

// Screenshots und die Umrechnung von Bildkoordinaten auf echte Bildschirm-
// pixel. Julia klickt in Koordinaten des zuletzt gesehenen Bildes; hier wird
// daraus die physische Position.

const MAX_KANTE = 1568;

const letzte = new Map();
let letzterScreenshot = 0;

// 0 = Hauptmonitor, danach die übrigen von links nach rechts.
function monitore() {
  const haupt = screen.getPrimaryDisplay();
  const andere = screen.getAllDisplays()
    .filter((d) => d.id !== haupt.id)
    .sort((a, b) => a.bounds.x - b.bounds.x || a.bounds.y - b.bounds.y);
  return [haupt, ...andere];
}

function beschreibung() {
  return monitore().map((d, i) => {
    const p = screen.dipToScreenRect(null, d.bounds);
    return { index: i, haupt: i === 0, breite: p.width, hoehe: p.height, skalierung: d.scaleFactor };
  });
}

// rechtecke: Bereiche in physischen Bildschirmpixeln, die geschwärzt werden
// (Passwortfelder), bevor das Bild weitergegeben wird.
async function aufnehmen(index, { rechtecke = [] } = {}) {
  const ds = monitore();
  const ziele = index == null ? ds.map((_, i) => i) : [index];
  const bilder = [];
  for (const i of ziele) {
    if (!Number.isInteger(i) || i < 0 || i >= ds.length) {
      throw new Error(`Monitor ${i} gibt es nicht. Vorhanden: 0 bis ${ds.length - 1}.`);
    }
    const d = ds[i];
    const phys = screen.dipToScreenRect(null, d.bounds);
    const f = Math.min(1, MAX_KANTE / Math.max(phys.width, phys.height));
    const groesse = { width: Math.round(phys.width * f), height: Math.round(phys.height * f) };
    const quellen = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: groesse });
    if (!quellen.length) {
      throw new Error('Windows liefert gerade kein Bildschirmbild. Das passiert bei gesperrtem Bildschirm, in Remote-Sitzungen ohne Desktop oder wenn der Zugriff auf Bildschirmaufnahmen in den Windows-Datenschutzeinstellungen gesperrt ist.');
    }
    const q = quellen.find((s) => s.display_id === String(d.id)) || quellen[i];
    if (!q || q.thumbnail.isEmpty()) throw new Error(`Monitor ${i} ließ sich nicht aufnehmen.`);
    const s = q.thumbnail.getSize();
    letzte.set(i, { phys, breite: s.width, hoehe: s.height });
    let bild = q.thumbnail;
    const bereiche = schwaerzen.aufBild(rechtecke, phys, s.width, s.height);
    if (bereiche.length) {
      const puffer = schwaerzen.fuellen(Buffer.from(bild.toBitmap()), s.width, bereiche);
      bild = nativeImage.createFromBitmap(puffer, { width: s.width, height: s.height });
    }
    bilder.push({
      index: i,
      haupt: i === 0,
      breite: s.width,
      hoehe: s.height,
      geschwaerzt: bereiche.length,
      jpeg: bild.toJPEG(80).toString('base64'),
    });
  }
  letzterScreenshot = Date.now();
  return bilder;
}

function aufPhysisch(index, x, y) {
  const m = letzte.get(index);
  if (!m) throw new Error(`Von Monitor ${index} gibt es noch keinen Screenshot.`);
  if (x < 0 || y < 0 || x > m.breite || y > m.hoehe) {
    throw new Error(`Koordinate (${x}, ${y}) liegt außerhalb des Bildes von Monitor ${index} (${m.breite}x${m.hoehe}).`);
  }
  return {
    x: Math.round(m.phys.x + (x * m.phys.width) / m.breite),
    y: Math.round(m.phys.y + (y * m.phys.height) / m.hoehe),
  };
}

function monitorUnterMaus() {
  const d = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  return Math.max(0, monitore().findIndex((m) => m.id === d.id));
}

function zeitLetzterScreenshot() {
  return letzterScreenshot;
}

module.exports = { monitore, beschreibung, aufnehmen, aufPhysisch, monitorUnterMaus, zeitLetzterScreenshot };
