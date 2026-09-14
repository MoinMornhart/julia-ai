'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Gesprächsverlauf: jedes Gespräch eine eigene Datei im Datenordner, mit
// Windows (DPAPI) verschlüsselt. Die Suche entschlüsselt nur lokal im
// Speicher – nichts verlässt den PC. Screenshots und Bilder werden nie
// gespeichert, nur ein Platzhalter.

const MAX_GESPRAECHE = 500;
const ENDUNG = '.julia';

function ohneBilder(verlauf) {
  const ersetzen = (b) => (b && b.type === 'image' ? { type: 'text', text: '[Bild nicht gespeichert]' } : b);
  return (verlauf || []).map((m) => {
    if (!Array.isArray(m.content)) return m;
    return {
      ...m,
      content: m.content.map((b) => (b && b.type === 'tool_result' && Array.isArray(b.content) ? { ...b, content: b.content.map(ersetzen) } : ersetzen(b))),
    };
  });
}

function titelAus(text) {
  const z = String(text || '').split('\n').map((s) => s.trim()).find(Boolean) || '';
  return z.length > 70 ? `${z.slice(0, 69)}…` : z;
}

// Für die Vorschau in der Liste: ohne Markdown-Zeichen.
const schlicht = (s) => String(s || '').replace(/[*`#>_~]+/g, '').replace(/\s+/g, ' ').trim();

function textVon(g) {
  return [g.titel, ...(g.anzeige || []).filter((e) => e.typ === 'nutzer' || e.typ === 'julia').map((e) => e.text)].join('\n');
}

function ausschnitt(text, suche) {
  const i = text.toLowerCase().indexOf(suche.toLowerCase());
  if (i < 0) return '';
  const von = Math.max(0, i - 40);
  const s = text.slice(von, i + suche.length + 60).replace(/\s+/g, ' ').trim();
  return `${von > 0 ? '…' : ''}${s}…`;
}

class Gespraeche {
  // krypto: { verschluesseln(text) -> base64, entschluesseln(base64) -> text }
  constructor(ordner, krypto) {
    this.ordner = path.join(ordner, 'gespraeche');
    this.krypto = krypto;
  }

  neueId() {
    return crypto.randomBytes(8).toString('hex');
  }

  _datei(id) {
    if (!/^[a-f0-9]{16}$/.test(String(id))) throw new Error('Ungültige Gesprächs-ID.');
    return path.join(this.ordner, `${id}${ENDUNG}`);
  }

  _alleDateien() {
    let namen = [];
    try { namen = fs.readdirSync(this.ordner).filter((n) => n.endsWith(ENDUNG)); } catch { return []; }
    return namen.map((n) => {
      const p = path.join(this.ordner, n);
      let zeit = 0;
      try { zeit = fs.statSync(p).mtimeMs; } catch { /* weg */ }
      return { id: n.slice(0, -ENDUNG.length), pfad: p, zeit };
    }).sort((a, b) => b.zeit - a.zeit);
  }

  lesen(id) {
    try {
      return JSON.parse(this.krypto.entschluesseln(fs.readFileSync(this._datei(id), 'utf8')));
    } catch {
      return null;
    }
  }

  // Speichert nur Gespräche, in denen der Nutzer etwas gesagt hat.
  // zeit: nur für Vorführung und Tests, sonst "jetzt".
  speichern({ id, anzeige, verlauf, anbieter = '', modell = '', sitzung = null, zeit = null }) {
    const erste = (anzeige || []).find((e) => e.typ === 'nutzer');
    if (!erste) return null;
    const alt = this.lesen(id);
    const jetzt = zeit || Date.now();
    const g = {
      id,
      titel: titelAus(erste.text),
      erstellt: alt ? alt.erstellt : jetzt,
      geaendert: jetzt,
      anbieter,
      modell,
      sitzung,
      anzeige: anzeige.map((e) => ({ ...e, offen: e.typ === 'julia' ? false : e.offen })),
      verlauf: ohneBilder(verlauf),
    };
    fs.mkdirSync(this.ordner, { recursive: true });
    const ziel = this._datei(id);
    fs.writeFileSync(`${ziel}.tmp`, this.krypto.verschluesseln(JSON.stringify(g)), 'utf8');
    fs.renameSync(`${ziel}.tmp`, ziel);
    if (zeit) fs.utimesSync(ziel, new Date(zeit), new Date(zeit));
    this._aufraeumen();
    return g;
  }

  liste({ suche = '' } = {}) {
    const s = String(suche || '').trim();
    const out = [];
    for (const d of this._alleDateien()) {
      const g = this.lesen(d.id);
      if (!g) continue;
      const text = textVon(g);
      if (s && !text.toLowerCase().includes(s.toLowerCase())) continue;
      const antwort = (g.anzeige || []).find((e) => e.typ === 'julia');
      out.push({
        id: g.id,
        titel: g.titel,
        geaendert: g.geaendert,
        anzahl: (g.anzeige || []).filter((e) => e.typ === 'nutzer').length,
        vorschau: schlicht(s ? ausschnitt(text, s) : (antwort ? antwort.text : '')).slice(0, 110),
      });
    }
    return out;
  }

  loeschen(id) {
    try { fs.unlinkSync(this._datei(id)); return true; } catch { return false; }
  }

  // --- Für den Geräte-Abgleich ---

  // Nur Dateien mit Änderungszeit, ohne zu entschlüsseln.
  dateiListe() {
    return this._alleDateien().map((d) => ({ id: d.id, zeit: d.zeit }));
  }

  dateiZeit(id) {
    try { return fs.statSync(this._datei(id)).mtimeMs; } catch { return null; }
  }

  // Ein Gespräch von einem gekoppelten Gerät übernehmen. Die Sitzung von
  // Claude Code gehört zum anderen Gerät und bleibt dort.
  uebernehmen(g) {
    if (!g || !Array.isArray(g.anzeige) || !Array.isArray(g.verlauf)) return false;
    const ziel = this._datei(g.id);
    const geaendert = Number(g.geaendert) || Date.now();
    const sauber = {
      id: g.id,
      titel: String(g.titel || '').slice(0, 200),
      erstellt: Number(g.erstellt) || geaendert,
      geaendert,
      anbieter: String(g.anbieter || ''),
      modell: String(g.modell || ''),
      sitzung: null,
      anzeige: g.anzeige,
      verlauf: ohneBilder(g.verlauf),
    };
    fs.mkdirSync(this.ordner, { recursive: true });
    fs.writeFileSync(`${ziel}.tmp`, this.krypto.verschluesseln(JSON.stringify(sauber)), 'utf8');
    fs.renameSync(`${ziel}.tmp`, ziel);
    fs.utimesSync(ziel, new Date(geaendert), new Date(geaendert)); // im Verlauf an seinem Platz
    this._aufraeumen();
    return true;
  }

  alleLoeschen() {
    for (const d of this._alleDateien()) { try { fs.unlinkSync(d.pfad); } catch { /* egal */ } }
  }

  _aufraeumen() {
    const alle = this._alleDateien();
    for (const d of alle.slice(MAX_GESPRAECHE)) { try { fs.unlinkSync(d.pfad); } catch { /* egal */ } }
  }
}

module.exports = { Gespraeche, ohneBilder, titelAus, MAX_GESPRAECHE };
