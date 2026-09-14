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
| ✅ 0.3.0 | Handy über eigenen Telegram-Bot (in 0.9.3 wieder entfernt – kein Telegram gewünscht) |
| ✅ 0.4.0 | Eigener Name für die KI, ihre Form und deine Pronomen – Namen gegen Prompt-Tricks geprüft |
| ✅ 0.5.0 | Gaming-Overlay: kleines Chatfenster über dem Spiel, Freigaben darin, Antworten auf Sprachbefehle passiv eingeblendet |
| ✅ 0.6.0 | Erinnerungen und Timer: Meldung, Chat, Vorlesen; verpasste werden nachgeliefert |
| ✅ – | Webseite mit Live-Vorführung, Ampel, Funktionen und Versionen ([live](https://moinmornhart.github.io/julia-ai-web/), Quelle in `site/index.html`) |
| ✅ 0.7.0 | Kostenbremse: Tageslimit für API-Kosten, Warnung bei 80 %, Stopp auch mitten im Auftrag |
| ✅ 0.7.1 | Protokoll als Prüfsummen-Kette; Release nur mit grünen Tests und ohne bekannte Lücken ab Stufe „high" |
| ✅ 0.8.0 | „Hey <Name>" als Aktivierungswort – standardmäßig aus, nur lokal, pausiert beim eigenen Sprechen |
| ✅ 0.9.0 | Passwortfelder, Passwortmanager, Messenger und private Browserfenster werden im Screenshot geschwärzt, bevor das Bild den PC verlässt |
| ✅ 0.9.1 | Schutz gegen Datenabfluss nach fremden Inhalten, unsichtbare Zeichen entfernt, heruntergeladene Programme ROT, Updates ohne Installationsskripte |
| ✅ 0.9.2 | Gedächtnis mit Herkunft: nach fremden Inhalten nur mit deinem Ja |
| ✅ 0.9.3 | Telegram-Anbindung ausgebaut |
| ✅ 1.0.0 | Installer (Julia-AI-Setup.exe) und öffentliche Webseite mit Prüfsumme; Updates der installierten Fassung aus den Releases, geprüft per SHA-512; Electron Fuses (kein RunAsNode, keine NODE_OPTIONS, nur geprüftes ASAR) |
| ✅ 1.1.0 | Handy im WLAN: Web-App im Handy-Browser, HTTPS mit eigenem Zertifikat, Kopplung per QR-Einmal-Code, nur ein Gerät (PC kennt nur den Hash des Schlüssels), nur Heimnetz, Schutz gegen DNS-Rebinding, Sperre nach Fehlversuchen, Freigaben per Knopf |
| ✅ 1.2.0 | Jeder Anbieter: Anthropic, OpenAI, Gemini, Mistral, Groq, OpenRouter, Ollama, LM Studio, eigene OpenAI-kompatible Adresse – Schlüssel je Anbieter verschlüsselt, Modelle laden, eigenes Werkzeug `webseite_abrufen` ohne Zugriff aufs Heimnetz. Dazu versteckt das Claude-Abo über Claude Code (nur eigener Gebrauch): eingebaute Werkzeuge aus, nur Julias Werkzeuge über lokalen MCP-Zugang |
| ✅ 1.3.0 | Neues Hauptfenster mit Seitenleiste und Startseite: Begrüßung, Schnelleingabe, Vorschläge, Kacheln für Termine, Posteingang (nur Absender und Betreff), Erinnerungen, PC-Zustand und Kosten, Tagesbriefing per Knopf |
| ✅ 1.4.0 | Gesprächsverlauf: jedes Gespräch DPAPI-verschlüsselt auf dem PC, ohne Screenshots; Suche, Vorschau, Fortsetzen (dann gilt sofort der Schutz gegen Datenabfluss), Löschen mit zweitem Klick |
| ✅ 1.5.0 | Routinen und Schnellaktionen: eigene Abläufe mit bis zu zwölf Schritten, Beispiele „Feierabend“, „Fokus“, „Zocken“; jeder Durchlauf wird einmal per auftrag_vorlegen freigegeben, ROT bleibt ROT |
| ✅ 1.6.0 | Dateien in den Chat ziehen (Text, Bilder ohne Metadaten, PDFs mit Claude) und Hotkey für markierten Text mit Menü am Mauszeiger; Zwischenablage wird wiederhergestellt; beides gilt als fremder Inhalt; Kopieren-Knopf an jeder Antwort |
| ✅ 1.7.0 | Blase mit Untertiteln (was du sagst, darunter die Antwort) und frei verschiebbar: nur die Kugel ist greifbar, Position wird gemerkt, Doppelklick öffnet den Chat |
| ✅ 1.8.0 | Gaming-Clips: Hotkey, Knopf oder „Clip das!“ löst Game Bar, NVIDIA oder AMD aus; Clip-Ansicht mit Vorschau, Player, Umbenennen, Im Ordner zeigen, Papierkorb; Hinweis mit Knopf, wenn die Windows-Hintergrundaufnahme aus ist |
| ✅ 1.9.0 | Mikrofon und Lautsprecher wählbar (eigene WinMM-Anbindung, weil System.Speech nur das Standardgerät kennt), „Stimme testen“, Rückfall auf das Standardgerät; „Hey Julia“ startet nach Aussetzern selbst neu |
| ✅ 2.0.0 | Code-Reiter: Projekte mit Zweig, voraus/zurück, Änderungen mit farbigem Diff, letzte Commits, erkannte Skripte; Knöpfe für Erklären, Prüfen, Tests, Beheben, Commit-Text – der Reiter liest nur, Änderungen laufen über den Chat und die Ampel |
| ✅ 3.2.0 | Overlay im Spiel greifbar: Maus darüber zum Scrollen, Klick hinein zum Tippen, Klick ins Spiel macht es wieder durchlässig |
| ✅ 3.1.0 | Gaming-Overlay erscheint von selbst, sobald ein Spiel im Vordergrund läuft (Steam, Epic, Riot, Battle.net, EA, Ubisoft, GOG, Xbox, Minecraft, eigene Liste), passiv und ohne Fokus-Klau |
| ✅ 3.0.0 | Eigene Aktivierungswörter statt „Hey Julia" (eins pro Zeile, höchstens acht, geprüft) – am PC und im Minecraft-Voice-Chat |
| ✅ 2.9.0 | Minecraft Simple Voice Chat (Testversion): Julia hört im Voice-Chat nur ihrem Besitzer zu, erkennt „Hey Julia …" und antwortet mit Stimme im Spiel statt über den PC; 2.5 (CBC) und 2.6 (GCM) |
| ✅ 2.8.0 | Mehrere PCs abgleichen: Gespräche, Gedächtnis, Routinen und Erinnerungen direkt von PC zu PC, gekoppelt per Code mit gegenseitigem Beweis, festgehaltenem Zertifikat und Grabsteinen für Gelöschtes |
| ✅ 2.7.0 | Handy auch von unterwegs: über Tailscale oder das FritzBox-VPN, Kopplung über die VPN-Adresse, kein offener Port |
| ✅ 2.6.0 | Outlook verbinden (Outlook.com, Hotmail, Microsoft 365): Mail, Kalender und Kontakte über Microsoft Graph, Anmeldung im Browser mit PKCE, eigene Werkzeuge outlook_* neben Google |
| ✅ 2.5.0 | Mit Julia im Minecraft-Chat reden (Antwort in den Spielchat, nur vom eigenen Spielernamen, von dort nur Handgriffe im Spiel) und „Hey Julia“ direkt im Minecraft-Reiter einschalten |
| ✅ 2.4.0 | Minecraft-Reiter: Julia spielt als eigene Figur mit (folgen, beschützen, Duell, abbauen, Chat), optional mit eigenem Microsoft-Konto per Code-Anmeldung; große öffentliche Netzwerke gesperrt |
| ✅ 2.2.0 | „Allem zustimmen" in den Einstellungen: einmal bestätigen, danach keine Rückfragen bei GELB; ROT bleibt gesperrt, Schutzfragen nach fremden Inhalten bleiben |
| ✅ 2.1.0 | Hinweis oben auf jedem Bildschirm, solange Julia hinsieht oder steuert (Akzentfarbe, Stopp-Knopf, vor Aufnahmen geschützt); Blasen-Untertitel zeigen den ganzen Text |

## Als Nächstes

| | Idee | Aufwand | Nutzen | Ampel / Sicherheit |
|---|---|---|---|---|
| 🔨 | **Spielhilfe** – Tipps per Blick auf den Bildschirm, einfache Schritte in Einzelspieler-Spielen übernehmen | M | mittel | Online-Spiele mit Anti-Cheat ROT (Bann-Gefahr); keine Echtzeit-Steuerung |
| 📋 | **Signierter Installer** – Code-Signing-Zertifikat, damit SmartScreen nicht mehr warnt | S | mittel | Braucht ein Zertifikat auf deinen Namen |
| 📋 | **Weitere Mail-Konten** über IMAP/SMTP (GMX, web.de, Outlook, iCloud) mit App-Passwort | M | hoch | Passwort gibst du selbst in den Einstellungen ein, Julia tippt es nie; verschlüsselt im Tresor; Senden GELB |
| 📋 | **MCP-Erweiterungen** – beliebige Dienste (Notion, Spotify, Home Assistant, GitHub …) über lokale MCP-Server | L | hoch | Jedes Werkzeug standardmäßig GELB, nur ausdrücklich lesende GRÜN; Server nur aus Liste, die du bestätigst |

## Sicherheit – geplant

| | Maßnahme | Warum |
|---|---|---|
| 📋 | **Signierte Update-Tags** (`git verify-tag` mit SSH-Signatur, erlaubte Schlüssel im Repo) | Heute vertraut das Update dem GitHub-Konto. Mit Signatur spielt Julia nur Stände ein, die mit deinem Schlüssel signiert sind. Braucht einmalig einen Signierschlüssel von dir. |

## Weitere Ideen

| | Idee | Aufwand | Nutzen | Ampel |
|---|---|---|---|---|
| 💡 | Morgen-Briefing auf Nachfrage: Termine, ungelesene Mails, Wetter | S | hoch | GRÜN, nur auf Anfrage |
| 💡 | Medien steuern (Pause, weiter, lauter) über Medientasten | S | mittel | GRÜN |
| 💡 | Routinen, die du selbst anlegst („Feierabend": Programme schließen, Musik an) | M | mittel | jede Routine einmal freigeben, einzelne GELB-Schritte bleiben GELB |
| 💡 | Gaming-Modus: leise, nur Overlay, keine Sprachausgabe | S | mittel | GRÜN |
| 💡 | Kostenanzeige pro Gespräch und Monat | S | mittel | — |

## Was du selbst tun musst

Ein paar Dinge kann Julia nicht für dich erledigen, weil sie Konten oder Schlüssel betreffen:

- **Anthropic-API-Schlüssel** in den Einstellungen eintragen – ohne ihn antwortet Julia nicht.
- **Google:** einmalig einen OAuth-Client anlegen ([Anleitung](google-einrichten.md)).

## Aus der Recherche (September 2026)

Verglichen wurden Siri/Apple Intelligence, Gemini Live, Copilot unter Windows (Vision, Recall,
Click to Do), Alexa+, ChatGPT-Agent, Claude, Raycast, Home Assistant, Nvidia G-Assist, Xbox
Game Bar, Steam- und Discord-Overlay sowie Open-Source-„Jarvis"-Projekte, dazu die aktuellen
Veröffentlichungen zur Sicherheit von KI-Agenten.

**Die zwei wichtigsten Erkenntnisse:**

1. **Die „tödliche Dreifaltigkeit"** ([Simon Willison](https://simonwillison.net/2025/Jun/16/the-lethal-trifecta/),
   [Meta „Rule of Two"](https://ai.meta.com/blog/practical-ai-agent-security/)): Ein Agent, der private Daten
   liest, fremde Inhalte sieht *und* nach außen wirken kann, lässt sich zum Datenabfluss bringen.
   Julia hat alle drei. Die Antwort darauf: Sobald fremde Inhalte im Gespräch sind, wird jede
   Aktion nach außen GELB.
2. **Prompt Injection ist nicht vollständig lösbar.** Veröffentlichte Abwehrmethoden wurden zu
   über 90 % umgangen ([arXiv 2510.09023](https://arxiv.org/abs/2510.09023)); OpenAI und Anthropic sagen
   selbst, dass es ein Restrisiko bleibt. Wirksamer als Filtern ist, einzuschränken, was ein
   getäuschtes Modell überhaupt tun kann – genau das ist Julias Ampel.

### Sicherheit – Stand und Plan

| | Maßnahme | Quelle |
|---|---|---|
| ✅ 0.9.1 | **Nach fremden Inhalten wird „nach außen" GELB:** Links öffnen, Netzwerk-Befehle (`ping`, `nslookup`, `Resolve-DnsName` – DNS kann Daten tragen) | [Willison](https://simonwillison.net/2025/Jun/16/the-lethal-trifecta/), [Brave zu Comet](https://brave.com/blog/comet-prompt-injection/) |
| ✅ 0.9.1 | **Unsichtbare Zeichen aus fremden Inhalten entfernen** (Unicode-Tag-Zeichen, Richtungswechsel) – damit wurden Befehle versteckt | [Spotlighting](https://arxiv.org/pdf/2403.14720), [Brave](https://brave.com/blog/unseeable-prompt-injections/) |
| ✅ 0.9.1 | **Heruntergeladene Programme starten ist ROT** (Mark-of-the-Web) | [ZombAIs](https://embracethered.com/blog/posts/2024/claude-computer-use-c2-the-zombais-are-coming/) |
| ✅ 0.9.1 | **Updates mit `npm ci --ignore-scripts`**, nur Electrons eigenes Installationsskript läuft – Lieferketten-Würmer verbreiten sich über Installationsskripte | [CISA zu Shai-Hulud](https://www.cisa.gov/news-events/alerts/2025/09/23/widespread-supply-chain-compromise-impacting-npm-ecosystem) |
| ✅ 0.9.0 | **Passwortmanager, Messenger und private Browserfenster** im Screenshot komplett schwärzen – Recalls reiner Textfilter hat versagt | [Tom's Hardware](https://www.tomshardware.com/software/windows/microsoft-recall-screenshots-credit-cards-and-social-security-numbers-even-with-the-sensitive-information-filter-enabled) |
| ✅ | Freigaben zeigen die echten Parameter (vollständiger Mailtext, ungekürzter Befehl), nicht die Zusammenfassung des Modells | [MCP-Sicherheitsleitfaden](https://modelcontextprotocol.io/docs/2026-07-28/tutorials/security/security_best_practices) |
| ✅ | Julia kann ihre eigenen Freigaben nicht bestätigen: Solange eine Freigabe offen ist, läuft kein Werkzeug | – |
| ✅ | Keine externen Bilder im Chat, strenge CSP – EchoLeak zog Daten über automatisch geladene Bilder ab | [EchoLeak](https://arxiv.org/abs/2509.10540) |
| ✅ | Electron-Berechtigungen standardmäßig abgelehnt, `openExternal` nur für sichere Protokolle | [Electron-Checkliste](https://www.electronjs.org/docs/latest/tutorial/security) |
| 📋 | Julias eigene Fenster per `WDA_EXCLUDEFROMCAPTURE` aus Screenshots, Streams und OBS heraushalten; wichtige Freigaben mit Windows Hello bestätigen | [SetWindowDisplayAffinity](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setwindowdisplayaffinity) |
| ✅ 0.9.2 | Gedächtnis mit Herkunft: Was während fremder Inhalte gemerkt werden soll, erst nach Bestätigung | [Studie](https://arxiv.org/pdf/2506.17318) |
| 📋 | Plan zuerst: Die Werkzeugfolge steht nach der Anfrage fest, fremde Inhalte können sie nicht erweitern (vereinfachtes CaMeL) | [CaMeL](https://simonwillison.net/2025/Apr/11/camel/) |
| 📋 | Signierte Tags mit fest hinterlegtem Schlüssel, keine Downgrades außer beim Rückweg | [CVE-2024-39698](https://github.com/advisories/GHSA-9jxc-qjr9-vjxq) |
| 📋 | Für MCP: nur lokale Server, Version fest, Tool-Beschreibungen hashen (Schutz gegen nachträglich getauschte Tools), Präfix pro Server | [Invariant Labs](https://invariantlabs.ai/blog/mcp-security-notification-tool-poisoning-attacks) |
| 📋 | „Alles widerrufen"-Knopf für alle Konten; DPAPI schützt nicht gegen Schadsoftware unter demselben Nutzer | [safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage) |
| 📋 | Injection-Tests mit vergifteten Mails, Webseiten und Einladungen | [promptfoo](https://www.promptfoo.dev/blog/lethal-trifecta-testing/) |
| ✅ 1.0.0 | Electron Fuses und ASAR-Integrität im Installer | [Electron Fuses](https://www.electronjs.org/docs/latest/tutorial/fuses) |

### Funktionen – Ideen

| Idee | Vorbild | Aufwand | Nutzen | Ampel |
|---|---|---|---|---|
| **Markieren und handeln:** Hotkey, Bereich aufziehen, „zusammenfassen", „übersetzen", „als Termin" | Copilot Click to Do | M | hoch | GRÜN, nur der Ausschnitt geht raus |
| **Markierter Text als Kontext:** „schreib das freundlicher" wirkt auf die Markierung | Raycast | S | hoch | nur auf Befehl |
| **Folgefragen ohne Weckwort** (kurzes Nachhör-Fenster, „Danke Julia" beendet) | Alexa+, Copilot | S | mittel | Mikrofon sichtbar |
| **Natürliche Offline-Stimme** (Piper, deutsche Stimme „Thorsten") | Home Assistant | M | hoch | lokal, als eigener Prozess (GPL) |
| **Reinsprechen unterbricht das Vorlesen** | Gemini Live | M | mittel | – |
| **Live-Modus:** Gespräch, während Julia ein Fenster mitsieht | Gemini Live, Copilot Vision | L | hoch | Leuchtrahmen, nur ein Fenster, Kostenbremse |
| **Persönlichkeits-Regler** (Butler, Coach, knapp) | ChatGPT | S | mittel | darf die Ampel nie berühren |
| **Gedächtnis-Übersicht** zum Ansehen und Bearbeiten | ChatGPT Memory | S | hoch | – |
| **Eigene Sprachbefehle** („Streaming-Modus" = feste Befehlsfolge) | Siri App Intents | S | hoch | ohne Rückfrage nur, wenn alles GRÜN |
| **Spiel erkennen und Tipps aus dem Wiki** | Xbox Gaming Copilot | M | hoch | in Online-Spielen keine Eingabe-Automatisierung (Anti-Cheat) |
| **Notizen pro Spiel** per Stimme im Overlay | Steam Notes | S | mittel | GRÜN |
| **„Warum ruckelt es?"** – CPU, GPU, Temperaturen, Hintergrundlast erklären | Nvidia G-Assist | M | mittel | GRÜN |
| **PC-Tuning per Sprache** (Energieplan, HDR) | G-Assist | M | mittel | GELB, nur feste Aktionen, kein freies PowerShell |
| **Knöpfe über UI Automation statt Pixelklicks** | Copilot Actions | M | hoch | weniger Bildinhalt = weniger Angriffsfläche |
| **Übernahme-Modus:** Julia pausiert, du loggst dich ein, Julia macht weiter | ChatGPT Agent | S | hoch | passt zu ROT „Logins" |
| **Rückgängig-Knopf** für Dateiaktionen je Auftrag | – | M | hoch | – |
| **Teilbare Themes** als JSON | Raycast | S | mittel | kein CSS/JS, sonst Code-Einschleusung |
| **Home Assistant** mit ausgewählten Geräten | HA Assist | M | hoch | Schlösser, Garage, Heizung GELB |
| **Eigene Skripte als Werkzeuge** | HA Scripts | S | hoch | an Prüfsumme gebunden, jede Änderung neu freigeben |

### Was bei anderen schiefging

- **Recall:** Die Datenbank lag anfangs im Klartext, der Filter übersah Kreditkartennummern. Lehre: keinen dauerhaften Bildschirmverlauf speichern. ([The Register](https://www.theregister.com/security/2025/08/01/microsoft-recall-can-still-nab-credit-cards-passwords-info/971447))
- **EchoLeak:** Eine einzige Mail reichte, ohne Klick; der Abfluss lief über automatisch geladene Bilder einer erlaubten Domain. ([arXiv](https://arxiv.org/abs/2509.10540))
- **Kalendereinladungen bei Gemini:** Ein Einladungstitel steuerte Smart-Home-Geräte. Julia hat Kalenderzugriff – Termintitel gelten deshalb als fremde Inhalte. ([SafeBreach](https://www.safebreach.com/blog/invitation-is-all-you-need-hacking-gemini/))
- **ZombAIs:** „Lade das herunter und starte es" auf einer Webseite genügte, um einen Agenten Schadsoftware installieren zu lassen. ([Embrace The Red](https://embracethered.com/blog/posts/2024/claude-computer-use-c2-the-zombais-are-coming/))
- **postmark-mcp:** Eine Zeile Code setzte jede Mail in Blindkopie an den Angreifer. Erweiterungen nur durch dich in den Einstellungen, nie per Sprachbefehl. ([The Hacker News](https://thehackernews.com/2025/09/first-malicious-mcp-server-found.html))
- **Alexa strich die lokale Sprachoption:** Datenschutz technisch absichern, nicht über einen Schalter, der später verschwinden kann. Julias Sprache bleibt offline. ([TechCrunch](https://techcrunch.com/2025/03/15/amazons-echo-will-send-all-voice-recordings-to-the-cloud-starting-march-28))
