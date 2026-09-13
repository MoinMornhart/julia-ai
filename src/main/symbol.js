'use strict';

const { nativeImage } = require('electron');

// Julias Symbol: eine kleine Kugel im Verlauf von Violett zu Aquamarin, im
// Code gezeichnet, damit das Repo ohne Binärdateien auskommt.

const VIOLETT = [0x6b, 0x5c, 0xff];
const AQUA = [0x35, 0xe0, 0xc8];
const ROSE = [0xff, 0x6f, 0x9c];

function mischen(a, b, t) {
  return a.map((v, i) => v + (b[i] - v) * t);
}

function bitmap(n) {
  const puffer = Buffer.alloc(n * n * 4);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const dx = ((x + 0.5) / n) * 2 - 1;
      const dy = ((y + 0.5) / n) * 2 - 1;
      const r = Math.hypot(dx, dy);
      const kante = Math.max(0, Math.min(1, (1 - r) * n * 0.5));
      if (kante <= 0) continue;
      let farbe = mischen(VIOLETT, AQUA, Math.max(0, Math.min(1, (dx - dy + 1.4) / 2.8)));
      const rosa = Math.max(0, 1 - Math.hypot(dx - 0.45, dy - 0.5) * 1.6);
      farbe = mischen(farbe, ROSE, rosa * 0.55);
      const licht = Math.max(0, 1 - Math.hypot(dx + 0.38, dy + 0.42) * 2.2) * 0.45;
      farbe = mischen(farbe, [255, 255, 255], licht);
      const a = kante;
      const i = (y * n + x) * 4;
      puffer[i] = Math.round(farbe[2] * a);
      puffer[i + 1] = Math.round(farbe[1] * a);
      puffer[i + 2] = Math.round(farbe[0] * a);
      puffer[i + 3] = Math.round(255 * a);
    }
  }
  return nativeImage.createFromBitmap(puffer, { width: n, height: n });
}

function png(n) {
  return bitmap(n).toPNG();
}

function trayBild() {
  const bild = nativeImage.createFromBuffer(png(16), { scaleFactor: 1 });
  bild.addRepresentation({ scaleFactor: 1.5, buffer: png(24) });
  bild.addRepresentation({ scaleFactor: 2, buffer: png(32) });
  return bild;
}

let fensterCache = null;
function fensterBild() {
  if (!fensterCache) fensterCache = nativeImage.createFromBuffer(png(256));
  return fensterCache;
}

module.exports = { trayBild, fensterBild, png };
