# Stand: Julia (julia-ai) (Übergabe 2026-10-24)

## Was es ist
Philips persönlicher, Jarvis-artiger Assistent als lokale Windows-Desktop-App (Electron, kein Server). Julia sieht den Bildschirm, spricht lokal (Whisper/Piper), steuert den PC über eine Ampel (grün/gelb/rot), spielt Minecraft mit und ist per Handy-App erreichbar.

## Aktueller Stand
- Version **9.2.0** (2026-09-26), Installer `Julia-AI-Setup.exe` über GitHub-Releases, Auto-Update mit SHA-512-Prüfung, Backup/Rollback.
- Funktioniert u. a.: Chat und Sprache („Hey Julia“, Live-Untertitel), animierte Blase (standardmäßig aus), Gaming-Overlay, Bildschirmblick und PC-Steuerung, MCP-Server-Support, KI-Anbieter (inkl. Claude-Abo über den Claude-Code-Modus, Ollama/LM Studio offline), Chat-Compacting, Minecraft-Mitspielerin (BETA-Persönlichkeit), Android-App (Expo, APK per CI), Grafik-Selbstheilung bei schwarzem Fenster.
- Das **Content-Creation-Modul** (Schnitt, Planung, Thumbnails inkl. 3D-Blender) wurde am 26.09. **auf Philips Wunsch komplett entfernt**. Nicht ohne neue Ansage wieder einbauen; ein eigenständiger Neuanfang ist separat geplant (vermutlich als eigene App – unklar, ob MoinStudio).
- Ebenfalls entfernt (23.09., auf Wunsch): Anbindungen an Philips eigene Apps (ToDoch, Streamo, VibeWorks usw.). Nicht wieder hinzufügen.

## Zuletzt gemacht
- 2026-10-24: Cloud-Start-Hook (`.claude/hooks/skills-cloud.sh`) für Philips Skills
- 2026-09-26: v9.2.0 Content-Studio entfernt; v9.1.1 Repo-Check-Befunde begründet
- 2026-09-25: v8.4.1–v9.1.0 Thumbnail-/Blender-Ausbau (inzwischen wieder entfernt), Auto-Update fängt fehlgeschlagenen Installer-Start ab
- 2026-09-24: v6.8.1–v7.9.x Update-Robustheit (gesperrte Dateien, Wiederholungen), Grafik-Notstufen, Chat-Compacting

## Offen / Nächste Schritte
- **Issue #119 – Update-Problem** (von JONIMONI09/Philip): Der alte Uninstaller stürzt ab (0xC0000374), gesperrte Dateien. Gewünscht war ein eigener Updater-Client (C++, Julia-Design, Ladebalken, Hash-Prüfung, Backup). Teile sind gebaut, das Issue ist weiter offen.
- **Issue #122:** Sicherheitslücke in `electron` (^44.4.0 → 45.0.0).
- **Issues #43/#44:** Repo-Check (Sicherheitslücken in Abhängigkeiten, 106 Befunde); **#23:** Abhängigkeiten aktualisieren (Android/Expo braucht größeres Upgrade).
- Roadmap in `CLAUDE.md`: Treiber-/Abhängigkeitsprüfung im Installer; **Multitasking** (mehrere Aufgaben parallel, Wunsch von Philip).
- Ideen: `docs/IDEEN.md`.
- Seit 26.09. keine neue Version mehr – unklar, ob Philip hier gerade aktiv weiterarbeiten will.

## Wichtige Infos
- Technik: Electron + Node, Hauptprozess `src/main/`, Oberfläche `src/renderer/`, Brücke `src/preload/`, PowerShell-Helfer `src/main/win/`, Prompts `prompt/julia.de.md`/`.en.md`, Rust-Experiment `julia-core/`, Android `julia-android/`.
- Start: `npm install` und `npm start`; Tests: `npm test` (`node --test`).
- Release: `npm run release -- <korrektur|funktion|bruch> "Text"` (Tests + `npm audit`, Version, Changelog, Tag, Installer ans Release).
- Version zählt in Zehnerschritten (`0.5.9` → `0.6.0`). „Das ist neu“ in beiden READMEs bei jeder Version pflegen.
- Nutzerdaten liegen in `%APPDATA%\Julia` (Updates fassen den Ordner nie an).
- `CLAUDE.md` enthält das **Fehler-Journal**: Nach jedem echten Bugfix Regressions-Test + Journal-Eintrag (Wunsch JONIMONI09).
- Repo: github.com/Morni-Team/julia-ai (öffentlich, MIT-Lizenz).

## Philips Vorgaben
- Lokale Windows-Software, kein Server; soll über das Claude-Abo laufen; Zugriff vom Handy; Blase auf 2./3. Monitor.
- Repo **öffentlich**. Update-Funktion: **ja** (Auto-Update eingebaut).
- „Verfasst mit Claude 🤖“ in Git-Texten: im Repo **nicht festgelegt** (bisherige Commits haben es nicht) – bei Bedarf Philip fragen.
- Nie destruktives Git (Historie umschreiben, Releases/Tags löschen, Sichtbarkeit ändern) ohne klare Ansage.
- Diagnose/Logs verlassen den PC nur mit Zustimmung und bereinigt (siehe `CLAUDE.md`).

---
Diese Datei wird beim Arbeiten aktuell gehalten: nach jedem größeren Schritt „Aktueller Stand“ und „Offen“ anpassen.
