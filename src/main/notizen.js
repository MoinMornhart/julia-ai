'use strict';

const fs = require('fs');
const path = require('path');

// Lern-Notizen für Julia (Issues #26/#27): Julia legt in ihrem zugewiesenen
// Arbeitsordner einen **versteckten** Unterordner (führender Punkt) an und hält
// dort dauerhaft Memos/wichtige Dinge als einzelne Textdateien fest. So „lernt"
// sie über die Zeit im jeweiligen Projekt, ohne dass die Notizen im Ordner
// auffallen. Anders als das globale Gedächtnis (App-Ordner) sind diese Notizen
// projektbezogen und liegen beim Projekt.
//
// Sicherheit: Der Name wird zu einem harmlosen Dateinamen gesäubert – keine
// Pfad-Trickser (.., Schrägstriche), damit nie außerhalb des Notiz-Ordners
// geschrieben wird.

const ORDNER_NAME = '.julia-memos';

function sichererName(name) {
  let s = String(name == null ? '' : name).trim().toLowerCase();
  s = s.replace(/[\\/]/g, '-');            // keine Ordnerwechsel
  s = s.replace(/\.+/g, '.');              // keine .. Ketten
  s = s.replace(/[^a-z0-9äöüß._-]+/g, '-'); // nur harmlose Zeichen
  s = s.replace(/^[.-]+/, '').replace(/[.-]+$/, ''); // nicht mit . oder - beginnen/enden
  s = s.slice(0, 60);
  return s || 'notiz';
}

class Notizen {
  constructor({ ordner } = {}) {
    // `ordner` ist bereits der versteckte Memo-Ordner (…/.julia-memos).
    this.ordner = ordner;
  }

  _pfad(name) {
    return path.join(this.ordner, `${sichererName(name)}.md`);
  }

  // Eine Notiz anlegen oder ergänzen. anhaengen=true hängt unten an, sonst
  // überschreibt es. Gibt den gesäuberten Namen zurück.
  schreiben(name, text, { anhaengen = false } = {}) {
    const sName = sichererName(name);
    const datei = path.join(this.ordner, `${sName}.md`);
    fs.mkdirSync(this.ordner, { recursive: true });
    const inhalt = String(text == null ? '' : text);
    if (anhaengen && fs.existsSync(datei)) fs.appendFileSync(datei, `\n${inhalt}`, 'utf8');
    else fs.writeFileSync(datei, inhalt, 'utf8');
    return sName;
  }

  lesen(name) {
    try { return fs.readFileSync(this._pfad(name), 'utf8'); } catch { return null; }
  }

  liste() {
    try {
      return fs.readdirSync(this.ordner)
        .filter((n) => n.endsWith('.md'))
        .map((n) => {
          const st = fs.statSync(path.join(this.ordner, n));
          return { name: n.replace(/\.md$/, ''), groesse: st.size, geaendert: st.mtime.toISOString() };
        })
        .sort((a, b) => (a.geaendert < b.geaendert ? 1 : -1)); // neueste zuerst
    } catch { return []; }
  }

  loeschen(name) {
    try { fs.unlinkSync(this._pfad(name)); return true; } catch { return false; }
  }
}

module.exports = { Notizen, sichererName, ORDNER_NAME };
