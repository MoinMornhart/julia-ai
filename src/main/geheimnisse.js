'use strict';

const fs = require('fs');
const path = require('path');
const { jsonLesen } = require('./hilfen');
const { istToken } = require('./token-erkennung');

// Nutzer-verwaltete Geheimnisse (Passwörter, API-Schlüssel, Zugangsdaten) – Issue
// #26/#21. Die Werte liegen NUR verschlüsselt auf der Platte (Windows DPAPI über
// Electrons safeStorage, dieselbe Krypto wie der Konten-Tresor). Bewusst getrennt
// von den Konten-Tokens und in einer eigenen Datei. Die KI bekommt hier KEINEN
// Lesezugriff (kein Werkzeug liest Geheimnisse), damit ein vergifteter Chat sie
// nicht abgreifen kann.
class Geheimnisse {
  // krypto: { verschluesseln(text)->base64, entschluesseln(base64)->text }
  constructor(ordner, krypto) {
    this.datei = path.join(ordner, 'geheimnisse.json');
    this.krypto = krypto;
  }

  _laden() {
    try {
      return jsonLesen(fs.readFileSync(this.datei, 'utf8'));
    } catch (e) {
      if (e.code === 'ENOENT') return {};
      throw new Error(`geheimnisse.json ist nicht lesbar: ${e.message}`);
    }
  }

  _speichern(daten) {
    fs.mkdirSync(path.dirname(this.datei), { recursive: true });
    const tmp = `${this.datei}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(daten, null, 2), 'utf8');
    fs.renameSync(tmp, this.datei);
  }

  // Nur die Namen (nie die Werte) – für die Anzeige in den Einstellungen.
  namen() {
    return Object.keys(this._laden()).sort((a, b) => a.localeCompare(b));
  }

  // Anlegen oder überschreiben. Gibt den (gesäuberten) Namen zurück.
  setzen(name, wert) {
    const n = String(name == null ? '' : name).trim().slice(0, 80);
    if (!n) throw new Error('Der Name darf nicht leer sein.');
    // Der Name ist sichtbar (auch die KI könnte ihn sehen); ein echter Token darf
    // deshalb nicht als Name landen. Der Wert gehört ins Wert-Feld (Issue #51).
    if (istToken(n)) throw new Error('Das sieht wie ein echter Schlüssel/Token aus. Im Namen bitte nur eine Bezeichnung (z. B. „GitHub"), den Wert selbst trägst du ins Wert-Feld ein.');
    const daten = this._laden();
    daten[n] = this.krypto.verschluesseln(String(wert == null ? '' : wert));
    this._speichern(daten);
    return n;
  }

  // Entschlüsselten Wert holen – nur intern/für den Nutzer, nie für die KI.
  holen(name) {
    const v = this._laden()[String(name == null ? '' : name).trim()];
    if (!v) return null;
    try { return this.krypto.entschluesseln(v); } catch { return null; }
  }

  loeschen(name) {
    const daten = this._laden();
    const n = String(name == null ? '' : name).trim();
    if (!(n in daten)) return false;
    delete daten[n];
    this._speichern(daten);
    return true;
  }
}

module.exports = { Geheimnisse };
