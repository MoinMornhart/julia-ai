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
- Lokale Logbücher (`start.log`, Minecraft-Logbuch) bleiben auf dem PC und dürfen mehr enthalten;
  sie werden nicht automatisch versendet.

## Fehler-Journal

Format: **Datum · Fehler · Ursache · Fix (welche Datei)**. Neueste oben.

| Datum | Fehler | Ursache | Fix |
|---|---|---|---|
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

## Offene Punkte aus Issue #3 (GPU/Diagnose)

- [x] GPU/Treiber beim Start ins Logbuch schreiben ([src/main/main.js](src/main/main.js), `GPU-INFO`).
- [x] Fehler-Journal (diese Datei).
- [ ] Opt-in-Diagnose: bereinigten Crash-Bericht auf Wunsch als Bug an VibeWork senden (mit Scrubber, ohne IP/Tokens).
- [ ] Reparatur-/Diagnose-Start über Terminal mit Extra-Logging.
- [ ] Wöchentliche, tokenschonende Selbstprüfung.
- [ ] Treiber-/Abhängigkeitsprüfung im Installer.
