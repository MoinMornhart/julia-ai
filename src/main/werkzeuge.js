'use strict';

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const { clipboard, shell } = require('electron');
const ampel = require('./ampel');
const win = require('./win/win');
const bildschirm = require('./bildschirm');

// Julias Werkzeuge. Jedes Werkzeug stuft sich selbst in die Ampel ein
// (einstufen) und führt dann aus (ausfuehren). Die Freigabe dazwischen holt
// der Agent.

const { GRUEN, GELB, ROT } = ampel;
const MAX_LESEN = 200 * 1024;
const MAX_AUSGABE = 30000;
const BILDTYPEN = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' };
const TERMINALS = /^(cmd|powershell|pwsh|windowsterminal|wt|conhost|openconsole|mintty|bash|wsl)$/i;

// Wird jede UI-Aktion verbucht; die nächste braucht einen neueren Screenshot.
let letzteUiAktion = 0;

function gruen() { return { stufe: GRUEN, kategorie: null, grund: '' }; }

function kurz(text, max = MAX_AUSGABE) {
  const s = String(text ?? '');
  return s.length > max ? s.slice(0, max) + `\n… [${s.length - max} Zeichen gekürzt]` : s;
}

// Einheitlich über hilfen.fremd – dort werden auch unsichtbare Zeichen entfernt.
function fremd(quelle, text) {
  return require('./hilfen').fremd(quelle, text);
}

// Mark-of-the-Web: Zone aus dem Zone.Identifier-Datenstrom (NTFS), sonst null.
function zoneLesen(pfad) {
  try {
    const m = /ZoneId\s*=\s*(\d)/.exec(fs.readFileSync(`${pfad}:Zone.Identifier`, 'utf8'));
    return m ? Number(m[1]) : null;
  } catch {
    return null;
  }
}

// Jeder Screenshot geht hier durch: Passwortfelder im Vordergrundfenster werden
// vorher gesucht und im Bild geschwärzt. Scheitert die Suche, bleibt das Bild
// ungeschwärzt – die Regel aus Abschnitt 10 gilt dann weiter über den Prompt.
async function aufnahme(monitor) {
  // Suche und Aufnahme laufen gleichzeitig; geschwärzt wird, bevor das Bild rausgeht.
  const felder = win.passwortFelder().catch(() => []);
  return bildschirm.aufnehmen(monitor, { rechtecke: felder });
}

function bildBloecke(bilder, einleitung) {
  const bloecke = [{ type: 'text', text: einleitung }];
  for (const b of bilder) {
    const schwarz = b.geschwaerzt ? ` ${b.geschwaerzt} Bereich(e) mit Passwörtern oder privaten Inhalten sind geschwärzt (gestreift) – nicht darauf eingehen.` : '';
    bloecke.push({ type: 'text', text: `Monitor ${b.index}${b.haupt ? ' (Hauptmonitor)' : ''}: Bild ${b.breite}x${b.hoehe} Pixel. klick-Koordinaten beziehen sich auf dieses Bild.${schwarz}` });
    bloecke.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b.jpeg } });
  }
  return bloecke;
}

function uiPruefen() {
  if (bildschirm.zeitLetzterScreenshot() <= letzteUiAktion) {
    throw new Error('Nie blind klicken: Seit der letzten Aktion gibt es keinen neuen Screenshot. Erst screenshot() aufrufen.');
  }
}

const kurzWarten = (ms) => new Promise((r) => setTimeout(r, ms));

async function nachAktion(monitor, was) {
  letzteUiAktion = Date.now();
  await kurzWarten(300); // dem Fenster kurz Zeit geben, sichtbar zu reagieren
  const bilder = await aufnahme(monitor);
  return bildBloecke(bilder, `${was}. Screenshot danach:`);
}

// Die eigentlichen Handgriffe – einzeln (mit Screenshot danach) oder
// gebündelt über das Werkzeug aktionen. Jeder gibt den Monitor zurück, auf
// dem er gewirkt hat.
async function klickTun(e) {
  const m = e.monitor ?? 0;
  const p = bildschirm.aufPhysisch(m, e.x, e.y);
  await win.klick(p.x, p.y, e.taste || 'links', !!e.doppelt);
  return m;
}

async function scrollenTun(e) {
  const m = e.monitor ?? 0;
  const p = bildschirm.aufPhysisch(m, e.x, e.y);
  await win.scrollen(p.x, p.y, Math.max(-50, Math.min(50, Number(e.schritte) || 0)));
  return m;
}

async function tippenTun(e) {
  const text = String(e.text ?? '');
  if (ampel.enthaeltZahlungsdaten(text)) throw new Error('ROT: Karten- oder Kontodaten werden nie eingetippt.');
  const v = await win.vordergrund();
  if (TERMINALS.test(v.programm || '') || (v.klasse === '#32770' && /^(Ausführen|Run)$/i.test(v.titel || ''))) {
    throw new Error(`Im Vordergrund ist ${v.programm || v.titel}. In Terminals und den Ausführen-Dialog tippe ich nicht, dafür gibt es das Werkzeug shell, damit die Ampel greift.`);
  }
  const r = await win.tippen(text);
  if (r && r.passwortfeld) throw new Error('ROT: Der Fokus liegt in einem Passwortfeld. Dort tippe ich nichts ein.');
  return bildschirm.monitorUnterMaus();
}

async function tasteTun(e) {
  win.vkCodes(e.kombination);
  await win.taste(e.kombination);
  return bildschirm.monitorUnterMaus();
}

function tippenEinstufen(text) {
  if (ampel.enthaeltZahlungsdaten(text)) return { stufe: ROT, kategorie: null, grund: 'Karten- oder Kontodaten werden nie eingetippt' };
  return gruen();
}

function tasteEinstufen(kombination) {
  const k = String(kombination || '').toLowerCase().replace(/\s+/g, '');
  if (/^(win|windows|meta)\+r$/.test(k)) return { stufe: GELB, kategorie: 'shell', grund: 'Ausführen-Dialog öffnen' };
  if (/^(win|windows|meta)\+l$/.test(k)) return { stufe: GELB, kategorie: 'system', grund: 'Bildschirm sperren' };
  return gruen();
}

const MAX_SCHRITTE = 12;

// voll: für Freigaben immer der vollständige Text, sonst kurz fürs Ergebnis.
function schrittText(s, voll = false) {
  switch (s && s.art) {
    case 'klick': return `${s.doppelt ? 'Doppelklick' : 'Klick'} (${s.x}, ${s.y})${s.monitor ? ` Monitor ${s.monitor}` : ''}`;
    case 'scrollen': return `Scrollen ${s.schritte} bei (${s.x}, ${s.y})`;
    case 'tippen': return voll ? `Tippen ${JSON.stringify(String(s.text ?? ''))}` : `${String(s.text ?? '').length} Zeichen getippt`;
    case 'taste': return `Taste ${s.kombination}`;
    case 'warten': return `${Number(s.ms) || 0} ms warten`;
    default: return `unbekannt (${JSON.stringify(s)})`;
  }
}

function pfadAbs(p, ctx) {
  const s = String(p || '').trim().replace(/^~(?=$|[\\/])/, os.homedir());
  if (!s) throw new Error('Pfad fehlt.');
  return path.resolve(ctx.arbeitsordner(), s);
}

function geschuetzt(ctx) {
  return [ctx.datenOrdner, ctx.appOrdner];
}

function programmOrte() {
  const e = process.env;
  return [e.ProgramFiles, e['ProgramFiles(x86)'], e.SystemRoot, e.LOCALAPPDATA && path.join(e.LOCALAPPDATA, 'Programs'), e.LOCALAPPDATA && path.join(e.LOCALAPPDATA, 'Microsoft', 'WindowsApps')].filter(Boolean);
}

async function sichern(ziel, ctx) {
  if (!fs.existsSync(ziel)) return null;
  const stempel = new Date().toISOString().replace(/[:.]/g, '-');
  const relativ = ziel.replace(/^([a-zA-Z]):/, '$1').replace(/^[\\/]+/, '');
  const kopie = path.join(ctx.datenOrdner, 'sicherungen', stempel, relativ);
  await fsp.mkdir(path.dirname(kopie), { recursive: true });
  await fsp.copyFile(ziel, kopie);
  return kopie;
}

function shellAusfuehren(befehl, ordner, timeoutS) {
  const skript = `[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)\n$ProgressPreference = 'SilentlyContinue'\n${befehl}`;
  return new Promise((resolve) => {
    const p = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(skript, 'utf16le').toString('base64')], {
      cwd: ordner,
      windowsHide: true,
    });
    let aus = '';
    let err = '';
    let abgelaufen = false;
    p.stdout.on('data', (d) => { if (aus.length < MAX_AUSGABE * 2) aus += d; });
    p.stderr.on('data', (d) => { if (err.length < MAX_AUSGABE) err += d; });
    const timer = setTimeout(() => {
      abgelaufen = true;
      spawn('taskkill', ['/pid', String(p.pid), '/T', '/F'], { windowsHide: true });
    }, timeoutS * 1000);
    p.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, aus: aus.trim(), err: err.trim(), abgelaufen });
    });
    p.on('error', (e) => {
      clearTimeout(timer);
      resolve({ code: -1, aus: '', err: e.message, abgelaufen: false });
    });
  });
}

async function ordnerLesen(wurzel, rekursiv, max = 500) {
  const zeilen = [];
  async function lauf(dir, tiefe) {
    let eintraege;
    try { eintraege = await fsp.readdir(dir, { withFileTypes: true }); } catch (e) {
      zeilen.push(`${'  '.repeat(tiefe)}[nicht lesbar: ${e.code || e.message}]`);
      return;
    }
    eintraege.sort((a, b) => (b.isDirectory() - a.isDirectory()) || a.name.localeCompare(b.name));
    for (const e of eintraege) {
      if (zeilen.length >= max) return;
      const voll = path.join(dir, e.name);
      if (e.isDirectory()) {
        zeilen.push(`${'  '.repeat(tiefe)}${e.name}\\`);
        if (rekursiv && tiefe < 3 && !/^(node_modules|\.git|__pycache__|\.venv|venv)$/.test(e.name)) await lauf(voll, tiefe + 1);
      } else {
        let info = '';
        try {
          const s = await fsp.stat(voll);
          info = `  ${formatGroesse(s.size)}  ${s.mtime.toISOString().slice(0, 16).replace('T', ' ')}`;
        } catch { /* Datei verschwunden */ }
        zeilen.push(`${'  '.repeat(tiefe)}${e.name}${info}`);
      }
    }
  }
  await lauf(wurzel, 0);
  if (zeilen.length >= max) zeilen.push(`… nach ${max} Einträgen abgeschnitten`);
  return zeilen.join('\n') || '(leer)';
}

function formatGroesse(b) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)} MB`;
  return `${(b / 1024 ** 3).toFixed(2)} GB`;
}

function zeitText(ms, ctx) {
  const en = ctx.config && ctx.config.get('sprachcode') === 'en';
  return new Date(ms).toLocaleString(en ? 'en-GB' : 'de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const EINSTELLUNG_GRUEN = /^(blase\.|sprache\.)/;
// Anbieter und Adresse bestimmen, wohin das Gespräch geht – nur mit Ja.
const EINSTELLUNG_GELB = /^(update\.|hotkey\.|autostart$|aufwand$|modell$|anbieter$|anbieter_url$|nutzer\.name$|sprachcode$|clip\.|code\.)/;

const WERKZEUGE = [
  {
    name: 'screenshot',
    fremd: true,
    description: 'Bildschirmfoto aufnehmen. Ohne monitor werden alle Monitore aufgenommen (0 = Hauptmonitor). Pflicht vor jeder Interaktion mit der Oberfläche.',
    input_schema: { type: 'object', properties: { monitor: { type: 'integer', description: 'Monitorindex, 0 = Hauptmonitor. Weglassen für alle.' } } },
    einstufen: gruen,
    async ausfuehren(e) {
      const bilder = await aufnahme(e.monitor ?? null);
      return bildBloecke(bilder, 'Aktueller Bildschirm.');
    },
  },
  {
    name: 'fenster_auflisten',
    fremd: true,
    description: 'Offene Fenster mit id, Titel, Programm, ob minimiert und welches im Vordergrund ist.',
    input_schema: { type: 'object', properties: {} },
    einstufen: gruen,
    async ausfuehren() {
      const f = await win.fensterAuflisten();
      return fremd('Fenstertiteln', JSON.stringify(f, null, 1));
    },
  },
  {
    name: 'prozesse_auflisten',
    description: 'CPU-Last, Arbeitsspeicher und die größten Prozesse.',
    input_schema: { type: 'object', properties: { anzahl: { type: 'integer', description: 'Wie viele Prozesse, Standard 15.' }, sortierung: { type: 'string', enum: ['ram', 'cpu'] } } },
    einstufen: gruen,
    async ausfuehren(e) {
      return JSON.stringify(await win.prozesse(Math.min(100, e.anzahl || 15), e.sortierung || 'ram'), null, 1);
    },
  },
  {
    name: 'system_status',
    description: 'Akku, RAM, Festplatten und Betriebszeit.',
    input_schema: { type: 'object', properties: {} },
    einstufen: gruen,
    async ausfuehren() {
      return JSON.stringify(await win.systemStatus(), null, 1);
    },
  },
  {
    name: 'datei_lesen',
    fremd: true,
    description: 'Textdatei lesen (mit Zeilennummern) oder Bild ansehen. Relative Pfade gelten ab dem ersten Arbeitsverzeichnis.',
    input_schema: {
      type: 'object',
      properties: {
        pfad: { type: 'string' },
        von_zeile: { type: 'integer', description: 'Erste Zeile, 1-basiert.' },
        bis_zeile: { type: 'integer', description: 'Letzte Zeile, einschließlich.' },
      },
      required: ['pfad'],
    },
    einstufen: gruen,
    async ausfuehren(e, ctx) {
      const p = pfadAbs(e.pfad, ctx);
      const s = await fsp.stat(p);
      if (s.isDirectory()) throw new Error(`${p} ist ein Ordner. ordner_auflisten verwenden.`);
      const typ = BILDTYPEN[path.extname(p).toLowerCase()];
      if (typ) {
        if (s.size > 5 * 1024 * 1024) throw new Error('Bild ist größer als 5 MB.');
        const daten = (await fsp.readFile(p)).toString('base64');
        return [{ type: 'text', text: `Bild ${p}` }, { type: 'image', source: { type: 'base64', media_type: typ, data: daten } }];
      }
      const fd = await fsp.open(p, 'r');
      const puffer = Buffer.alloc(Math.min(s.size, MAX_LESEN));
      await fd.read(puffer, 0, puffer.length, 0);
      await fd.close();
      if (puffer.subarray(0, 8000).includes(0)) return `${p} ist eine Binärdatei (${formatGroesse(s.size)}), kein Text.`;
      let zeilen = puffer.toString('utf8').split(/\r?\n/);
      const von = Math.max(1, e.von_zeile || 1);
      const bis = Math.min(zeilen.length, e.bis_zeile || zeilen.length);
      zeilen = zeilen.slice(von - 1, bis).map((z, i) => `${String(von + i).padStart(5)}  ${z}`);
      let text = zeilen.join('\n');
      if (s.size > MAX_LESEN) text += `\n… Datei hat ${formatGroesse(s.size)}, nur die ersten ${formatGroesse(MAX_LESEN)} gelesen. Mit von_zeile weiterlesen.`;
      return fremd(p, text);
    },
  },
  {
    name: 'ordner_auflisten',
    fremd: true,
    description: 'Inhalt eines Ordners mit Größe und Änderungsdatum. rekursiv bis drei Ebenen tief, höchstens 500 Einträge.',
    input_schema: { type: 'object', properties: { pfad: { type: 'string' }, rekursiv: { type: 'boolean' } }, required: ['pfad'] },
    einstufen: gruen,
    async ausfuehren(e, ctx) {
      const p = pfadAbs(e.pfad, ctx);
      return fremd(p, `${p}\n${await ordnerLesen(p, !!e.rekursiv)}`);
    },
  },
  {
    name: 'zwischenablage_lesen',
    fremd: true,
    description: 'Text aus der Zwischenablage lesen.',
    input_schema: { type: 'object', properties: {} },
    einstufen: gruen,
    async ausfuehren() {
      const text = clipboard.readText();
      if (text) return fremd('der Zwischenablage', kurz(text));
      if (!clipboard.readImage().isEmpty()) return 'In der Zwischenablage liegt ein Bild, kein Text.';
      return 'Die Zwischenablage ist leer.';
    },
  },
  {
    name: 'klick',
    fremd: true,
    description: 'Mausklick. x und y sind Pixel im zuletzt aufgenommenen Screenshot des angegebenen Monitors. Liefert danach automatisch einen neuen Screenshot. Für mehrere vorhersehbare Schritte am Stück (anklicken, tippen, Enter) schneller: aktionen.',
    input_schema: {
      type: 'object',
      properties: {
        x: { type: 'integer' },
        y: { type: 'integer' },
        monitor: { type: 'integer', description: 'Monitor des Screenshots, auf den sich x/y beziehen. Standard 0.' },
        taste: { type: 'string', enum: ['links', 'rechts', 'mitte'] },
        doppelt: { type: 'boolean' },
      },
      required: ['x', 'y'],
    },
    einstufen: gruen,
    async ausfuehren(e) {
      uiPruefen();
      const m = await klickTun(e);
      return nachAktion(m, `Geklickt bei (${e.x}, ${e.y}) auf Monitor ${m}`);
    },
  },
  {
    name: 'scrollen',
    fremd: true,
    description: 'Mausrad an einer Stelle drehen. schritte positiv = nach oben, negativ = nach unten.',
    input_schema: {
      type: 'object',
      properties: { x: { type: 'integer' }, y: { type: 'integer' }, monitor: { type: 'integer' }, schritte: { type: 'integer' } },
      required: ['x', 'y', 'schritte'],
    },
    einstufen: gruen,
    async ausfuehren(e) {
      uiPruefen();
      const m = await scrollenTun(e);
      return nachAktion(m, `Gescrollt um ${e.schritte}`);
    },
  },
  {
    name: 'tippen',
    fremd: true,
    description: 'Text in das Feld mit dem Tastaturfokus tippen. Verweigert Passwortfelder, Terminals und Zahlungsdaten. Für Befehle das Werkzeug shell verwenden.',
    input_schema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
    einstufen: (e) => tippenEinstufen(e.text),
    async ausfuehren(e) {
      uiPruefen();
      const m = await tippenTun(e);
      return nachAktion(m, `${String(e.text ?? '').length} Zeichen getippt`);
    },
  },
  {
    name: 'taste',
    fremd: true,
    description: 'Taste oder Kombination drücken, z. B. "enter", "ctrl+s", "alt+tab", "win+d", "f5".',
    input_schema: { type: 'object', properties: { kombination: { type: 'string' } }, required: ['kombination'] },
    einstufen: (e) => tasteEinstufen(e.kombination),
    async ausfuehren(e) {
      uiPruefen();
      const m = await tasteTun(e);
      return nachAktion(m, `Taste ${e.kombination} gedrückt`);
    },
  },
  {
    name: 'aktionen',
    fremd: true,
    description: `Mehrere Maus- und Tastaturschritte direkt hintereinander, danach ein einziger Screenshot – deutlich schneller als einzelne Aufrufe. Nur für Schritte, deren Wirkung vorhersehbar ist (Feld anklicken, Text tippen, Enter). Koordinaten beziehen sich auf den letzten Screenshot. Arten: klick (x, y, monitor, taste, doppelt), tippen (text), taste (kombination), scrollen (x, y, schritte, monitor), warten (ms, höchstens 3000). Höchstens ${MAX_SCHRITTE} Schritte; beim ersten Fehler ist Schluss.`,
    input_schema: {
      type: 'object',
      properties: {
        schritte: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              art: { type: 'string', enum: ['klick', 'tippen', 'taste', 'scrollen', 'warten'] },
              x: { type: 'integer' },
              y: { type: 'integer' },
              monitor: { type: 'integer' },
              taste: { type: 'string', enum: ['links', 'rechts', 'mitte'] },
              doppelt: { type: 'boolean' },
              text: { type: 'string' },
              kombination: { type: 'string' },
              schritte: { type: 'integer' },
              ms: { type: 'integer' },
            },
            required: ['art'],
          },
        },
      },
      required: ['schritte'],
    },
    // Die strengste Stufe eines einzelnen Schritts gilt für alle.
    einstufen(e) {
      const schritte = Array.isArray(e.schritte) ? e.schritte : [];
      let gelb = null;
      for (const s of schritte) {
        const st = s.art === 'tippen' ? tippenEinstufen(s.text) : s.art === 'taste' ? tasteEinstufen(s.kombination) : gruen();
        if (st.stufe === ROT) return st;
        if (st.stufe === GELB && !gelb) gelb = st;
      }
      return { ...(gelb || gruen()), beschreibung: `Schritte: ${schritte.map((s) => schrittText(s, true)).join(' → ')}` };
    },
    async ausfuehren(e) {
      const schritte = Array.isArray(e.schritte) ? e.schritte : [];
      if (!schritte.length) throw new Error('Keine Schritte angegeben.');
      if (schritte.length > MAX_SCHRITTE) throw new Error(`Höchstens ${MAX_SCHRITTE} Schritte auf einmal.`);
      uiPruefen();
      let monitor = bildschirm.monitorUnterMaus();
      const erledigt = [];
      for (const s of schritte) {
        try {
          if (s.art === 'klick') monitor = await klickTun(s);
          else if (s.art === 'scrollen') monitor = await scrollenTun(s);
          else if (s.art === 'tippen') monitor = await tippenTun(s);
          else if (s.art === 'taste') monitor = await tasteTun(s);
          else if (s.art === 'warten') await kurzWarten(Math.max(0, Math.min(3000, Number(s.ms) || 0)));
          else throw new Error(`Unbekannte Art "${s.art}".`);
        } catch (err) {
          return nachAktion(monitor, `Schritt ${erledigt.length + 1} (${schrittText(s)}) ging nicht: ${err.message} Erledigt davor: ${erledigt.join(' → ') || 'nichts'}. Nichts danach ausgeführt`);
        }
        erledigt.push(schrittText(s));
        await kurzWarten(60); // Fokus und Eingabe kurz setzen lassen
      }
      return nachAktion(monitor, `${erledigt.length} Schritte: ${erledigt.join(' → ')}`);
    },
  },
  {
    name: 'programm_oeffnen',
    description: 'Programm, Datei, Ordner oder Link öffnen, z. B. "notepad", "code", "C:\\Users\\x\\bericht.pdf", "https://…", "ms-settings:display".',
    input_schema: { type: 'object', properties: { name: { type: 'string' }, argumente: { type: 'string' } }, required: ['name'] },
    nachAussen: (e) => /^(https?|ftp|mailto):|^www\./i.test(String(e.name || '').trim()),
    einstufen(e) {
      return { ...ampel.einstufenProgramm(e.name, programmOrte(), zoneLesen), beschreibung: `Öffnen: ${e.name}${e.argumente ? ` ${e.argumente}` : ''}` };
    },
    async ausfuehren(e) {
      await win.programmOeffnen(e.name, e.argumente);
      return `Gestartet: ${e.name}${e.argumente ? ' ' + e.argumente : ''}. Zum Prüfen einen Screenshot machen.`;
    },
  },
  {
    name: 'fenster_fokussieren',
    description: 'Fenster in den Vordergrund holen (id aus fenster_auflisten). Minimierte Fenster werden wiederhergestellt.',
    input_schema: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] },
    einstufen: gruen,
    async ausfuehren(e) {
      const ok = await win.fokussieren(e.id);
      return ok ? 'Fenster ist im Vordergrund.' : 'Windows hat den Fokuswechsel verweigert. Per Screenshot prüfen.';
    },
  },
  {
    name: 'fenster_anordnen',
    description: 'Ein Fenster auf seinem Monitor andocken oder anordnen (id aus fenster_auflisten). seite: links, rechts, oben, unten (Hälften), oben_links, oben_rechts, unten_links, unten_rechts (Viertel), mitte, maximieren, wiederherstellen.',
    input_schema: { type: 'object', properties: { id: { type: 'integer' }, seite: { type: 'string', enum: win.FENSTER_SEITEN } }, required: ['id', 'seite'] },
    einstufen: gruen,
    async ausfuehren(e) {
      const ok = await win.fensterAnordnen(e.id, e.seite);
      return ok ? `Fenster ${e.seite === 'maximieren' ? 'maximiert' : e.seite === 'wiederherstellen' ? 'wiederhergestellt' : `nach ${e.seite} angedockt`}.` : 'Das Anordnen hat nicht geklappt (Fenster nicht gefunden?).';
    },
  },
  {
    name: 'datei_schreiben',
    description: 'Datei anlegen oder überschreiben (UTF-8). Eine vorhandene Datei wird vorher automatisch gesichert. anhaengen=true hängt an.',
    input_schema: {
      type: 'object',
      properties: { pfad: { type: 'string' }, inhalt: { type: 'string' }, anhaengen: { type: 'boolean' } },
      required: ['pfad', 'inhalt'],
    },
    einstufen(e, ctx) {
      const p = pfadAbs(e.pfad, ctx);
      return { ...ampel.einstufenPfade([p], ctx.config.get('arbeitsverzeichnisse'), geschuetzt(ctx)), beschreibung: `${e.anhaengen ? 'An Datei anhängen' : 'Datei schreiben'}: ${p}` };
    },
    async ausfuehren(e, ctx) {
      const p = pfadAbs(e.pfad, ctx);
      const kopie = await sichern(p, ctx);
      await fsp.mkdir(path.dirname(p), { recursive: true });
      if (e.anhaengen) await fsp.appendFile(p, e.inhalt, 'utf8');
      else await fsp.writeFile(p, e.inhalt, 'utf8');
      return `Geschrieben: ${p} (${formatGroesse(Buffer.byteLength(e.inhalt))})${kopie ? `. Vorherige Fassung gesichert unter ${kopie}` : ''}`;
    },
  },
  {
    name: 'datei_verschieben',
    description: 'Datei oder Ordner verschieben bzw. umbenennen. Überschreibt nie ein vorhandenes Ziel.',
    input_schema: { type: 'object', properties: { von: { type: 'string' }, nach: { type: 'string' } }, required: ['von', 'nach'] },
    einstufen(e, ctx) {
      const von = pfadAbs(e.von, ctx);
      const nach = pfadAbs(e.nach, ctx);
      return { ...ampel.einstufenPfade([von, nach], ctx.config.get('arbeitsverzeichnisse'), geschuetzt(ctx)), beschreibung: `Verschieben: ${von} → ${nach}` };
    },
    async ausfuehren(e, ctx) {
      const von = pfadAbs(e.von, ctx);
      const nach = pfadAbs(e.nach, ctx);
      if (fs.existsSync(nach)) throw new Error(`Ziel ${nach} existiert schon. Ich überschreibe nichts.`);
      await fsp.mkdir(path.dirname(nach), { recursive: true });
      try {
        await fsp.rename(von, nach);
      } catch (err) {
        if (err.code !== 'EXDEV') throw err;
        await fsp.cp(von, nach, { recursive: true, errorOnExist: true });
        await shell.trashItem(von);
      }
      return `Verschoben: ${von} → ${nach}`;
    },
  },
  {
    name: 'datei_papierkorb',
    description: 'Datei oder Ordner in den Papierkorb legen (wiederherstellbar). Endgültiges Löschen gibt es nicht.',
    input_schema: { type: 'object', properties: { pfad: { type: 'string' } }, required: ['pfad'] },
    einstufen(e, ctx) {
      return { stufe: GELB, kategorie: 'dateien', grund: 'Löschen, auch in den Papierkorb, wird vorher gefragt', beschreibung: `In den Papierkorb: ${pfadAbs(e.pfad, ctx)}` };
    },
    async ausfuehren(e, ctx) {
      const p = pfadAbs(e.pfad, ctx);
      if (!fs.existsSync(p)) throw new Error(`${p} gibt es nicht.`);
      await shell.trashItem(p);
      return `In den Papierkorb gelegt: ${p}`;
    },
  },
  {
    name: 'shell',
    description: 'PowerShell-Befehl ausführen. Lesende Befehle laufen sofort, alles andere nach Freigabe. Rekursives Löschen, Papierkorb leeren, Schutz abschalten und Code aus dem Netz ausführen sind gesperrt.',
    input_schema: {
      type: 'object',
      properties: {
        befehl: { type: 'string' },
        arbeitsordner: { type: 'string', description: 'Standard: erstes Arbeitsverzeichnis.' },
        timeout_s: { type: 'integer', description: 'Standard 120, höchstens 1800.' },
      },
      required: ['befehl'],
    },
    fremd: true,
    nachAussen: (e) => ampel.NETZ_BEFEHLE.test(String(e.befehl || '')),
    einstufen(e) {
      return { ...ampel.einstufenShell(e.befehl), beschreibung: `Shell: ${e.befehl}` };
    },
    async ausfuehren(e, ctx) {
      const ordner = e.arbeitsordner ? pfadAbs(e.arbeitsordner, ctx) : ctx.arbeitsordner();
      const r = await shellAusfuehren(e.befehl, ordner, Math.min(1800, Math.max(5, e.timeout_s || 120)));
      const teile = [`Exit-Code ${r.code}${r.abgelaufen ? ' (Zeitlimit erreicht, abgebrochen)' : ''}`];
      if (r.aus) teile.push('--- Ausgabe ---\n' + kurz(r.aus));
      if (r.err) teile.push('--- Fehler ---\n' + kurz(r.err, 8000));
      return fremd('der Shell-Ausgabe', teile.join('\n'));
    },
  },
  {
    name: 'gedaechtnis_lesen',
    description: 'Alle gemerkten Einträge lesen.',
    input_schema: { type: 'object', properties: {} },
    einstufen: gruen,
    async ausfuehren(e, ctx) { return ctx.gedaechtnis.alsText(); },
  },
  {
    name: 'gedaechtnis_schreiben',
    description: 'Etwas Dauerhaftes merken oder einen Eintrag ersetzen. Nie Zugangsdaten.',
    input_schema: { type: 'object', properties: { schluessel: { type: 'string', description: 'Kurzer, sprechender Name, z. B. "commits_sprache".' }, inhalt: { type: 'string' } }, required: ['schluessel', 'inhalt'] },
    dauerhaft: true,
    einstufen(e) {
      return { ...gruen(), beschreibung: `Dauerhaft merken: ${e.schluessel} = ${e.inhalt}` };
    },
    async ausfuehren(e, ctx) {
      ctx.gedaechtnis.schreiben(e.schluessel, e.inhalt);
      ctx.kontextGeaendert();
      return 'Gemerkt.';
    },
  },
  {
    name: 'gedaechtnis_loeschen',
    description: 'Einen gemerkten Eintrag vollständig löschen.',
    input_schema: { type: 'object', properties: { schluessel: { type: 'string' } }, required: ['schluessel'] },
    einstufen: gruen,
    async ausfuehren(e, ctx) {
      const ok = ctx.gedaechtnis.loeschen(e.schluessel);
      ctx.kontextGeaendert();
      return ok ? 'Gelöscht.' : `Es gibt keinen Eintrag "${e.schluessel}".`;
    },
  },
  {
    name: 'protokoll_lesen',
    description: 'Die letzten Einträge im Protokoll: alles, was über GRÜN hinausging (Installationen, Änderungen außerhalb der Arbeitsverzeichnisse, Systemeingriffe, Ablehnungen).',
    input_schema: { type: 'object', properties: { anzahl: { type: 'integer' } } },
    einstufen: gruen,
    async ausfuehren(e, ctx) {
      const l = ctx.protokoll.letzte(Math.min(200, e.anzahl || 30));
      const p = ctx.protokoll.pruefen();
      const kette = p.ok
        ? `Prüfkette intakt (${p.geprueft} geprüfte Einträge${p.ungeprueft ? `, ${p.ungeprueft} ältere ohne Prüfsumme` : ''}).`
        : `⚠ Prüfkette verletzt in Zeile ${p.zeile}: ${p.grund}. Das dem Nutzer deutlich sagen.`;
      return `${kette}\n${l.length ? JSON.stringify(l, null, 1) : 'Das Protokoll ist leer.'}`;
    },
  },
  {
    name: 'einstellung_setzen',
    description: 'Eine Einstellung ändern, z. B. blase.an, blase.farben.idle (Liste von Hex-Farben), blase.groesse, blase.tempo, sprache.vorlesen. Das Aussehen der Blase gilt sofort.',
    input_schema: {
      type: 'object',
      properties: {
        schluessel: { type: 'string' },
        wert: { description: 'Neuer Wert: Zahl, Text, true/false oder Liste von Farben.' },
      },
      required: ['schluessel', 'wert'],
    },
    einstufen(e) {
      const k = String(e.schluessel || '');
      if (EINSTELLUNG_GRUEN.test(k)) return gruen();
      if (EINSTELLUNG_GELB.test(k)) return { stufe: GELB, kategorie: 'einstellungen', grund: '', beschreibung: `Einstellung ${k} auf ${JSON.stringify(e.wert)} setzen` };
      return { stufe: ROT, kategorie: null, grund: `${k} lässt sich nur von Hand in den Einstellungen ändern` };
    },
    async ausfuehren(e, ctx) {
      const wert = ctx.config.set(e.schluessel, e.wert);
      return `${e.schluessel} = ${JSON.stringify(wert)}`;
    },
  },
  {
    name: 'stoppuhr',
    description: 'Stoppuhr am PC: aktion start, stopp, runde (Zwischenzeit), status oder zuruecksetzen. Für Timer und Wecker stattdessen erinnerung_setzen.',
    input_schema: { type: 'object', properties: { aktion: { type: 'string', enum: ['start', 'stopp', 'runde', 'status', 'zuruecksetzen'] } }, required: ['aktion'] },
    einstufen: gruen,
    async ausfuehren(e, ctx) {
      const { zeitFormat } = require('./zeit');
      const u = ctx.stoppuhr;
      const s = u[{ start: 'start', stopp: 'stopp', runde: 'runde', status: 'status', zuruecksetzen: 'zuruecksetzen' }[e.aktion]]();
      const runden = s.runden.length ? ` Runden: ${s.runden.map((r, i) => `${i + 1}) ${zeitFormat(r)}`).join(', ')}.` : '';
      if (e.aktion === 'zuruecksetzen') return 'Stoppuhr zurückgesetzt.';
      return `Stoppuhr ${s.laeuft ? 'läuft' : 'steht'} bei ${zeitFormat(s.ms)}.${runden}`;
    },
  },
  {
    name: 'erinnerung_setzen',
    description: 'Eine Erinnerung, einen Timer oder Wecker stellen, wenn der Nutzer darum bittet. Für "Timer auf 10 Minuten" oder "in 20 Minuten" in_minuten nutzen; für einen Wecker/festen Zeitpunkt zeitpunkt als 2026-09-14T15:00 (lokale Zeit) oder nur Uhrzeit "15:30" (heute bzw. morgen). Zum Zeitpunkt erscheint der Text als Meldung – es wird nichts ausgeführt.',
    input_schema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Woran erinnert werden soll, kurz, höchstens 300 Zeichen.' },
        zeitpunkt: { type: 'string' },
        in_minuten: { type: 'number' },
      },
      required: ['text'],
    },
    einstufen: gruen,
    async ausfuehren(e, ctx) {
      const r = ctx.erinnerungen.hinzufuegen(e);
      return `Erinnerung gestellt für ${zeitText(r.zeit, ctx)}: ${r.text} (id ${r.id})`;
    },
  },
  {
    name: 'erinnerungen_anzeigen',
    description: 'Alle offenen Erinnerungen mit id, Zeitpunkt und Text.',
    input_schema: { type: 'object', properties: {} },
    einstufen: gruen,
    async ausfuehren(e, ctx) {
      const l = ctx.erinnerungen.alle();
      if (!l.length) return 'Keine offenen Erinnerungen.';
      return l.map((x) => `- ${x.id}: ${zeitText(x.zeit, ctx)} – ${x.text}`).join('\n');
    },
  },
  {
    name: 'erinnerung_loeschen',
    description: 'Eine offene Erinnerung löschen (id aus erinnerungen_anzeigen).',
    input_schema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    einstufen: gruen,
    async ausfuehren(e, ctx) {
      return ctx.erinnerungen.loeschen(e.id) ? 'Gelöscht.' : `Keine Erinnerung mit id ${e.id}.`;
    },
  },
  {
    name: 'auftrag_vorlegen',
    description: 'Modus zupackend: den ganzen Auftrag einmal zur Freigabe vorlegen. Danach laufen GELB-Schritte der genannten Kategorien ohne Einzelfrage, bis dieser Auftrag fertig ist. ROT bleibt gesperrt.',
    input_schema: {
      type: 'object',
      properties: {
        beschreibung: { type: 'string', description: 'Worum es geht, ein bis zwei Sätze.' },
        schritte: { type: 'array', items: { type: 'string' }, description: 'Die geplanten Schritte.' },
        kategorien: { type: 'array', items: { type: 'string', enum: ampel.KATEGORIEN }, description: 'Welche GELB-Kategorien der Auftrag braucht.' },
      },
      required: ['beschreibung', 'schritte', 'kategorien'],
    },
    einstufen: gruen,
    async ausfuehren() {
      throw new Error('auftrag_vorlegen wird vom Agenten selbst behandelt.');
    },
  },
  {
    name: 'update_pruefen',
    description: 'Auf GitHub nach einer neueren getaggten Julia-Version sehen und die Changelog-Zeilen liefern.',
    input_schema: { type: 'object', properties: {} },
    einstufen: gruen,
    async ausfuehren(e, ctx) {
      const r = await ctx.updater.pruefen();
      if (r.fehler) return `Prüfung fehlgeschlagen: ${r.fehler}`;
      if (!r.neu) return `Aktuell: ${r.aktuell} ist die neueste Version.`;
      return `Neu: ${r.neu} (installiert: ${r.aktuell}).\n${r.zeilen.join('\n')}`;
    },
  },
  {
    name: 'update_einspielen',
    description: 'Die neueste getaggte Version einspielen. Julia startet danach neu; startet sie nicht sauber, geht es automatisch zurück.',
    input_schema: { type: 'object', properties: {} },
    einstufen() {
      return { stufe: GELB, kategorie: 'update', grund: '', beschreibung: 'Julia auf die neueste Version aktualisieren und neu starten' };
    },
    async ausfuehren(e, ctx) {
      const r = await ctx.updater.pruefen();
      if (r.fehler) throw new Error(r.fehler);
      if (!r.neu) return `Nichts zu tun, ${r.aktuell} ist aktuell.`;
      ctx.updater.nachAufgabeEinspielen(r.neu);
      return `Update auf ${r.neu} wird eingespielt, sobald diese Antwort fertig ist. Julia startet dann neu.`;
    },
  },
];

// Medien steuern (Play/Pause, Titel, Lautstärke) über die Medientasten – GRÜN.
WERKZEUGE.push({
  name: 'medien',
  description: 'Medienwiedergabe und Lautstärke über die Systemtasten steuern (wirkt auf den gerade aktiven Player, egal ob Spotify, YouTube o. Ä.): aktion playpause, weiter, zurueck, stopp, lauter, leiser, stumm. Für „lauter/leiser“ optional schritte (Standard 1).',
  input_schema: {
    type: 'object',
    properties: {
      aktion: { type: 'string', enum: ['playpause', 'weiter', 'zurueck', 'stopp', 'lauter', 'leiser', 'stumm'] },
      schritte: { type: 'integer', description: 'nur für lauter/leiser, 1–10' },
    },
    required: ['aktion'],
  },
  einstufen: gruen,
  async ausfuehren(e) {
    const n = (e.aktion === 'lauter' || e.aktion === 'leiser') ? Math.max(1, Math.min(10, e.schritte || 1)) : 1;
    for (let i = 0; i < n; i++) { await win.medien(e.aktion); if (i < n - 1) await kurzWarten(40); }
    const text = { playpause: 'Wiedergabe umgeschaltet', weiter: 'Nächster Titel', zurueck: 'Voriger Titel', stopp: 'Wiedergabe gestoppt', lauter: `${n}× lauter`, leiser: `${n}× leiser`, stumm: 'Stumm umgeschaltet' }[e.aktion];
    return `${text}.`;
  },
});

// Programm schließen: fragt vorher (könnte ungespeicherte Arbeit betreffen).
WERKZEUGE.push({
  name: 'programm_schliessen',
  description: 'Ein Programm sauber schließen (schickt allen Fenstern das Schließen-Signal; das Programm kann noch nach dem Speichern fragen). name z. B. "notepad", "chrome", "spotify".',
  input_schema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
  einstufen(e) {
    return { stufe: GELB, kategorie: 'system', grund: 'Programm schließen kann ungespeicherte Arbeit betreffen', beschreibung: `Programm schließen: ${e.name}` };
  },
  async ausfuehren(e) {
    const n = await win.programmSchliessen(e.name);
    return n ? `${n} Fenster von ${e.name} geschlossen.` : `Kein offenes Fenster von ${e.name} gefunden.`;
  },
});

// Schnell-Werkzeuge: rechnen, umrechnen, Text umwandeln, QR erzeugen – lokal, GRÜN.
WERKZEUGE.push({
  name: 'schnell',
  description: 'Kleine Helfer, alles lokal: aktion "rechnen" (ausdruck z. B. "3*(4+5)", "200*15%", "2^10"), "umrechnen" (wert, von, nach – Länge, Masse, Zeit, Daten, Fläche, Geschwindigkeit, Temperatur, z. B. km→meile, kg→pfund, °C→°F, GB→MiB), "text" (text, art: gross, klein, titel, trim, umkehren, base64, base64_dekodieren, url, url_dekodieren, json, zaehlen), "qr" (text → QR-Code als Block-Grafik). Für Live-Währungskurse gibt es keine lokale Umrechnung – dafür die Websuche nutzen.',
  input_schema: {
    type: 'object',
    properties: {
      aktion: { type: 'string', enum: ['rechnen', 'umrechnen', 'text', 'qr'] },
      ausdruck: { type: 'string' },
      wert: { type: 'number' },
      von: { type: 'string' },
      nach: { type: 'string' },
      text: { type: 'string' },
      art: { type: 'string' },
    },
    required: ['aktion'],
  },
  einstufen: gruen,
  async ausfuehren(e) {
    const schnell = require('./schnell');
    switch (e.aktion) {
      case 'rechnen': return `${e.ausdruck} = ${schnell.rechnen(e.ausdruck)}`;
      case 'umrechnen': return `${e.wert} ${e.von} = ${schnell.umrechnen(e.wert, e.von, e.nach)} ${e.nach}`;
      case 'text': return schnell.textWandeln(e.text, e.art);
      case 'qr': return `QR-Code für ${JSON.stringify(String(e.text || ''))}:\n${schnell.qrText(e.text)}`;
      default: throw new Error(`Unbekannte Aktion "${e.aktion}".`);
    }
  },
});

// Gaming-Clip: löst die Aufnahme des Systems aus (Game Bar, NVIDIA, AMD). Die
// Aufnahme bleibt auf dem PC, deshalb GRÜN.
WERKZEUGE.push({
  name: 'clip_speichern',
  description: 'Gaming-Clip speichern: löst die Aufnahme des Systems aus (Xbox Game Bar „Aufzeichnen, was passiert ist“, NVIDIA oder AMD) und meldet die neue Datei. Nur, wenn der Nutzer das will („Clip das!“).',
  input_schema: { type: 'object', properties: {} },
  einstufen: gruen,
  async ausfuehren(e, ctx) {
    if (!ctx.clipJetzt) throw new Error('Clips sind hier nicht verfügbar.');
    const r = await ctx.clipJetzt();
    if (r.fehler) throw new Error(r.fehler);
    if (r.clip) return `Clip gespeichert: ${r.clip.pfad}`;
    return 'Kein neuer Clip gefunden. Wahrscheinlich ist die Windows-Hintergrundaufnahme aus (Einstellungen → Spielen → Aufnahmen → „Aufzeichnen, was passiert ist“). In der Clip-Ansicht gibt es einen Knopf dorthin.';
  },
});

// Minecraft mitspielen (eigene Spielfigur auf dem Server des Nutzers).
WERKZEUGE.push(...require('./minecraft').WERKZEUGE);

// Für Anbieter ohne eigene Websuche. Nach außen gerichtet: Die Adresse selbst
// kann Daten tragen, deshalb wird der Abruf nach fremden Inhalten GELB.
const WEBSEITE = {
  name: 'webseite_abrufen',
  fremd: true,
  description: 'Eine öffentliche Webseite abrufen und als Text lesen. Nur http/https, keine Adressen auf diesem PC oder im Heimnetz. Nur Seiten, deren Adresse du kennst oder die der Nutzer genannt hat.',
  input_schema: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] },
  nachAussen: () => true,
  einstufen(e) {
    return { ...gruen(), beschreibung: `Webseite abrufen: ${e.url}` };
  },
  async ausfuehren(e) {
    const text = await require('./webseite').webseiteLesen(e.url);
    return fremd(`der Webseite ${String(e.url).slice(0, 200)}`, text);
  },
};

// Grundwerkzeuge plus die Werkzeuge verbundener Konten und MCP-Server.
function alle(ctx) {
  const extra = ctx && ctx.konten ? ctx.konten.werkzeuge() : [];
  const web = ctx && ctx.eigenesWeb && ctx.eigenesWeb() ? [WEBSEITE] : [];
  const mcp = ctx && ctx.mcp ? ctx.mcp.werkzeuge() : [];
  return [...WERKZEUGE, ...web, ...extra, ...mcp];
}

function definitionen(ctx) {
  return alle(ctx).map(({ name, description, input_schema }) => ({ name, description, input_schema }));
}

function finden(name, ctx) {
  return alle(ctx).find((w) => w.name === name);
}

module.exports = { WERKZEUGE, WEBSEITE, definitionen, finden, shellAusfuehren, bildBloecke };
