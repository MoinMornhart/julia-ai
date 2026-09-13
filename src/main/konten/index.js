'use strict';

const { Tresor } = require('./tresor');
const { GoogleKonto } = require('./google');
const googleWerkzeuge = require('./google-werkzeuge');

// Alle verbundenen Konten an einer Stelle. Werkzeuge eines Kontos gibt es
// für Julia nur, solange das Konto verbunden ist.

class Konten {
  constructor({ ordner, krypto, oeffnen, abruf }) {
    this.tresor = new Tresor(ordner, krypto);
    this.google = new GoogleKonto({ tresor: this.tresor, oeffnen, abruf });
  }

  status() {
    return { google: this.google.status() };
  }

  werkzeuge() {
    return this.google.verbunden ? googleWerkzeuge.WERKZEUGE : [];
  }

  // Für den Laufzeitblock im Prompt: welche Konten Julia gerade nutzen kann.
  beschreibung() {
    const g = this.google.status();
    return g.verbunden ? [{ dienst: 'Google (Gmail, Kalender, Kontakte)', konto: g.email || '' }] : [];
  }
}

module.exports = { Konten };
