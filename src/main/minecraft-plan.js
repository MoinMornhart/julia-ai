'use strict';

// Der „durchspielen“-Fahrplan: der Tech-Baum von Minecraft (Java) als geordnete
// Etappen vom ersten Holz bis zum Enderdrachen. Damit versteht Julia, wo sie im
// Spiel steht und was als Nächstes dran ist – die Grundlage, um selbstständig zu
// spielen und aus jedem Durchlauf zu lernen.
//
// Jede Etappe prüft sich an einem normalisierten Zustand z:
//   { items: { name: anzahl, … }, dimension: 'overworld'|'nether'|'end', dracheBesiegt: bool }
// Die Prüfungen schauen nur nach dem, was Julia schon selbst kann (abbauen,
// craften, schmelzen, jagen, bauen) – kein Etappenziel verlangt etwas, wofür ihr
// die Fähigkeit fehlt.

// Hat der Zustand einen Gegenstand, dessen Name das Muster enthält?
function hat(z, muster, anzahl = 1) {
  const items = (z && z.items) || {};
  let summe = 0;
  for (const [name, n] of Object.entries(items)) {
    if (typeof muster === 'string' ? name.includes(muster) : muster.test(name)) summe += n;
  }
  return summe >= anzahl;
}

const SPIELPLAN = [
  { id: 'holz', name: 'Holz sammeln', ziel: 'Ein paar Baumstämme abbauen.', hinweis: 'Bäume abbauen (mindestens 4 Stämme).', pruef: (z) => hat(z, /_log$|_stem$/, 1) },
  { id: 'werkbank', name: 'Werkbank', ziel: 'Bretter und eine Werkbank herstellen.', hinweis: 'Stämme zu Brettern, daraus eine Werkbank craften.', pruef: (z) => hat(z, 'crafting_table') },
  { id: 'holzwerkzeug', name: 'Holzwerkzeug', ziel: 'Holzspitzhacke und -schwert.', hinweis: 'Stöcke craften, dann Holzspitzhacke und Holzschwert.', pruef: (z) => hat(z, 'wooden_pickaxe') },
  { id: 'stein', name: 'Stein abbauen', ziel: 'Bruchstein sammeln.', hinweis: 'Mit der Holzspitzhacke Stein abbauen (mind. 11 Bruchstein).', pruef: (z) => hat(z, 'cobblestone', 3) },
  { id: 'steinwerkzeug', name: 'Steinwerkzeug', ziel: 'Steinspitzhacke, -schwert, -axt.', hinweis: 'Aus Bruchstein Steinwerkzeug herstellen.', pruef: (z) => hat(z, 'stone_pickaxe') },
  { id: 'ofen', name: 'Ofen', ziel: 'Einen Ofen bauen.', hinweis: 'Aus 8 Bruchstein einen Ofen craften.', pruef: (z) => hat(z, 'furnace') },
  { id: 'kohle', name: 'Kohle & Fackeln', ziel: 'Kohle abbauen und Fackeln machen.', hinweis: 'Kohleerz abbauen, mit Stöcken Fackeln craften.', pruef: (z) => hat(z, 'torch', 4) || hat(z, 'coal', 4) },
  { id: 'essen', name: 'Essen sichern', ziel: 'Nahrung besorgen und braten.', hinweis: 'Tiere jagen und das Fleisch im Ofen braten.', pruef: (z) => hat(z, /^cooked_|^bread$|^cooked_beef|^cooked_porkchop|^cooked_chicken|^cooked_mutton/, 3) },
  { id: 'eisen_erz', name: 'Eisen finden', ziel: 'Eisenerz abbauen.', hinweis: 'Tiefer graben und Eisenerz mit der Steinspitzhacke abbauen.', pruef: (z) => hat(z, 'raw_iron', 3) || hat(z, 'iron_ore', 3) || hat(z, 'iron_ingot', 3) },
  { id: 'eisen', name: 'Eisen verhütten', ziel: 'Eisenbarren im Ofen.', hinweis: 'Rohes Eisen im Ofen zu Barren schmelzen.', pruef: (z) => hat(z, 'iron_ingot', 3) },
  { id: 'eisenwerkzeug', name: 'Eisenwerkzeug', ziel: 'Eisenspitzhacke & -schwert.', hinweis: 'Aus Eisenbarren Werkzeug und Schwert craften.', pruef: (z) => hat(z, 'iron_pickaxe') },
  { id: 'ruestung', name: 'Rüstung', ziel: 'Etwas Eisenrüstung.', hinweis: 'Eisenbarren zu Rüstung verarbeiten und anlegen.', pruef: (z) => hat(z, /^iron_(helmet|chestplate|leggings|boots)$/) },
  { id: 'diamant', name: 'Diamanten', ziel: 'Diamanten abbauen.', hinweis: 'Auf Höhe -59 bis -54 mit der Eisenspitzhacke nach Diamant suchen.', pruef: (z) => hat(z, 'diamond', 2) || hat(z, /^diamond_/) },
  { id: 'diamantwerkzeug', name: 'Diamantwerkzeug', ziel: 'Diamantspitzhacke & -schwert.', hinweis: 'Aus Diamanten Spitzhacke und Schwert craften.', pruef: (z) => hat(z, 'diamond_pickaxe') },
  { id: 'obsidian', name: 'Obsidian', ziel: '10 Obsidian für ein Portal.', hinweis: 'Wasser auf Lavaquellen leiten und Obsidian mit der Diamantspitzhacke abbauen.', pruef: (z) => hat(z, 'obsidian', 10) },
  { id: 'nether_portal', name: 'Nether-Portal', ziel: 'Ein Portal bauen und zünden.', hinweis: 'Aus Obsidian einen Rahmen bauen und mit Feuerzeug entzünden.', pruef: (z) => hat(z, 'flint_and_steel') && hat(z, 'obsidian', 10) },
  { id: 'nether', name: 'In den Nether', ziel: 'Den Nether betreten.', hinweis: 'Durch das Portal gehen.', pruef: (z) => z && z.dimension === 'nether' },
  { id: 'blaze', name: 'Lohenruten', ziel: 'Lohenruten aus einer Festung.', hinweis: 'Eine Nether-Festung finden und Lohen (Blazes) besiegen.', pruef: (z) => hat(z, 'blaze_rod', 2) || hat(z, 'blaze_powder', 2) },
  { id: 'perlen', name: 'Enderperlen', ziel: 'Enderperlen sammeln.', hinweis: 'Endermen besiegen (oder mit Piglins handeln) für Enderperlen.', pruef: (z) => hat(z, 'ender_pearl', 2) },
  { id: 'augen', name: 'Enderaugen', ziel: 'Enderaugen herstellen.', hinweis: 'Lohenstaub und Enderperlen zu Enderaugen craften (Ziel: 12).', pruef: (z) => hat(z, 'ender_eye', 1) },
  { id: 'festung', name: 'Festung & End-Portal', ziel: 'Das End-Portal finden und füllen.', hinweis: 'Mit Enderaugen die Festung finden und den Portalrahmen vervollständigen.', pruef: (z) => z && z.dimension === 'end' },
  { id: 'drache', name: 'Enderdrache', ziel: 'Den Enderdrachen besiegen.', hinweis: 'Die End-Kristalle zerstören und den Drachen bezwingen.', pruef: (z) => !!(z && z.dracheBesiegt) },
];

// Wo steht Julia? Der Fortschritt ist monoton: eine spätere Etappe zieht die
// früheren mit (wer Eisen hat, hatte auch Holz; wer im End ist, war im Nether).
// Das ist auch nötig, weil dimensionsabhängige Etappen (Nether/End) nur im Moment
// selbst „wahr“ sind. Erreicht ist alles bis zur höchsten erfüllten Etappe;
// die aktuelle ist die erste offene danach.
function fortschritt(z) {
  let maxIdx = -1;
  SPIELPLAN.forEach((etappe, i) => { if (etappe.pruef(z)) maxIdx = i; });
  const erreicht = SPIELPLAN.slice(0, maxIdx + 1).map((e) => e.id);
  const aktuell = SPIELPLAN[maxIdx + 1] || null;
  const prozent = Math.round((erreicht.length / SPIELPLAN.length) * 100);
  return {
    erreicht,
    aktuell: aktuell ? { id: aktuell.id, name: aktuell.name, ziel: aktuell.ziel, hinweis: aktuell.hinweis } : null,
    fertig: !aktuell,
    prozent,
    gesamt: SPIELPLAN.length,
  };
}

// Kurzer Text für Chat/Logbuch: „Etappe 9/22: Eisen finden – …“.
function fortschrittText(z) {
  const f = fortschritt(z);
  if (f.fertig) return 'Alles geschafft – der Enderdrache ist besiegt. 🐉';
  return `Etappe ${f.erreicht.length + 1}/${f.gesamt} (${f.prozent}%): ${f.aktuell.name} – ${f.aktuell.hinweis}`;
}

module.exports = { SPIELPLAN, fortschritt, fortschrittText, hat };
