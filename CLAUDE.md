# CLAUDE.md – Leitfaden & Fehler-Journal für Julia

Diese Datei ist für Claude bzw. den Agenten, der an **Julia** (julia-ai) arbeitet.
Sie hält fest, wie hier gearbeitet wird, welche Fehler schon aufgetreten sind und
**wie** sie behoben wurden – damit derselbe Fehler nie zweimal passiert.

## Was Julia ist

Windows-Desktop-Assistent (Electron): sieht den Bildschirm, spricht lokal (Whisper/Piper),
steuert den PC, spielt Minecraft mit, arbeitet mit den eigenen Apps des Nutzers zusammen
(ToDoch, Streamo, VibeWork, Patchfeld, Codewerk, Content-Helper). Jede Aktion läuft durch die
**Ampel** (grün/gelb/rot). Details: [README.md](README.md).

## Grundregeln beim Arbeiten

- **„WAS IST WENN?"** – Immer den Fehlerfall zuerst denken. Kein Pfad darf zu einem
  wortlosen Absturz führen. `try/catch` um alles, was scheitern kann (Datei, Netz, GPU,
  fremde API); im Zweifel eine klare deutsche Meldung, nie ein stiller Abbruch.
- **Tests grün halten**: `node --test` vor jedem Release. Neue Logik = neuer Test.
- **Update-Schema** (siehe README §Updates): Version in Zehnerschritten, eine Changelog-Zeile
  in Nutzersprache, Commit mit Versionsnummer vorne, Tag, GitHub-Release, Installer anhängen –
  am einfachsten `node scripts/release.js <korrektur|funktion|bruch> "…"`.
- **„Das ist neu"** in beiden READMEs bei **jeder** Version pflegen: neuestes oben, unterstes raus.
- **Nie destruktives Git** (Historie umschreiben, Releases/Tags löschen, Repo-Sichtbarkeit)
  ohne klare Ansage.

## Datenschutz beim Logging & bei Diagnose (verbindlich)

Wenn Logs oder Crash-Berichte den PC verlassen (nur **nach ausdrücklicher Zustimmung**, opt-in):

- **NIEMALS** versenden: IP-Adressen, API-Tokens, Passwörter, Zugangsdaten, Dateiinhalte,
  Screenshots, persönliche Daten (Name, E-Mail), Pfade mit dem Benutzernamen.
- **Erlaubt** sind nur technische Diagnosewerte: Julia-Version, Windows-Version, GPU/Treiber,
  Fehlermeldung/Stacktrace (vorher von Pfaden/Namen bereinigt), ob Software-Rendering aktiv ist.
- Vor dem Senden **bereinigen** (Scrubber): Benutzernamen aus Pfaden, alles, was wie Token/
  E-Mail/IP aussieht, ersetzen. Standard ist **aus**; der Nutzer wählt es bewusst.
- Lokale Logbücher (`start.log`, Minecraft-Logbuch, PC-Steuerungs-Leistungslogbuch) bleiben auf
  dem PC und dürfen mehr enthalten; sie werden nicht automatisch versendet.
- **PC-Steuerung/Leistung (Issue #25):** Bei jeder Steuerungs-Aktion (Klick, Tippen, Screenshot,
  Programm/Fenster) hält Julia lokal **nur Technisches** fest – Aktionsname (festes Vokabular),
  Dauer und ihren **eigenen** CPU-Verbrauch (`process.cpuUsage()`, kein PowerShell → erzeugt beim
  Messen keine Last) sowie ihren Speicher. **Nie** Inhalt: kein getippter Text, keine Koordinaten,
  kein Fenstertitel, kein Screenshot-Inhalt. An den Dev geht davon nur eine **aggregierte,
  bereinigte** Zusammenfassung, und nur bei eingeschalteter Diagnose (`diagnose.senden`, Standard
  aus) – [src/main/leistung.js](src/main/leistung.js).

## Fehler-Journal

Format: **Datum · Fehler · Ursache · Fix (welche Datei)**. Neueste oben.

| Datum | Fehler | Ursache | Fix |
|---|---|---|---|
| 2026-09-16 | Werkzeug `einstellung_setzen` ließ die KI (mit Bestätigung) `anbieter`/`anbieter_url` setzen (Issue #51) | Ein vergifteter Chat hätte per einmaliger Bestätigung die Anbieter-Adresse auf einen fremden Server umbiegen und so das Gespräch/Daten abfließen lassen können | `anbieter`/`anbieter_url` aus `EINSTELLUNG_GELB` entfernt → sie sind jetzt ROT (nur der Nutzer von Hand). Zugleich `design.`/`brainstorming.`/`memos.` als unkritische, mit Rückfrage änderbare Schalter ergänzt; mit Test abgesichert – [src/main/werkzeuge.js](src/main/werkzeuge.js) |
| 2026-09-16 | Minecraft: bleibt im Wasser mit einem Block über dem Kopf hängen (Issue #28, bekannter mineflayer-Fall) | Die Anti-Hänger-Hilfe griff nur bei `onGround`; im Wasser ist `onGround` immer false, also wurde ein Steckenbleiben dort nie erkannt und kein Impuls gegeben | `_antiHaenger` wirkt jetzt auch im Wasser (Gate über die reine, getestete `haengerAktiv`-Funktion); dort bedeutet der Impuls „hochschwimmen" und wird länger gehalten (`haengerDauer`), damit sie sicher aufsteigt – kein Block-Abbau – [src/main/minecraft.js](src/main/minecraft.js) |
| 2026-09-16 | Repo-Check/Semgrep (Issue #44): Prototype-Pollution-Muster in `mischen` und rohe unsichtbare Zeichen im Quelltext | `mischen` prüfte Schlüssel mit `k in standard` – das ist für `__proto__`/`constructor` über die Prototypenkette wahr, der Schlüssel wurde also nicht übersprungen (fragil); und `hilfen.js` hatte die Unsichtbar-Zeichen-Klasse mit echten unsichtbaren Zeichen im Code stehen | In `mischen` gefährliche Schlüssel explizit überspringen und auf `hasOwnProperty` statt `in` umstellen – [src/main/config.js](src/main/config.js); die Regex-Klasse in `hilfen.js` als `\u`-Escapes schreiben (verhaltensgleich, per Codepoint-Sweep verifiziert) – [src/main/hilfen.js](src/main/hilfen.js). Die übrigen 93 Befunde sind im Kontext einer lokalen Einzelnutzer-App False Positives (Pfad-Traversal mit eigenen Nutzerpfaden, OAuth-Loopback über http, `data:`-Icon ohne SRI, RegExp mit festen/escapten Werten, GCM mit gesetztem Auth-Tag) |
| 2026-09-16 | „Ich sehe keine Elemente, obwohl die Logs fehlerfrei sind" (Issue #26/#45) | Beim Start wartet das Fenster mit `await julia.status()`/`julia.texte()` **ohne Zeitlimit**; erst danach füllt start.js über `bereit.then` alle Beschriftungen. Antwortet ein Start-IPC nie (Hänger), löst `bereit` nie auf → Oberfläche bleibt ganz ohne Text/Bedienung, und ein Hänger wirft nichts, also steht nichts im Log | Start-IPCs bekommen ein Zeitlimit (`mitZeitlimit`, [src/renderer/zeitlimit.js](src/renderer/zeitlimit.js)); läuft es ab, wird die Oberfläche mit Ersatz sichtbar/bedienbar und der Hänger ins Start-Logbuch gemeldet; `bereit` löst jetzt immer auf; der Healthcheck erkennt zusätzlich leere Beschriftungen – [src/renderer/chat.js](src/renderer/chat.js), [src/renderer/start.js](src/renderer/start.js), [src/preload/preload.js](src/preload/preload.js) |
| 2026-09-16 | Fenster startet, aber Oberfläche bleibt leer/unstyled – Knöpfe & Layout fehlen (Issue #45) | Griff das CSS nicht bzw. wurde der Inhalt nicht aufgebaut, gab es keine Erkennung und keine Erholung | UI-Healthcheck im Preload: kurz nach dem Laden prüfen, ob Stylesheets und Body-Inhalt da sind; ist die Oberfläche leer, ins Logbuch melden (`ui-healthcheck`) und **einmal** neu laden (Selbstheilung, kein Loop dank `sessionStorage`-Merker) – [src/preload/preload.js](src/preload/preload.js) |
| 2026-09-16 | Zweiter Start bringt kein Fenster – „läuft bereits", aber nichts erscheint (Issue #45) | Der `second-instance`-Handler rief `chatZeigen` nur, **wenn `chatFenster` schon existierte**; lief Julia nur im Tray (kein/zerstörtes Fenster), passierte beim erneuten Start nichts | Immer `chatZeigen('chat')` – die Funktion legt das Fenster bei Bedarf neu an, stellt es wieder her und holt es nach vorn – [src/main/main.js](src/main/main.js) `second-instance` |
| 2026-09-16 | uuid-Sicherheitslücke GHSA-w5hq-g745-h8pq (moderat, Issue #43) | Transitiv über yggdrasil bzw. @azure/msal-node kam uuid < 11.1.1 herein; `npm audit fix --force` hätte mineflayer auf 1.4.0 heruntergebrochen | In `package.json` ein `overrides` auf `uuid: ^11.1.1` gesetzt (v11 liefert weiterhin CommonJS `v4`, daher kompatibel); danach `npm audit` = 0 Lücken, alle Tests grün – kein mineflayer-Downgrade |
| 2026-09-16 | „Oberfläche lädt nicht" ohne jede Spur – kein Fehler wird geloggt (Issue #3) | Unbehandelte JS-Fehler in einem Fenster (Renderer) landeten nirgends; ohne Log war nicht erkennbar, warum die UI leer blieb | Preload fängt `window.onerror` und `unhandledrejection` in jedem Fenster ab und meldet sie an den Hauptprozess; sie landen im Start-Logbuch als `RENDERER-FEHLER` (lokal) – [src/preload/preload.js](src/preload/preload.js) + [src/main/main.js](src/main/main.js) (`diagnose:rendererFehler`) |
| 2026-09-16 | Wiederholte Renderer-Abstürze nach dem Start – App bleibt mit totem Fenster hängen (Issue #41/#3) | Nur GPU-Abstürze und Renderer-Abstürze **im Startfenster** lösten die Selbstheilung aus; stürzte der Renderer wiederholt **danach** ab, wurde das nur geloggt | `beiRenderer` zählt jetzt echte Renderer-Abstürze auch nach dem Start und stellt ab der Schwelle auf Software-Rendering um und startet neu (wie bei GPU-Abstürzen) – [src/main/startpruefung.js](src/main/startpruefung.js) |
| 2026-09-16 | Shell-Befehle hängen und lassen sich nicht mehr stoppen (Issue #36) | Das Zeitlimit legte nur die KI fest (bis 1800 s); der Nutzer hatte keine feste Obergrenze, mit der ein hängender Befehl sicher abbricht | Einstellbares **Standard- und Maximal-Timeout** (`shell.timeout_s` / `shell.max_s`); das Maximum begrenzt jeden Befehl, auch wenn die KI mehr will – abgebrochen wird per `taskkill /T /F` – [src/main/werkzeuge.js](src/main/werkzeuge.js) (`shellTimeout`) + Einstellungen „Shell-Befehle" |
| 2026-09-16 | Modell ohne Bild-Unterstützung: derselbe Screenshot-Fehler wiederholt sich (Issue #34, z. B. „Vision is disabled for model 'mimo-v2.5'") | Bei einem Vision-Fehler kam nur eine Meldung; Julia schickte weiter Screenshots → immer wieder derselbe 400-Fehler | Julia **merkt sich** solche Modelle (`modelle_ohne_bild` in der Config), lässt bei ihnen Screenshots künftig weg (mit Hinweis „screenshot omitted" statt Bild) und **wiederholt** die fehlgeschlagene Runde einmal automatisch ohne Bild – [src/main/anbieter/openai.js](src/main/anbieter/openai.js) (`verlaufUmwandeln` `ohneBild`), [src/main/agent.js](src/main/agent.js) (`_bildlosMerken`) |
| 2026-09-16 | Semgrep: „github-actions-mutable-action-tag" in `.github/workflows/pages.yml` (Issue #33) | Die Actions waren an verschiebbare Tags (`@v4`, `@v5`, `@v3`) gebunden; ein Tag kann umgehängt werden (kompromittiertes Action-Repo) → im CI liefe anderer/böser Code | Jede Action auf ihren **festen Commit-SHA** gepinnt (mit `# vX`-Kommentar), SHAs vorher per `gh api repos/<action>/commits/<tag>` geholt (kein Raten) – [.github/workflows/pages.yml](.github/workflows/pages.yml) |
| 2026-09-16 | Installer überschreibt laufende Version nicht / Auto-Update scheitert – trotz #9-Fix (Issue #32) | Der sanfte `taskkill` in `customInit` reichte nicht; electron-builders **Standard-Prüfung** zeigte weiter den blockierenden „App kann nicht geschlossen werden – Retry"-Dialog, der auch nach dem Kill hängen blieb | Den Hook **`customCheckAppRunning`** überschrieben (kein Retry-Dialog mehr) und **hart** beenden mit `taskkill /F /T` inkl. Kindprozessen (GPU/Renderer heißen auch „Julia AI.exe"), zwei Durchläufe – [build/installer.nsh](build/installer.nsh) |
| 2026-09-16 | Release-Skript legt Release an, hängt aber keinen Installer an; `npm run installer` bricht mit „duplicate dependency references" ab | Transienter electron-builder-Zustand beim Einsammeln der node_modules (nicht durch Quellcode) – der NSIS-Schritt lief nicht zu Ende (nur `.exe`, keine `.blockmap`/`latest.yml`) | `npm run installer` einfach erneut ausführen (lief beim zweiten Mal sauber), dann `gh release upload <tag> dist/Julia-AI-Setup.exe dist/Julia-AI-Setup.exe.blockmap dist/latest.yml --clobber`; vorher prüfen, dass `latest.yml` die richtige Version trägt |
| 2026-09-16 | Minecraft: Bot friert ein (verbunden, aber keine Reaktion) und macht nicht weiter | Automatisches Wiederverbinden griff nur bei echtem Verbindungsabbruch, nicht bei einem stillen Einfrieren (Physics-Ticks bleiben aus) | Hänger-Wache mit eigenem Timer erkennt ausbleibende Ticks (>30 s) und erzwingt einen Relog; Zustand wird vorher als JSON ins Logbuch geschrieben – [src/main/minecraft.js](src/main/minecraft.js) `_haengerWache`/`_relog`/`haengerErkannt` |
| 2026-09-16 | Minecraft: bleibt an einer 1 Block hohen Kante hängen und kommt nicht voran | Beim Laufen (Wegfindung oder selbst vorwärts) fehlte bei Blockade ein Sprung-Impuls – die Figur klebte an der Stufe, statt hochzuspringen | Anti-Hänger: erkennt Stillstand trotz Laufwunsch (kaum Positionsänderung über ~0,6 s am Boden) und gibt einen kurzen Sprung-Impuls – [src/main/minecraft.js](src/main/minecraft.js) `_antiHaenger` / `haengerStatus` |
| 2026-09-16 | Installer/Update bricht ab, wenn Julia noch läuft (Issue #9) | Der Assistent-Installer (`oneClick:false`) beendet eine laufende Instanz nicht selbst → gesperrte Dateien → „Datei in Benutzung"-Fehler bei Installation **und** automatischem Update | Eigenes NSIS-Skript `customInit`/`customUnInit` beendet eine laufende Julia vorher (sanft, dann hart; Prozessname via `${PRODUCT_FILENAME}`) – [build/installer.nsh](build/installer.nsh), eingebunden über `nsis.include` in [package.json](package.json) |
| 2026-09-16 | Android-APK-Build (Issue #24) bricht ab: `color/splashscreen_background not found` bzw. Release-Schritt `unexpected EOF` | `expo prebuild` erzeugt die Splash-Farbe nicht immer, obwohl `splashscreen.xml` darauf verweist; und ein gerades `"` im `gh release --notes`-Text beendete die Bash-Zeichenkette vorzeitig | Nach dem prebuild die Farbe `splashscreen_background` garantiert in `values/colors.xml` anlegen; Release-Notiz in einfachen Anführungszeichen ohne eingebettetes `"` – [.github/workflows/android-apk.yml](.github/workflows/android-apk.yml) |
| 2026-09-15 | „KI crasht, weil keine Vision" bei eigenen Anbietern (Issue #18) | Text-Modell ohne Bild-Unterstützung liefert bei einem Screenshot einen kryptischen API-Fehler | `fehlerAus` erkennt Bild/Vision-Fehler und macht daraus einen klaren Hinweis (Modell mit Bild-Unterstützung wählen oder ohne Screenshots arbeiten) – [src/main/anbieter/openai.js](src/main/anbieter/openai.js) |
| 2026-09-15 | App startet mit schwarzem Fenster und crasht (Issue #7) | GPU-/Renderer-Absturz beim Start; Software-Rendering griff erst beim nächsten manuellen Start | Beim ersten Absturz im Startfenster sofort Software-Rendering setzen **und automatisch neu starten**; crasht es auch damit, klare Meldung statt Endlosschleife – [src/main/startpruefung.js](src/main/startpruefung.js) `gpuUeberwachen` |
| 2026-09-15 | Minecraft: bleibt am Abgrund hängen, bis sie stirbt | Gefahrenwache fror das Vorwärts-Gehen auch während der Wegfindung ein → Livelock am Rand | Wache greift nur noch beim selbstgesteuerten Vorlaufen; bei aktiver Wegfindung weicht der Pathfinder selbst aus – [src/main/minecraft.js](src/main/minecraft.js) `_gefahrWache` |
| 2026-09-15 | Minecraft: reißt beim Abbauen Truhen/Bauten ab | `_abbauen` grub jeden passenden Block im Umkreis, auch Wertvolles | Geschützte Blocktypen (Truhen, Öfen, Türen, Glas …) nur bei ausdrücklicher Nennung; kleinerer Suchradius – [src/main/minecraft.js](src/main/minecraft.js) `GESCHUETZT_ABBAU` |
| 2026-09-15 | GitHub-Pages-Workflow bricht mit „Resource not accessible by integration" ab | `actions/configure-pages@v5` mit `enablement: true` darf Pages nicht selbst anlegen | Pages einmalig per API aktivieren (`gh api -X POST repos/…/pages -f build_type=workflow`), dann `enablement` aus dem Workflow entfernen – [.github/workflows/pages.yml](.github/workflows/pages.yml) |
| 2026-09-15 | `git push` im Release-Skript abgelehnt („fetch first") | Remote hatte einen Commit voraus (parallel gepusht) | `git fetch` + `git rebase origin/main`, Tag mit `git tag -f` auf den neuen Commit verschieben, dann Commit **und** Tag pushen; danach GitHub-Release + Installer manuell nachholen |
| 2026-09-15 | „Kann v0.7.0 nicht installieren" | Installer ist **nicht signiert** → Windows SmartScreen/Defender blockt eine unbekannte App | Workaround: Datei entsperren (Eigenschaften → Zulassen) bzw. „Weitere Informationen → Trotzdem ausführen". **Dauerhaft nur mit Code-Signing-Zertifikat** (kostenpflichtig); der Build signiert dann automatisch, sobald ein Zertifikat via `CSC_LINK`/`CSC_KEY_PASSWORD` bereitsteht |
| — | GPU-Prozess stürzt schon beim Start in Serie ab („GPU process isn't usable. Goodbye.") | Chromium gibt den GPU-Prozess auf; ohne Abfang bleibt der Start schwarz/stumm | Erster GPU-Absturz im Startfenster setzt **sofort** den Software-Rendering-Merker für den nächsten Start; ab Schwelle wird ausgewichen und einmal gemeldet – [src/main/startpruefung.js](src/main/startpruefung.js) |
| — | Sich gegenseitig aufhebende Grafik-Flags lassen den GPU-Prozess abstürzen | widersprüchliche `--`-Flags beim Start | `flaggenPruefen` erkennt bekannte Konflikte und schaltet auf Software-Rendering – [src/main/startpruefung.js](src/main/startpruefung.js) |

### Vorlage für neue Einträge

```
| JJJJ-MM-TT | Kurzbeschreibung des Fehlers | Ursache in einem Satz | Fix + Datei/Commit |
```

Immer wenn ein realer Fehler behoben wird: **hier eintragen** (welcher Fehler, wie gefixt),
damit die Lösung dokumentiert ist und beim nächsten Mal sofort greift.

## Offene Punkte (Issues #3, #7 – GPU/Diagnose) & Roadmap

- [x] GPU/Treiber beim Start ins Logbuch schreiben ([src/main/main.js](src/main/main.js), `GPU-INFO`).
- [x] Fehler-Journal (diese Datei).
- [x] Startcrash (schwarzes Fenster) selbst heilen: erster Absturz → Software-Rendering + Auto-Neustart (#7).
- [x] Opt-in-Diagnose: bereinigten Crash-/Diagnose-Bericht auf Wunsch als Bug an VibeWork senden ([src/main/diagnose.js](src/main/diagnose.js) mit Scrubber – nie IP/Tokens/PII; Werkzeug `diagnose`, Einstellung `diagnose.senden`, Standard aus).
- [x] Reparatur-Start: `Julia AI.exe --reparatur` (bzw. `--software`/`--safe`) erzwingt Software-Grafik, falls die GPU beim Start crasht ([src/main/main.js](src/main/main.js)).
- [x] Wöchentliche, tokenschonende Selbstprüfung: schaut ohne KI ins Start-Logbuch nach Abstürzen; meldet nur mit Zustimmung (bereinigt) an VibeWork – [src/main/selbstpruefung.js](src/main/selbstpruefung.js).
- [x] KI-Setup-Box für geheime Werte (Issue #51, Teil B): Werkzeug `geheimnis_anfordern` – die KI bittet um einen geheimen Wert (Passwort/Token), eine Box im Chat holt ihn, der **Wert** fließt direkt vom Fenster in den verschlüsselten Speicher (IPC `geheimnis:eingabe`) und wird **nie** an den Agenten/die KI zurückgegeben (nur „hinterlegt/abgebrochen"), nichts vom Wert wird geloggt – [src/main/werkzeuge.js](src/main/werkzeuge.js), [src/main/main.js](src/main/main.js) (`geheimnisAnfordern`), [src/renderer/chat.js](src/renderer/chat.js).
- [x] Token sparen bei eigenen Anbietern (Issue #16, Teil 1): Auf der OpenAI-kompatiblen Seite werden nur noch die letzten paar Screenshots mitgeschickt (Standard 3), ältere fallen raus – analog zum serverseitigen Clearing der Anthropic-Seite. Tool-Paarung bleibt intakt (nur die Bild-Blöcke fallen weg, die Werkzeug-Ergebnis-Texte bleiben) – [src/main/anbieter/openai.js](src/main/anbieter/openai.js) `verlaufUmwandeln` (`bildBehalten`). Offen bleibt das automatische Kompaktieren/Zusammenfassen alter Text-Runden.
- [x] Token-/Schlüssel-Erkennung (Issue #51): erkennt echte Zugangs-Tokens vieler Anbieter (Präfixe wie `ghp_`, `sk-`, `AKIA`, `AIza`, `vw_`, JWT …) plus generisch sehr lange, zufällige Schlüssel; blockt einen Token als Geheimnis-**Namen** (die KI sieht nur Namen). Wiederverwendbar für spätere KI-Setup-Boxen und die Diagnose-Bereinigung – [src/main/token-erkennung.js](src/main/token-erkennung.js), angewandt in [src/main/geheimnisse.js](src/main/geheimnisse.js).
- [x] VibeWorks-Anbindung per MCP (Issue #51/#13/#18/#21): Login-Box in den Einstellungen (API-Schlüssel `vw_…`, geprüft über `GET /api/mcp/rules`, genaue „nicht angemeldet"-Codes), Verbindung über den vorhandenen HTTP-MCP-Transport. Schlüssel liegt verschlüsselt im Tresor, nie in der config, nie für die KI lesbar; nur über die Oberfläche (kein KI-Werkzeug) – [src/main/vibeworks.js](src/main/vibeworks.js), IPC in [src/main/main.js](src/main/main.js), UI in [src/renderer/einstellungen.js](src/renderer/einstellungen.js).
- [x] CPU-Fresser sicher entlasten (Issue #19/#26): im Boost-Tab auf Nutzer-Klick die Priorität eines Prozesses auf Idle senken (umkehrbar), **kein** hartes Suspendieren (Deadlock-Gefahr), feste Sperrliste (System/Julia nie), **kein KI-Werkzeug** – [src/main/win/win.js](src/main/win/win.js) `prozessBremsen`/`darfBremsen`, IPC `boost:bremsen` in [src/main/main.js](src/main/main.js), UI in [src/renderer/boost.js](src/renderer/boost.js).
- [ ] Treiber-/Abhängigkeitsprüfung im Installer.
- [ ] **Multitasking** – mehrere Aufgaben/Aufträge gleichzeitig bzw. parallel verwalten (vom Nutzer gewünscht).
- [ ] Bessere Android-Unterstützung (Issue #6): Shizuku/Termux-Ansatz, Bildschirmsteuerung ohne Root, tokensparend – großes Rechercheprojekt.
