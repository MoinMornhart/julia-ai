'use strict';

// Passwortfelder im Screenshot schwärzen, bevor das Bild den PC verlässt
// (Abschnitt 10: Passwortfelder werden nicht beschrieben und nicht ausgewertet).
// Reine Funktionen auf Rohpixeln, damit sie ohne Electron testbar sind.

// Rechtecke in physischen Bildschirmpixeln → Bereiche im (verkleinerten) Bild
// eines Monitors. Mit etwas Rand, damit auch Ränder und Rahmen verschwinden.
function aufBild(rechtecke, phys, breite, hoehe, rand = 3) {
  const fx = breite / phys.width;
  const fy = hoehe / phys.height;
  return (rechtecke || [])
    .map((r) => ({
      x0: Math.floor((r.x - phys.x) * fx) - rand,
      y0: Math.floor((r.y - phys.y) * fy) - rand,
      x1: Math.ceil((r.x + r.w - phys.x) * fx) + rand,
      y1: Math.ceil((r.y + r.h - phys.y) * fy) + rand,
    }))
    .filter((b) => b.x1 > 0 && b.y1 > 0 && b.x0 < breite && b.y0 < hoehe)
    .map((b) => ({
      x0: Math.max(0, b.x0),
      y0: Math.max(0, b.y0),
      x1: Math.min(breite, b.x1),
      y1: Math.min(hoehe, b.y1),
    }));
}

// Füllt Bereiche in einem BGRA-Puffer. Diagonale Streifen statt glatter
// Fläche, damit im Bild klar erkennbar ist, dass hier absichtlich etwas fehlt.
function fuellen(puffer, breite, bereiche) {
  for (const b of bereiche) {
    for (let y = b.y0; y < b.y1; y++) {
      for (let x = b.x0; x < b.x1; x++) {
        const i = (y * breite + x) * 4;
        const streifen = ((x + y) >> 3) & 1;
        const wert = streifen ? 38 : 22;
        puffer[i] = wert;
        puffer[i + 1] = wert;
        puffer[i + 2] = wert;
        puffer[i + 3] = 255;
      }
    }
  }
  return puffer;
}

module.exports = { aufBild, fuellen };
