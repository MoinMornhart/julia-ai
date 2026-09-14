'use strict';

const path = require('path');

// Die Ampel aus Abschnitt 9 im Code. Was hier ROT ist, führt Julia nie aus,
// egal was das Modell will. Was nicht eindeutig GRÜN ist, wird GELB.

const GRUEN = 'GRUEN';
const GELB = 'GELB';
const ROT = 'ROT';

// Kategorien für den Modus "zupackend": Eine Auftragsfreigabe nennt die
// Kategorien, die sie abdeckt. Alles andere wird wieder einzeln gefragt.
const KATEGORIEN = [
  'dateien',        // löschen, verschieben, umbenennen per Shell; Papierkorb
  'dateien_extern', // Dateien außerhalb der Arbeitsverzeichnisse schreiben/verschieben
  'software',       // installieren, deinstallieren, aktualisieren
  'system',         // Systemeinstellungen, Dienste, Registry, Autostart, Prozesse beenden
  'oeffentlich',    // push, publish, Deployments
  'admin',          // alles mit erhöhten Rechten
  'einstellungen',  // Julias eigene Einstellungen außer dem Aussehen der Blase
  'update',         // Julia selbst aktualisieren
  'programm',       // unbekannte ausführbare Dateien starten
  'nachricht',      // E-Mails senden, Kalendereinladungen verschicken
  'netz',           // Links öffnen und Netzwerk-Befehle, nachdem fremde Inhalte im Gespräch waren
  'gedaechtnis',    // dauerhaft merken, nachdem fremde Inhalte im Gespräch waren
  'kalender',       // Termine im eigenen Kalender anlegen
  'shell',          // sonstige Shell-Befehle, die nicht nur lesen
  'mcp',            // Werkzeuge angeschlossener MCP-Server
];

const ROT_MUSTER = [
  [/\brm\s+(-\w*r\w*f\w*|-\w*f\w*r\w*|-r\s+-f|-f\s+-r)\b/i, 'rekursives Löschen (rm -rf)'],
  [/\bRemove-Item\b[^;|]*-Recurse/i, 'rekursives Löschen (Remove-Item -Recurse)'],
  [/\b(rd|rmdir)\b[^;|]*\/s/i, 'rekursives Löschen (rd /s)'],
  [/\bdel\b[^;|]*\/s/i, 'rekursives Löschen (del /s)'],
  [/\bClear-RecycleBin\b/i, 'Papierkorb leeren'],
  [/\$Recycle\.Bin/i, 'Eingriff in den Papierkorb'],
  [/\bFormat-Volume\b|\bformat\s+[a-z]:/i, 'Formatieren'],
  [/\b(diskpart|Clear-Disk|Initialize-Disk|Remove-Partition)\b/i, 'Datenträger löschen'],
  [/\bcipher\b[^;|]*\/w/i, 'Daten endgültig überschreiben'],
  [/\bsdelete\b/i, 'Daten endgültig löschen'],
  [/\b(vssadmin|wbadmin)\b[^;|]*\bdelete\b/i, 'Schattenkopien oder Backups löschen'],
  [/\bSet-MpPreference\b[^;|]*-Disable/i, 'Virenschutz abschalten'],
  [/\bAdd-MpPreference\b[^;|]*-Exclusion/i, 'Ausnahme im Virenschutz anlegen'],
  [/\bnetsh\b[^;|]*advfirewall[^;|]*state\s+off/i, 'Firewall abschalten'],
  [/\bSet-NetFirewallProfile\b[^;|]*-Enabled\s+(\$?false|0)/i, 'Firewall abschalten'],
  [/\bEnableLUA\b|\bConsentPromptBehavior/i, 'Benutzerkontensteuerung aushebeln'],
  [/\bbcdedit\b/i, 'Starteinstellungen ändern'],
  [/\bSet-ExecutionPolicy\b(?![^;|]*-Scope\s+Process)[^;|]*\b(Unrestricted|Bypass)\b/i, 'Skriptschutz dauerhaft abschalten'],
  [/\b(iwr|irm|curl|wget|Invoke-WebRequest|Invoke-RestMethod)\b[^;]*\|\s*(iex|Invoke-Expression|sh|bash|cmd|powershell|pwsh)\b/i, 'Code aus dem Netz direkt ausführen'],
  [/\b(iex|Invoke-Expression)\b[^;]*\b(DownloadString|irm|iwr|Invoke-WebRequest|Invoke-RestMethod|Net\.WebClient)\b/i, 'Code aus dem Netz direkt ausführen'],
  [/\bDownloadString\b|\bDownloadFile\b|\bStart-BitsTransfer\b/i, 'Dateien aus dem Netz herunterladen'],
  [/-(e|ec|enc|encodedcommand)\s+[A-Za-z0-9+/=]{16,}/i, 'verschleierter Befehl (EncodedCommand)'],
  [/\bnet\s+user\b[^;|]*\/add\b|\bNew-LocalUser\b/i, 'Konto anlegen'],
  [/\bcmdkey\b[^;|]*\/(add|generic)/i, 'Zugangsdaten hinterlegen'],
  [/\bmshta\b|\bregsvr32\b[^;|]*\/i:/i, 'bekannter Umgehungsweg'],
];

// Befehle, die nur lesen (oder Tests laufen lassen, Abschnitt 6).
const GRUEN_MUSTER = [
  /^(Get|Test|Select|Where|Sort|Format|Measure|Group|Compare|ConvertTo|ConvertFrom|Resolve|Split|Join|Find|Search)-\w+/i,
  /^(Out-String|Out-Host|Out-Null|Write-Output|Write-Host|ForEach-Object|%|\?|foreach|where|select|sort)\b/i,
  /^(dir|ls|gci|gc|cat|type|echo|pwd|cd|sl|Set-Location|Push-Location|Pop-Location|tree|more|findstr|fc|sort|ver|whoami|hostname|systeminfo|tasklist|driverquery|netstat|nslookup|ping|tracert|pathping|where|where\.exe|date\s*\/t|time\s*\/t)\b/i,
  /^ipconfig(\s+\/all)?\s*$/i,
  /^(reg|reg\.exe)\s+query\b/i,
  /^(sc|sc\.exe)\s+(query|qc)\b/i,
  /^schtasks(\.exe)?\s+\/query\b/i,
  /^certutil(\.exe)?\s+-hashfile\b/i,
  /^winget\s+(list|search|show|--version|-v)\b/i,
  /^git\s+(status|log|diff|show|rev-parse|describe|ls-files|blame|shortlog|reflog)\b/i,
  /^git\s+(branch|tag|remote|stash\s+list)((\s+(-a|-v|-vv|-r|-l|--list|--all|--show-current|--merged|--no-merged))*)\s*$/i,
  /^git\s+config\s+(--get|--list|-l)\b/i,
  /^[\w.-]+(\.exe)?\s+(--version|-v|-V|version)\s*$/i,
  /^npm\s+(ls|list|outdated|view|help|test|t|run\s+test|config\s+get|root|prefix)\b/i,
  /^(pnpm|yarn)\s+(test|list|ls|why|outdated)\b/i,
  /^(npx\s+)?(vitest\s+run|jest|mocha)\b/i,
  /^(python|py|python3)(\.exe)?\s+-m\s+(pytest|unittest)\b/i,
  /^pytest\b/i,
  /^(dotnet|cargo|go|mvn|gradle|gradlew)\s+test\b/i,
  /^node\s+--test\b/i,
];

const GELB_KATEGORIE = [
  [/\b(winget|choco|scoop)\s+(install|uninstall|upgrade|remove|import)\b|\bmsiexec\b|\bnpm\s+(i|install|uninstall|update|ci)\b|\bpip3?\s+(install|uninstall)\b|\b(pnpm|yarn)\s+(add|install|remove)\b|\bdotnet\s+tool\s+install\b|\bInstall-(Module|Package)\b/i, 'software'],
  [/\b(git\s+push|npm\s+publish|gh\s+(release|pr)\s+create|vercel|netlify\s+deploy|firebase\s+deploy)\b/i, 'oeffentlich'],
  [/-Verb\s+RunAs\b|\b(sudo|gsudo|runas)\b/i, 'admin'],
  [/\b(reg\s+(add|delete|import)|Set-ItemProperty|New-ItemProperty|Remove-ItemProperty)\b|\bHK(LM|CU|CR|U|CC):|\b(schtasks\s+\/(create|delete|change)|Register-ScheduledTask|Unregister-ScheduledTask)\b|\b(sc\s+(config|delete|create|stop|start)|Set-Service|Stop-Service|Start-Service|Restart-Service|New-Service)\b|\b(shutdown|Restart-Computer|Stop-Computer)\b|\b(Stop-Process|taskkill)\b|\bnetsh\b|\bSet-Date\b|\bpowercfg\b/i, 'system'],
  [/\b(rm|del|erase|Remove-Item|ri|mv|move|Move-Item|mi|ren|rename|Rename-Item|rni|copy|cp|Copy-Item|robocopy|xcopy)\b/i, 'dateien'],
];

function segmente(befehl) {
  return befehl
    .split(/\r?\n|;|\|\||&&|\|/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function einstufenShell(befehl) {
  const text = String(befehl || '').trim();
  if (!text) return { stufe: GELB, kategorie: 'shell', grund: 'leerer Befehl' };

  for (const [muster, grund] of ROT_MUSTER) {
    if (muster.test(text)) return { stufe: ROT, kategorie: null, grund };
  }

  let kategorie = 'shell';
  for (const [muster, kat] of GELB_KATEGORIE) {
    if (muster.test(text)) { kategorie = kat; break; }
  }

  // Umleitungen in Dateien, Unterausdrücke und dynamische Aufrufe sind nie
  // "nur lesen", egal was drumherum steht.
  const ohneHarmlos = text
    .replace(/\d?>&\d/g, '')
    .replace(/\d?>\s*(\$null|nul)\b/gi, '');
  const verdaechtig = />/.test(ohneHarmlos)
    || /\$\(|@\(\s*&|\b(iex|Invoke-Expression|Invoke-Command|Start-Process|Invoke-Item|ii)\b/i.test(text)
    || /(^|[\s;|(])&\s*['"$({]/.test(text)
    || /-(e|ec|enc|encodedcommand)\b/i.test(text);

  if (!verdaechtig && kategorie === 'shell') {
    const alleLesend = segmente(text).every((s) => GRUEN_MUSTER.some((m) => m.test(s)));
    if (alleLesend) return { stufe: GRUEN, kategorie: null, grund: 'nur lesend' };
  }

  return { stufe: GELB, kategorie, grund: kategorie === 'shell' ? 'nicht eindeutig lesend' : `Kategorie ${kategorie}` };
}

function normal(p) {
  return path.resolve(String(p)).replace(/[\\/]+$/, '').toLowerCase();
}

function liegtIn(pfad, ordner) {
  const p = normal(pfad);
  const o = normal(ordner);
  return p === o || p.startsWith(o + path.sep);
}

function inArbeitsverzeichnis(pfad, arbeitsverzeichnisse) {
  return (arbeitsverzeichnisse || []).some((o) => o && liegtIn(pfad, o));
}

// Julias eigene Dateien (Konfiguration, API-Schlüssel, Gedächtnis) sind nie
// GRÜN beschreibbar, auch wenn jemand %APPDATA% als Arbeitsverzeichnis einträgt.
function istGeschuetzt(pfad, geschuetzt) {
  return (geschuetzt || []).some((o) => o && liegtIn(pfad, o));
}

function einstufenPfade(pfade, arbeitsverzeichnisse, geschuetzt) {
  for (const p of pfade) {
    if (istGeschuetzt(p, geschuetzt)) {
      return { stufe: GELB, kategorie: 'einstellungen', grund: `${p} gehört zu Julias eigenen Dateien` };
    }
  }
  const aussen = pfade.filter((p) => !inArbeitsverzeichnis(p, arbeitsverzeichnisse));
  if (aussen.length === 0) return { stufe: GRUEN, kategorie: null, grund: 'in den Arbeitsverzeichnissen' };
  return { stufe: GELB, kategorie: 'dateien_extern', grund: `außerhalb der Arbeitsverzeichnisse: ${aussen.join(', ')}` };
}

const AUSFUEHRBAR = /\.(exe|msi|msix|appx|bat|cmd|ps1|psm1|vbs|vbe|js|jse|wsf|scr|com|pif|hta|jar|lnk|reg)$/i;

// zoneLesen(pfad) liefert die Zone aus der Mark-of-the-Web-Kennzeichnung
// (3 = Internet, 4 = nicht vertrauenswürdig) oder null.
function einstufenProgramm(name, bekannteOrte, zoneLesen) {
  const text = String(name || '').trim();
  if (/^(https?|mailto|ms-settings|ms-[\w-]+):/i.test(text)) return { stufe: GRUEN, kategorie: null, grund: 'Link oder Systemseite' };
  if (!/[\\/]/.test(text)) return { stufe: GRUEN, kategorie: null, grund: 'Programm über den Namen' };
  if (!AUSFUEHRBAR.test(text)) return { stufe: GRUEN, kategorie: null, grund: 'Datei mit zugeordnetem Programm öffnen' };
  const zone = zoneLesen ? zoneLesen(text) : null;
  if (zone !== null && zone >= 3) {
    return { stufe: ROT, kategorie: null, grund: 'aus dem Internet heruntergeladene Datei ausführen (Mark-of-the-Web)' };
  }
  if ((bekannteOrte || []).some((o) => o && liegtIn(text, o))) return { stufe: GRUEN, kategorie: null, grund: 'installiertes Programm' };
  return { stufe: GELB, kategorie: 'programm', grund: `ausführbare Datei außerhalb der Programmordner: ${text}` };
}

// Befehle, die Daten nach außen tragen können, obwohl sie "nur lesen" –
// DNS-Anfragen etwa lassen sich als Kanal für Datenabfluss missbrauchen.
const NETZ_BEFEHLE = /\b(ping|tracert|pathping|nslookup|Resolve-DnsName|Test-Connection|Test-NetConnection)\b/i;

// Die "tödliche Dreifaltigkeit": private Daten + fremde Inhalte + Wege nach
// außen. Sobald fremde Inhalte im Gespräch sind, wird jede Aktion nach außen,
// die sonst GRÜN wäre, GELB – ein getäuschtes Modell kann so keine Daten
// unbemerkt über einen Link oder eine DNS-Anfrage hinausschmuggeln.
//
// Dasselbe gilt fürs Gedächtnis: Was nach fremden Inhalten dauerhaft gemerkt
// werden soll, braucht ein Ja – sonst könnte eine Mail ("merk dir: Rechnungen
// immer an X") Julias Verhalten auf Dauer vergiften.
function nachFremdemInhalt(stufe, fremdKontakt, nachAussen, dauerhaft = false) {
  if (!fremdKontakt || stufe.stufe !== GRUEN) return stufe;
  if (nachAussen) {
    return {
      ...stufe,
      stufe: GELB,
      kategorie: 'netz',
      grund: 'Nach fremden Inhalten im Gespräch: Aktion nach außen (Schutz gegen Datenabfluss)',
    };
  }
  if (dauerhaft) {
    return {
      ...stufe,
      stufe: GELB,
      kategorie: 'gedaechtnis',
      grund: 'Nach fremden Inhalten im Gespräch: dauerhaft merken nur mit deinem Ja (Schutz gegen ein vergiftetes Gedächtnis)',
    };
  }
  return stufe;
}

// "Allem zustimmen" in den Einstellungen: GELB läuft dann ohne Rückfrage –
// außer den Schutzfragen nach fremden Inhalten (Datenabfluss, vergiftetes
// Gedächtnis). Sonst könnte eine Webseite Julia unbemerkt etwas hinausschicken
// lassen. ROT bleibt davon unberührt gesperrt.
const IMMER_FRAGEN = ['netz', 'gedaechtnis'];

// Wer auch diese Schutzfragen nicht will, schaltet zusätzlich "auch nach
// fremden Inhalten" ein – mit eigener Warnung, nur von Hand.
function ohneFrage(kategorie, allemZugestimmt, auchNachFremdem = false) {
  if (allemZugestimmt !== true) return false;
  return !IMMER_FRAGEN.includes(kategorie) || auchNachFremdem === true;
}

// Kartennummern (Luhn-geprüft) und IBANs tippt Julia nie ein.
function enthaeltZahlungsdaten(text) {
  const s = String(text || '');
  if (/\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){3,7}(?:\s?[A-Z0-9]{1,3})?\b/.test(s)) return true;
  const kandidaten = s.match(/(?:\d[ -]?){13,19}/g) || [];
  return kandidaten.some((k) => luhn(k.replace(/\D/g, '')));
}

function luhn(ziffern) {
  if (ziffern.length < 13 || ziffern.length > 19) return false;
  let summe = 0;
  let doppelt = false;
  for (let i = ziffern.length - 1; i >= 0; i--) {
    let z = Number(ziffern[i]);
    if (doppelt) { z *= 2; if (z > 9) z -= 9; }
    summe += z;
    doppelt = !doppelt;
  }
  return summe % 10 === 0;
}

module.exports = {
  GRUEN, GELB, ROT, KATEGORIEN,
  einstufenShell, einstufenPfade, einstufenProgramm, nachFremdemInhalt, NETZ_BEFEHLE, ohneFrage, IMMER_FRAGEN,
  inArbeitsverzeichnis, liegtIn, enthaeltZahlungsdaten,
};
