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
- [ ] Treiber-/Abhängigkeitsprüfung im Installer.
- [ ] **Multitasking** – mehrere Aufgaben/Aufträge gleichzeitig bzw. parallel verwalten (vom Nutzer gewünscht).
- [ ] Bessere Android-Unterstützung (Issue #6): Shizuku/Termux-Ansatz, Bildschirmsteuerung ohne Root, tokensparend – großes Rechercheprojekt.
