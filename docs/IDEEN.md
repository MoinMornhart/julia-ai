# Ideen und Fahrplan

Die Liste, an der Julia weiterentwickelt wird. Jede fertige Funktion ist ein eigenes Release
mit Tag, Changelog-Zeile und README-Eintrag.

**Legende:** ✅ erledigt · 🔨 in Arbeit · 📋 geplant · 💡 Idee
**Aufwand:** S (Stunden) · M (ein Abend) · L (mehrere Abende)
**Ampel:** welche Stufe die Funktion in Julias Sicherheitsmodell hat

---

## Erledigt

| Version | Was |
|---|---|
| ✅ 0.0.1 | Grundversion: Chat im Tray, Sprache per Hotkey, Blase, Ampel im Code, Gedächtnis, Protokoll, Updates über Git-Tags, Deutsch und Englisch |
| ✅ 0.1.0 | Google-Konto: Gmail lesen/senden, Kalender, Kontakte (OAuth mit PKCE, Tokens verschlüsselt) |
| ✅ 0.1.1 | Härtung nach Electron-Sicherheitscheckliste: Sandbox, Navigation gesperrt, IPC-Absender geprüft, gefährliche Link-Protokolle blockiert, Berechtigungen abgelehnt, strenge CSP |
| ✅ 0.2.0 | Gaming-Design: Dunkel mit Orange, Hell, wie Windows, sieben Akzentfarben plus eigene, Leuchteffekte, rahmenlose Fenster |
| ✅ 0.3.0 | Handy über eigenen Telegram-Bot: Kopplung per Code, nur ein Konto, Freigaben per Knopf, `/stopp` |
| ✅ 0.4.0 | Eigener Name für die KI, ihre Form und deine Pronomen – Namen gegen Prompt-Tricks geprüft |
| ✅ 0.5.0 | Gaming-Overlay: kleines Chatfenster über dem Spiel, Freigaben darin, Antworten auf Sprachbefehle passiv eingeblendet |
| ✅ 0.6.0 | Erinnerungen und Timer: Meldung, Chat, Vorlesen, Handy; verpasste werden nachgeliefert |

## Als Nächstes

| | Idee | Aufwand | Nutzen | Ampel / Sicherheit |
|---|---|---|---|---|
| 📋 | **Webseite, Doku, Vorführmodus** – kleine Seite mit animierter Vorführung, Funktionsübersicht, Download-Anleitung | M | mittel | GitHub Pages braucht ein öffentliches Repo oder GitHub Pro |
| 📋 | **Weitere Mail-Konten** über IMAP/SMTP (GMX, web.de, Outlook, iCloud) mit App-Passwort | M | hoch | Passwort gibst du selbst in den Einstellungen ein, Julia tippt es nie; verschlüsselt im Tresor; Senden GELB |
| 📋 | **MCP-Erweiterungen** – beliebige Dienste (Notion, Spotify, Home Assistant, GitHub …) über lokale MCP-Server | L | hoch | Jedes Werkzeug standardmäßig GELB, nur ausdrücklich lesende GRÜN; Server nur aus Liste, die du bestätigst |
| 📋 | **„Hey <Name>" als Aktivierungswort** – nur wenn eingeschaltet | M | hoch | Standard aus; nur das Schlüsselwort wird lokal erkannt, nichts wird gespeichert oder verschickt; sichtbare Anzeige, wenn das Mikrofon lauscht |

## Sicherheit – geplant

| | Maßnahme | Warum |
|---|---|---|
| 📋 | **Signierte Update-Tags** (`git verify-tag` mit SSH-Signatur, erlaubte Schlüssel im Repo) | Heute vertraut das Update dem GitHub-Konto. Mit Signatur spielt Julia nur Stände ein, die mit deinem Schlüssel signiert sind. Braucht einmalig einen Signierschlüssel von dir. |
| 📋 | **Kostenbremse** – Tageslimit für API-Nutzung mit Warnung und Stopp | Eine Endlosschleife oder ein manipulierter Auftrag soll keine Rechnung erzeugen |
| 📋 | **Manipulationssicheres Protokoll** – jede Zeile enthält den Hash der vorigen | Nachträgliches Löschen oder Ändern fällt auf |
| 📋 | **Handy-PIN für GELB** – optional eine PIN zusätzlich zum Ja-Knopf | Schutz, falls jemand dein entsperrtes Handy hat |
| 📋 | **Electron Fuses und ASAR-Integrität**, sobald es einen Installer gibt | Verhindert, dass jemand das gebaute Programm verändert oder als Node startet |
| 💡 | **Passwortfelder im Screenshot schwärzen** | Bildschirminhalte mit Passwortfeldern gehen gar nicht erst an die API |
| 💡 | **Abhängigkeiten automatisch prüfen** (`npm audit` vor jedem Release im Release-Skript) | Bekannte Lücken fallen vor dem Veröffentlichen auf |

## Weitere Ideen

| | Idee | Aufwand | Nutzen | Ampel |
|---|---|---|---|---|
| 💡 | Sprachnachrichten vom Handy verstehen (Telegram-Voice → Text) | M | hoch | wie Text vom Handy |
| 💡 | Screenshot aufs Handy schicken („Was läuft gerade am PC?") | S | mittel | GELB – Bildschirminhalt verlässt den PC über Telegram |
| 💡 | Morgen-Briefing auf Nachfrage: Termine, ungelesene Mails, Wetter | S | hoch | GRÜN, nur auf Anfrage |
| 💡 | Medien steuern (Pause, weiter, lauter) über Medientasten | S | mittel | GRÜN |
| 💡 | Routinen, die du selbst anlegst („Feierabend": Programme schließen, Musik an) | M | mittel | jede Routine einmal freigeben, einzelne GELB-Schritte bleiben GELB |
| 💡 | Gaming-Modus: leise, nur Overlay, keine Sprachausgabe | S | mittel | GRÜN |
| 💡 | Kostenanzeige pro Gespräch und Monat | S | mittel | — |
| 💡 | Lokale Webseite im WLAN statt Telegram (QR-Code koppeln) | L | mittel | nur im Heimnetz, TLS mit gepinntem Zertifikat |

## Was du selbst tun musst

Ein paar Dinge kann Julia nicht für dich erledigen, weil sie Konten oder Schlüssel betreffen:

- **Anthropic-API-Schlüssel** in den Einstellungen eintragen – ohne ihn antwortet Julia nicht.
- **Google:** einmalig einen OAuth-Client anlegen ([Anleitung](google-einrichten.md)).
- **Handy:** einmalig einen Bot bei @BotFather anlegen ([Anleitung](handy-telegram.md)).

## Aus der Recherche

*Hier kommen die Ideen aus dem Vergleich mit anderen Assistenten (Siri, Gemini, Copilot,
Alexa+, ChatGPT, Claude, Open Interpreter, Raycast, Nvidia G-Assist, Xbox Game Bar …) und
die Sicherheits-Empfehlungen dazu. Die Recherche läuft noch.*
