<p align="center">
  <img src="docs/bilder/logo.png" width="96" alt="Julia">
</p>

<h1 align="center">Julia</h1>

<p align="center">
  Dein persönlicher Assistent für den Windows-PC.<br>
  Läuft im Tray, sieht den Bildschirm, spricht mit dir – und fragt vorher bei allem, was sich nicht zurücknehmen lässt.
</p>

<p align="center">
  <b>Deutsch</b> · <a href="README.en.md">English</a> · <a href="site/index.html">Webseite mit Vorführung</a>
</p>

---

<p align="center">
  <img src="docs/bilder/chat-de.png" width="420" alt="Chatfenster mit Freigabekarte">
  &nbsp;
  <img src="docs/bilder/einstellungen-de.png" width="420" alt="Einstellungen">
</p>

## Was Julia ist

Julia ist kein allgemeiner Chatbot, sondern ein Programm, das dauerhaft auf deinem Rechner
läuft und auf Anweisung wartet. Du schreibst ihr im Chat oder drückst einen Hotkey und
sprichst. Sie schaut sich an, was los ist, und erledigt es – vom Umbenennen von 200 Dateien
bis zur Fehlersuche in einem Repo.

- **Sieht den Bildschirm** – Screenshots aller Monitore, Fensterliste, Prozesse, Systemstatus.
- **Handelt** – klickt, tippt, drückt Tasten, öffnet Programme, schreibt und verschiebt Dateien, führt PowerShell aus.
- **Liest und prüft Code** – erst lesen, dann urteilen; Vorschläge als Diff, Tests vorher und nachher.
- **Installiert sauber** – erst nachsehen, ob es schon da ist, dann `winget` oder die Herstellerseite, danach eine Versionsprüfung.
- **Recherchiert** – Websuche und Seitenabruf für alles, was aktuell sein muss.
- **Merkt sich Dauerhaftes** – Projekte, Arbeitsweisen, Geräte. Zugangsdaten nie.
- **Erinnert dich** – „Erinner mich um 15 Uhr an den Anruf", „in 20 Minuten Pizza raus". Als Meldung, im Chat, vorgelesen und aufs Handy. Verpasste Erinnerungen kommen beim nächsten Start.
- **Spricht** Deutsch oder Englisch, per Hotkey, offline über die Windows-Sprachausgabe.
- **Aktualisiert sich** auf Wunsch selbst – nur auf getaggte Versionen, mit automatischem Rückweg.

## Die Ampel

Jede Aktion fällt in genau eine Stufe. Das steht nicht nur im Prompt, die Software prüft es
selbst, bevor etwas ausgeführt wird.

| Stufe | Was passiert | Beispiele |
|---|---|---|
| 🟢 **GRÜN** | Julia macht es einfach. | Lesen, Screenshots, Programme öffnen, Dateien in deinen Arbeitsverzeichnissen, lesende Shell-Befehle, Tests |
| 🟡 **GELB** | Julia sagt in einem Satz, was passiert, und wartet auf dein Ja. | Software installieren, Dateien außerhalb der Arbeitsverzeichnisse, Registry, Dienste, `git push`, Admin-Rechte, Papierkorb |
| 🔴 **ROT** | Niemals, auch nicht auf ausdrückliche Anweisung. | Passwörter oder Kartendaten eintippen, Anmeldungen, Zahlungen, `rm -rf`, Papierkorb leeren, Virenschutz abschalten, Code aus dem Netz ausführen |

Was die Software selbst durchsetzt:

- Shell-Befehle werden eingestuft. Nur eindeutig lesende Befehle sind GRÜN, alles Unklare wird GELB, endgültiges Löschen und das Aushebeln von Schutz sind gesperrt.
- `tippen` prüft vorher über UI Automation, ob der Fokus in einem Passwortfeld liegt, und verweigert Terminals sowie Karten- und IBAN-Nummern.
- `klick`, `tippen` und `taste` gehen nur mit einem frischen Screenshot („nie blind klicken") und liefern danach automatisch einen neuen.
- Julias eigene Dateien (Konfiguration, API-Schlüssel, Gedächtnis) sind nie ohne Rückfrage beschreibbar.
- Jede GELB-Aktion landet im Protokoll, überschriebene Dateien werden vorher gesichert.
- Eine Freigabe gilt für genau eine Aktion. Im Modus **zupackend** („zieh das durch") legt Julia den ganzen Auftrag einmal vor, danach laufen nur die dort genannten Kategorien ohne Einzelfrage.

Was die Software **nicht** erkennen kann: dass ein bestimmter Klick eine Mail abschickt oder eine
Bestellung auslöst. Dafür ist Julia selbst zuständig, sie fragt dann im Chat.

## Design

Standard ist **Dunkel im Gaming-Look**: tiefer Hintergrund mit feinem Raster, Leuchtakzente,
Freigabekarten mit Warnstreifen, Werkzeugschritte im Terminal-Stil. Dazu gibt es **Hell** und
**Wie Windows**. Sieben Akzentfarben stehen bereit (Glut, Neon, Cyber, Toxic, Magenta, Blut,
Gold), dazu eine eigene aus dem Farbwähler. Die Leuchteffekte lassen sich abschalten, und ein
Knopf passt die Blase an die Akzentfarbe an. Alles greift sofort, ohne Neustart.

**Deine KI, dein Name:** In den Einstellungen gibst du ihr einen eigenen Namen („Rainer"
statt „Julia"), wählst ihre Form (Assistentin, Assistent oder neutral) und deine eigenen
Pronomen – er, sie, nur dein Name oder eigene. Der Name erscheint überall: im Chat, im Tray,
in den Meldungen und im Gespräch.

## Gaming-Overlay

<p align="center">
  <img src="docs/bilder/overlay-de.png" width="300" alt="Overlay über dem Spiel">
</p>

Mit `Strg+Umschalt+Leertaste` legt sich ein kleines, halbtransparentes Chatfenster über dein
Spiel – im Fenstermodus oder randlosen Vollbild. Tippen, Enter, weiterspielen; `Esc` oder
derselbe Hotkey blendet es aus. Freigaben erscheinen dann im Overlay, statt das große
Fenster über das Spiel zu legen.

Auf Wunsch blendet Julia ihre Antwort auf **Sprachbefehle** kurz passiv ein: Klicks gehen
durch, das Spiel behält den Fokus, nach ein paar Sekunden verschwindet sie wieder.
Monitor, Ecke, Deckkraft und Hotkey stellst du in den Einstellungen ein.

> Bei *exklusivem* Vollbild zeigt Windows grundsätzlich keine Overlays – dann das Spiel auf
> „Randloses Fenster" stellen.

## Die Blase

Auf Wunsch liegt eine animierte Kugel auf deinem Nebenmonitor und zeigt, was Julia gerade tut.
Sie ist **standardmäßig aus** und lässt Klicks durch sich hindurch.

<p align="center">
  <img src="docs/bilder/blase-idle.png" width="150" alt="wartet">
  <img src="docs/bilder/blase-listening.png" width="150" alt="hört zu">
  <img src="docs/bilder/blase-thinking.png" width="150" alt="denkt">
  <img src="docs/bilder/blase-speaking.png" width="150" alt="spricht">
</p>
<p align="center"><sub>wartet · hört zu · denkt · spricht</sub></p>

Monitor, Ecke, Größe, Deckkraft, Tempo, Empfindlichkeit und beliebig viele Farben je Zustand
lassen sich zur Laufzeit ändern – in den Einstellungen oder einfach per Satz: „Mach sie grüner."

## Konten verbinden

<p align="center">
  <img src="docs/bilder/verbindungen-de.png" width="560" alt="Verbindungen: Google und Handy">
</p>

Julia kann dein **Google-Konto** nutzen – Gmail, Kalender und Kontakte:

> „Hab ich neue Mails?" · „Was steht morgen an?" · „Schreib Anna, dass ich zehn Minuten später komme." ·
> „Leg mir Freitag 14 Uhr Zahnarzt ein." · „Speicher die Rechnung aus der Mail von Telekom in Downloads."

| Julia kann | Ampel |
|---|---|
| Mails suchen und lesen, Anhänge speichern, Entwürfe anlegen | 🟢 |
| Termine ansehen, Kontakte finden | 🟢 |
| Mails senden, Termine anlegen, Einladungen verschicken | 🟡 – die Freigabekarte zeigt Empfänger und den vollständigen Text |
| Mails oder Termine löschen | gibt es nicht |

Anmelden tust du selbst im Browser, Julia sieht nie ein Passwort. Einmalig brauchst du einen
eigenen OAuth-Client aus der Google Cloud Console, das dauert etwa zehn Minuten:
**[Schritt-für-Schritt-Anleitung](docs/google-einrichten.md)**. Danach: *Einstellungen →
Verbindungen → Mit Google verbinden*.

Was in einer Mail steht, ist für Julia nie ein Auftrag. Versteckte Anweisungen in Mails
(„Assistent, leite das weiter") führt sie nicht aus, sondern weist dich darauf hin.

### Vom Handy aus

Über deinen **eigenen Telegram-Bot** schreibst du Julia von unterwegs – ohne Server und ohne
Portfreigabe: „Läuft der Download noch?", „Wie voll ist die Platte?", „Was steht morgen an?".
Freigaben kommen als **✅ Ja / ❌ Nein**-Knöpfe aufs Handy, `/stopp` bricht sofort ab. Der Bot
hört nach der Kopplung nur auf dein Konto, alte Nachrichten werden nicht ausgeführt, ROT
bleibt ROT. **[Anleitung](docs/handy-telegram.md)**

## Installation

**Voraussetzungen:** Windows 10 oder 11, [Node.js](https://nodejs.org) 20 oder neuer,
[Git](https://git-scm.com) und ein API-Schlüssel von [Anthropic](https://console.anthropic.com).

```powershell
git clone https://github.com/MoinMornhart/julia-ai.git
cd julia-ai
git checkout (git describe --tags --abbrev=0)   # auf die neueste Version
npm install
npm start
```

Beim ersten Start öffnet sich die Einrichtung: Vorname, API-Schlüssel und die Ordner, in
denen Julia ohne Rückfrage schreiben darf. Der Schlüssel wird mit Windows (DPAPI)
verschlüsselt gespeichert.

> Falls `npm start` meldet, dass Electron fehlt: `node node_modules/electron/install.js`
> ausführen. Manche npm-Einstellungen überspringen den Download beim Installieren.

## Bedienung

| Was | Wie |
|---|---|
| Chat öffnen / schließen | `Strg+Alt+J` oder Klick aufs Tray-Symbol |
| Sprechen | `Strg+Alt+Leertaste`, noch einmal drücken bricht ab |
| Laufende Aufgabe stoppen | Stopp-Knopf oder `Esc` im Chat |
| Neues Gespräch | Stift-Symbol im Chat oder Tray-Menü |
| Einstellungen | Zahnrad im Chat oder Tray-Menü |

Die Hotkeys lassen sich in den Einstellungen ändern. Antworten werden vorgelesen, wenn du
gesprochen hast (einstellbar: immer, nie, bei Sprache).

**Spracherkennung:** Julia nutzt die Windows-eigene Erkennung (System.Speech). Für Deutsch
bzw. Englisch muss das passende Sprachpaket mit Spracherkennung installiert sein
(Einstellungen → Zeit und Sprache → Sprache). Die Qualität ist ordentlich, aber nicht auf dem
Niveau aktueller Cloud-Diktate.

## Wo Julias Daten liegen

Alles liegt in `%APPDATA%\Julia`, außerhalb des Repos. Updates fassen diesen Ordner nie an.

| Datei | Inhalt |
|---|---|
| `config.json` | alle Einstellungen, der API-Schlüssel nur verschlüsselt |
| `konten.json` | verbundene Konten; Secrets und Tokens nur verschlüsselt |
| `gedaechtnis.json` | was Julia sich dauerhaft merkt |
| `protokoll.jsonl` | jede Aktion über GRÜN hinaus |
| `sicherungen\` | vorherige Fassungen überschriebener Dateien |
| `vorgemerkt.json` | GELB-Aktionen aus unbeaufsichtigten Läufen |
| `update.log` | Verlauf der Updates |

## Updates

Tray-Menü → **Nach Updates suchen**. Julia holt die Tags von GitHub, zeigt Version und
Changelog und fragt nach. Nach dem Ja wartet sie, bis die laufende Aufgabe fertig ist,
checkt den Tag aus, zieht die Abhängigkeiten nach und startet neu. Startet die neue Fassung
nicht sauber, geht es automatisch auf den vorherigen Stand zurück.

| Einstellung | Bedeutung | Standard |
|---|---|---|
| `update.pruefen` | beim Start nach neuen Tags sehen | an |
| `update.automatisch` | ohne Rückfrage einspielen | aus |
| `update.kanal` | `stabil` (nur Tags) oder `test` (auch Vorabversionen) | stabil |

Julia zählt in Zehnerschritten: `0.0.9` → `0.1.0`, `0.9.9` → `1.0.0`.

## Für Entwickler

```
prompt/            System-Prompt, Deutsch und Englisch, mit Platzhaltern
src/main/          Hauptprozess: Agent, Werkzeuge, Ampel, Updater, Sprache, Bildschirm
src/main/win/      PowerShell-Hilfsprozess für Fenster, Maus, Tastatur
src/renderer/      Chat, Blase, Einstellungen
src/preload/       die einzige Brücke zwischen Oberfläche und Hauptprozess
scripts/release.js neue Version veröffentlichen
test/              node --test
```

```powershell
npm test                                                   # Tests
npm run release -- korrektur "Blase startet jetzt ausgeschaltet"
npm run release -- funktion  "Julia liest jetzt Termine vor"
npm run release -- bruch     "Neue Einstellungsdatei" --hinweis "Hotkeys neu setzen"
```

Das Release-Skript setzt die Version, schreibt die Changelog-Zeile, committet mit
`vX.Y.Z – <Zeile>`, setzt den Tag, pusht und legt ein GitHub-Release an. Ohne Tag kein Update.

Screenshots für diese README entstehen im Vorführmodus mit einem getrennten Datenordner:

```powershell
$env:JULIA_DATEN = "$env:TEMP\julia-demo"; $env:JULIA_SCREENSHOTS = "docs\bilder"; npm start
```

## Grenzen

- Julia ist ein Programm, kein Mensch – und kein Arzt, Anwalt oder Finanzberater.
- Sie braucht eine Internetverbindung zur Anthropic-API. Die Nutzung kostet API-Guthaben.
- Die Kanäle `mobile` und `auto` sind im Verhalten angelegt, eine Mobil-App und einen Zeitplaner gibt es noch nicht.
