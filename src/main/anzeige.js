'use strict';

// Kompakte Darstellung eines Gesprächs – Nachrichten, Werkzeugschritte,
// Freigaben, Hinweise. Daraus zeichnen die Handy-Seite und der Verlauf.
// Textstücke der Antwort werden zu einer Nachricht zusammengefügt.

const MAX = 400;

function anwenden(v, art, d = {}, max = MAX) {
  const offen = () => { const l = v[v.length - 1]; return l && l.typ === 'julia' && l.offen ? l : null; };
  const schliessen = () => { const l = offen(); if (l) l.offen = false; };
  switch (art) {
    case 'nutzer':
      schliessen();
      v.push({ typ: 'nutzer', text: String(d.text || ''), handy: !!d.handy });
      break;
    case 'text': {
      const l = offen();
      if (l) l.text += String(d.text || '');
      else v.push({ typ: 'julia', text: String(d.text || ''), offen: true });
      break;
    }
    case 'werkzeug':
      schliessen();
      v.push({ typ: 'werkzeug', id: d.id, name: String(d.name || ''), eingabe: d.eingabe === '{}' ? '' : String(d.eingabe || '').slice(0, 160), stand: 'laeuft' });
      break;
    case 'werkzeugFertig': {
      const w = v.find((x) => x.typ === 'werkzeug' && x.id === d.id);
      if (w) w.stand = d.ok ? 'ok' : d.rot ? 'rot' : 'fehler';
      break;
    }
    case 'freigabe':
      schliessen();
      v.push({
        typ: 'freigabe', id: d.id, art: d.art, beschreibung: String(d.beschreibung || ''), grund: String(d.grund || ''),
        schritte: Array.isArray(d.schritte) ? d.schritte.map(String) : [], offen: true,
      });
      break;
    case 'freigabeErledigt': {
      const f = v.find((x) => x.typ === 'freigabe' && x.id === d.id);
      if (f) { f.offen = false; f.ja = !!d.ja; }
      break;
    }
    case 'fertig':
      schliessen();
      for (const w of v) if (w.typ === 'werkzeug' && w.stand === 'laeuft') w.stand = 'fehler';
      break;
    case 'system':
      schliessen();
      v.push({ typ: 'system', text: String(d.text || ''), fehler: !!d.fehler });
      break;
    case 'geleert':
      v.length = 0;
      break;
    default:
      break;
  }
  if (v.length > max) v.splice(0, v.length - max);
}

module.exports = { anwenden, MAX };
