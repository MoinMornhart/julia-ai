'use strict';

const { Tresor } = require('./tresor');
const { GoogleKonto } = require('./google');
const { OutlookKonto } = require('./outlook');
const googleWerkzeuge = require('./google-werkzeuge');
const outlookWerkzeuge = require('./outlook-werkzeuge');

// Alle verbundenen Konten an einer Stelle. Werkzeuge eines Kontos gibt es
// für Julia nur, solange das Konto verbunden ist.

class Konten {
  constructor({ ordner, krypto, oeffnen, abruf }) {
    this.tresor = new Tresor(ordner, krypto);
    this.google = new GoogleKonto({ tresor: this.tresor, oeffnen, abruf });
    this.outlook = new OutlookKonto({ tresor: this.tresor, oeffnen, abruf });
  }

  status() {
    return { google: this.google.status(), outlook: this.outlook.status() };
  }

  werkzeuge() {
    return [
      ...(this.google.verbunden ? googleWerkzeuge.WERKZEUGE : []),
      ...(this.outlook.verbunden ? outlookWerkzeuge.WERKZEUGE : []),
    ];
  }

  // Für den Laufzeitblock im Prompt: welche Konten Julia gerade nutzen kann.
  beschreibung() {
    const out = [];
    const g = this.google.status();
    if (g.verbunden) out.push({ dienst: 'Google (Gmail, Kalender, Kontakte)', konto: g.email || '' });
    const o = this.outlook.status();
    if (o.verbunden) out.push({ dienst: 'Outlook (Mail, Kalender, Kontakte – Werkzeuge outlook_*)', konto: o.email || '' });
    return out;
  }
}

module.exports = { Konten };
