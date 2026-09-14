# Julia AI installieren und loslegen

<p align="center"><b>Deutsch</b> · <a href="installation.en.md">English</a></p>

Diese Anleitung bringt Julia in ein paar Minuten auf deinen PC und zeigt dir danach, was sie
kann und wie du sie bedienst.

- [1. Was du brauchst](#1-was-du-brauchst)
- [2. Herunterladen](#2-herunterladen)
- [3. Installieren](#3-installieren)
- [4. Erster Start](#4-erster-start)
- [5. So bedienst du Julia](#5-so-bedienst-du-julia)
- [6. Was Julia kann](#6-was-julia-kann)
- [7. Die Ampel: was Julia darf](#7-die-ampel-was-julia-darf)
- [8. Updates](#8-updates)
- [9. Deinstallieren](#9-deinstallieren)
- [10. Wenn etwas nicht klappt](#10-wenn-etwas-nicht-klappt)

## 1. Was du brauchst

- Windows 10 oder 11, 64 Bit.
- Einen Zugang zu einem KI-Modell. Am besten ein **API-Schlüssel von Anthropic** – den bekommst du
  unter [console.anthropic.com](https://console.anthropic.com) → *API Keys*. Genauso gehen Schlüssel
  von **OpenAI**, **Google Gemini**, **Mistral**, **Groq** oder **OpenRouter**, oder ein kostenloses
  **lokales Modell** mit [Ollama](https://ollama.com) oder [LM Studio](https://lmstudio.ai). Bezahlt
  wird beim Anbieter nach Verbrauch; Julia hat eine Kostenbremse mit Tageslimit (Standard 10 US-$).

Admin-Rechte brauchst du nicht.

## 2. Herunterladen

Lade **Julia-AI-Setup.exe** nur von der offiziellen Seite:

- Webseite: https://moinmornhart.github.io/julia-ai-web/
- Direkt: [Julia-AI-Setup.exe](https://github.com/MoinMornhart/julia-ai-web/releases/latest/download/Julia-AI-Setup.exe)

Nie von Download-Portalen. Wenn du sichergehen willst, vergleiche die Prüfsumme mit der auf der
Webseite. In PowerShell im Download-Ordner:

```powershell
Get-FileHash .\Julia-AI-Setup.exe
```

## 3. Installieren

1. Doppelklick auf **Julia-AI-Setup.exe**.
2. Der Installer ist noch nicht signiert. Zeigt Windows **„Der Computer wurde durch Windows
   geschützt“**, klicke auf **Weitere Informationen** und dann **Trotzdem ausführen**.
3. Julia installiert sich nur für dein Benutzerkonto, legt eine Verknüpfung auf dem Desktop und im
   Startmenü an und startet danach von selbst.

## 4. Erster Start

Beim ersten Start öffnet sich die Einrichtung:

1. **Dein Vorname** – so spricht Julia dich an.
2. **KI-Anbieter und API-Schlüssel** – Anbieter wählen (Standard: Anthropic) und den Schlüssel
   einfügen. Er wird mit Windows verschlüsselt gespeichert; Julia zeigt ihn nie wieder an. Bei
   Ollama oder LM Studio brauchst du keinen Schlüssel; mit *Modelle laden* siehst du, welche
   Modelle bereitstehen.
3. **Arbeitsordner** – die Ordner, in denen Julia ohne Rückfrage Dateien anlegen und ändern darf,
   zum Beispiel `Dokumente\Projekte`. Überall sonst fragt sie vorher.
4. Auf **Fertig** klicken.

Danach sitzt Julia unten rechts im **Infobereich der Taskleiste** (Tray). Rechtsklick auf das
Symbol öffnet das Menü mit Chat, Einstellungen, Updates und Beenden.

Optional in den Einstellungen: ihr einen eigenen Namen geben („Rainer“ statt „Julia“), Farben und
Hell/Dunkel wählen, Google verbinden, das Handy im WLAN koppeln.

## 5. So bedienst du Julia

| Taste | Was passiert |
|---|---|
| `Strg` + `Alt` + `Leertaste` | Sprechen: einmal drücken, reden, nochmal drücken |
| `Strg` + `Alt` + `J` | Chatfenster öffnen oder schließen |
| `Strg` + `Umschalt` + `Leertaste` | Kleines Overlay über einem Spiel |
| `Esc` | Laufende Aufgabe abbrechen oder Fenster schließen |

Alle Tasten lassen sich in den Einstellungen ändern. Auf Wunsch hört Julia auch auf
**„Hey Julia“** (bzw. deinen eigenen Namen) – das ist standardmäßig aus und wird nur auf dem PC
erkannt.

Links im Hauptfenster findest du **Start** (dein Tag auf einen Blick, mit Tagesbriefing),
**Chat**, **Verlauf** (alte Gespräche durchsuchen und fortsetzen) und **Routinen** (eigene
Abläufe wie „Feierabend“ auf Knopfdruck).

Schreib oder sag einfach, was du willst, in ganzen Sätzen. Julia sagt dir kurz, was sie vorhat,
und meldet am Ende, was erledigt ist.

## 6. Was Julia kann

**Deinen Bildschirm verstehen**
> „Was mache ich hier gerade?“ · „Warum zeigt das Terminal einen Fehler?“ · „Welches Fenster frisst
> gerade so viel Speicher?“

**Am PC handeln** – klicken, tippen, Programme öffnen, Fenster ordnen, PowerShell ausführen
> „Öffne VS Code mit dem Projekt.“ · „Mach den Explorer und den Browser nebeneinander.“

**Dateien aufräumen**
> „Benenne die Fotos im Ordner Urlaub nach Datum um.“ · „Schieb alle PDFs aus Downloads in
> Dokumente\Rechnungen.“

**Programme installieren** – erst nachsehen, ob es schon da ist, dann über `winget` oder die
Herstellerseite, danach prüfen, ob es läuft
> „Installier mir 7-Zip.“

**Code lesen und prüfen**
> „Schau dir das Repo an und sag mir, warum der Test fehlschlägt.“

**Nachschlagen** – im Web suchen und Seiten lesen (die Websuche gibt es mit Claude; bei anderen
Anbietern liest Julia Seiten, deren Adresse bekannt ist)
> „Was ist die aktuelle Node-Version?“

**Erinnern**
> „Erinner mich um 15 Uhr an den Anruf.“ · „In 20 Minuten Pizza raus.“

**Mails und Kalender** (nach dem Verbinden von Google)
> „Hab ich neue Mails?“ · „Was steht morgen an?“ · „Schreib Anna, dass ich zehn Minuten später
> komme.“

**Vom Handy aus** (im selben WLAN, nach dem Koppeln per QR-Code)
> „Läuft der Download noch?“ · „Wie voll ist die Platte?“

**Sich Dinge merken** – Projekte, Arbeitsweisen, Geräte. Passwörter nie.
> „Merk dir: Commits schreibe ich auf Englisch.“ · „Vergiss das wieder.“

**Sich anpassen lassen**
> „Mach die Blase grüner.“ · „Sprich etwas langsamer.“

## 7. Die Ampel: was Julia darf

Jede Aktion hat eine Farbe. Das steht nicht nur im Prompt, die Software prüft es selbst.

| | Was passiert | Beispiele |
|---|---|---|
| 🟢 **Grün** | Julia macht es einfach. | Lesen, Screenshots, Programme öffnen, Dateien in deinen Arbeitsordnern |
| 🟡 **Gelb** | Julia sagt in einem Satz, was passiert, und wartet auf dein **Ja**. | Mails senden, Software installieren, Dateien anderswo ändern, Papierkorb |
| 🔴 **Rot** | Niemals, auch nicht auf Anweisung. | Passwörter oder Kartendaten eintippen, Anmeldungen, Zahlungen, endgültig löschen |

Ein Ja gilt immer nur für genau eine Aktion. Sagst du „zieh das durch“, legt Julia den ganzen
Auftrag einmal vor und arbeitet danach die genannten Schritte ohne Einzelfrage ab.

Was in Mails, Dateien oder auf Webseiten steht, ist für Julia nie ein Auftrag – nur du gibst
Anweisungen.

## 8. Updates

Julia sucht auf Wunsch selbst nach neuen Versionen (Tray-Menü → **Nach Updates suchen**, oder frag
sie einfach). Sie installiert ein Update erst nach deinem Ja, erst wenn die laufende Aufgabe fertig
ist, und nur, wenn die Prüfsumme des Installers stimmt.

## 9. Deinstallieren

*Windows-Einstellungen → Apps → Installierte Apps → Julia AI → Deinstallieren.*

Deine Einstellungen, das Gedächtnis und das Protokoll bleiben in `%APPDATA%\Julia` liegen, falls du
Julia später wieder installierst. Wenn du alles loswerden willst, lösch diesen Ordner danach von
Hand.

## 10. Wenn etwas nicht klappt

| Problem | Lösung |
|---|---|
| Windows blockiert den Installer | *Weitere Informationen* → *Trotzdem ausführen* (siehe oben). |
| „Der API-Schlüssel wurde abgelehnt“ | Schlüssel in den Einstellungen neu einfügen; prüfen, ob beim Anbieter Guthaben da ist. |
| „Modell nicht gefunden (404)“ | In den Einstellungen *Modelle laden* und ein Modell aus der Liste wählen. |
| Julia hört nicht auf „Hey Julia“ | In den Einstellungen einschalten und ein Mikrofon als Standard-Aufnahmegerät wählen. |
| Das Overlay erscheint nicht im Spiel | Das Spiel auf „Randloses Fenster“ statt „Exklusives Vollbild“ stellen. |
| Windows fragt nach der Firewall | Beim Handy im WLAN: nur **Private Netzwerke** erlauben. |
| „Tageslimit erreicht“ | Die Kostenbremse hat gegriffen. Morgen geht es weiter, oder das Limit in den Einstellungen erhöhen. |

Alles, was Julia mit Gelb gemacht hat, steht im Protokoll (Tray-Menü → **Protokoll öffnen**).
