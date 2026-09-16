# Changelog

## 3.4.0 – 2026-09-16
- Geheimnisse (Passwörter/Schlüssel) lassen sich jetzt in den Einstellungen verwalten: nur verschlüsselt auf dem PC gespeichert, nach dem Speichern nicht mehr angezeigt, und die KI bekommt die Werte nie zu sehen

## 3.3.0 – 2026-09-16
- Neuer Boost-Tab mit System-Überblick: Arbeitsspeicher, Laufwerke, Betriebszeit, die größten Ressourcen-Fresser (nach RAM oder CPU) und ein Finder für doppelte Dateien – rein informativ, es wird nichts verändert oder gelöscht

## 3.2.0 – 2026-09-16
- Werkzeuge lassen sich jetzt in den Einstellungen einzeln abschalten: ein abgeschaltetes Werkzeug darf die KI nicht mehr benutzen und bekommt einen klaren Hinweis, dass es aus ist (Standard: alles an)

## 3.1.0 – 2026-09-16
- Neuer Selbstcheck der Oberfläche: bleibt ein Fenster nach dem Start leer oder ohne Layout, merkt Julia das, hält es im Logbuch fest und lädt die Oberfläche einmal automatisch neu

## 3.0.1 – 2026-09-16
- Läuft Julia schon im Hintergrund, öffnet ein erneuter Start jetzt zuverlässig das Fenster (und legt es notfalls neu an), statt scheinbar nichts zu tun

## 3.0.0 – 2026-09-16
- Werkzeug- und MCP-Aufrufe im Chat lassen sich jetzt aufklappen: ein Tipp auf { } zeigt als lesbares JSON, was genau mit welchen Parametern aufgerufen wurde – so ist nachvollziehbar, was im Hintergrund passiert

## 2.9.0 – 2026-09-16
- Unter dem Chat-Eingabefeld steht jetzt ein dezenter Hinweis, dass KI-Antworten Fehler enthalten können und wichtige Dinge geprüft werden sollten; ruft die KI ein nicht vorhandenes oder abgeschaltetes Werkzeug auf, bekommt sie das klar zurückgemeldet

## 2.8.1 – 2026-09-16
- Sicherheits-Update: die gemeldete Schwachstelle im Paket uuid ist geschlossen (auf eine geprüfte, sichere Version angehoben), ohne Downgrade anderer Pakete – npm audit meldet keine Lücken mehr

## 2.8.0 – 2026-09-16
- Fehler in der Oberfläche werden jetzt protokolliert: bleibt ein Fenster leer oder lädt die UI nicht, landet der zugrunde liegende Fehler im Start-Logbuch, damit sich so ein Problem nachvollziehen lässt (bleibt lokal auf dem PC)

## 2.7.1 – 2026-09-16
- Julia erholt sich jetzt auch von wiederholten Grafik-/Renderer-Abstürzen nach dem Start selbst: sie stellt automatisch auf Software-Grafik um und startet neu, statt mit einem toten Fenster hängenzubleiben

## 2.7.0 – 2026-09-16
- Der Chat stellt Tabellen jetzt richtig dar: Markdown-Tabellen mit senkrechten Strichen werden sauber als Tabelle mit Spalten-Ausrichtung gerendert, statt nur als Textzeilen

## 2.6.0 – 2026-09-16
- Zeitlimit für Shell-Befehle ist jetzt in den Einstellungen selbst einstellbar (Standard und Maximum); das Maximum begrenzt jeden Befehl, damit hängende Konsolen-Befehle sicher abbrechen statt endlos zu laufen

## 2.5.0 – 2026-09-16
- Julia merkt sich Modelle, die keine Bilder verstehen: meldet ein Anbieter Vision-Deaktiviert, schickt sie diesem Modell keine Screenshots mehr und wiederholt den Schritt automatisch ohne Bild, statt am selben Fehler zu scheitern

## 2.4.0 – 2026-09-16
- Die Anweisungen und der System-Prompt der KI laufen jetzt intern einheitlich auf Englisch; für dich bleibt alles gleich, Julia antwortet weiter in deiner App-Sprache

## 2.3.1 – 2026-09-16
- Update installiert jetzt zuverlässig über eine laufende Version: der Installer beendet eine geöffnete Julia samt Hintergrundprozessen hart und zeigt keinen hängenden Bitte-schliessen-Dialog mehr, damit auch das automatische Update durchläuft

## 2.3.0 – 2026-09-16
- Julia erkennt in Minecraft jetzt, wenn die Spielfigur einfriert (verbunden, aber ohne Reaktion), sichert ihren Zustand ins Logbuch und verbindet sich automatisch neu, statt endlos still zu stehen

## 2.2.0 – 2026-09-16
- Julia kann sich jetzt dauerhafte Lern-Notizen anlegen – als versteckte Dateien im Ordner .julia-memos in ihrem Arbeitsordner, damit sie sich Vorlieben, Projekt-Fakten und Lösungen merkt; in den Einstellungen unter Lernen an- und abschaltbar

## 2.1.0 – 2026-09-16
- Julia kann jetzt doppelte (inhaltsgleiche) Dateien in einem Ordner aufspüren und zeigen, wie viel Platz die Kopien unnötig belegen – rein lesend, gelöscht wird nichts

## 2.0.1 – 2026-09-16
- Julia bleibt in Minecraft nicht mehr an einer Stufe hängen – will sie laufen, kommt aber nicht vom Fleck, springt sie jetzt automatisch drüber und kommt beim Erkunden und Durchspielen flüssiger voran

## 2.0.0 – 2026-09-16
- Julia kann jetzt auch Dateien nach Namen finden – als Teiltext (config → config.js) oder als Muster mit Sternchen und Fragezeichen (z. B. *.test.js); ergänzt die Projekt-Textsuche

## 1.9.0 – 2026-09-16
- Julia kann jetzt schnell im Projekt nach Text suchen und bekommt nur die Fundstellen als datei:zeile zurück, statt viele Dateien einzeln zu lesen – das spart Zeit und Tokens (node_modules, .git und Build-Ordner werden übersprungen)

## 1.8.0 – 2026-09-16
- Neuer Nur-in-diesem-Ordner-Modus: schaltest du ihn ein und wählst einen Ordner, darf Julia Dateien nur dort lesen, schreiben, verschieben und auflisten – alles außerhalb ist gesperrt (Standard aus)

## 1.7.0 – 2026-09-16
- Einstellungen lassen sich jetzt durchsuchen: ein Suchfeld oben filtert die Abschnitte live nach Stichwort (z. B. Stimme, Blase, Diagnose), unabhängig von Groß-/Kleinschreibung und Umlauten

## 1.6.1 – 2026-09-16
- Installer und automatisches Update laufen jetzt auch, wenn Julia gerade geöffnet ist: der Assistent schließt eine laufende Julia vorher automatisch (erst sanft, dann notfalls hart), statt mit einem Datei-in-Benutzung-Fehler abzubrechen

## 1.6.0 – 2026-09-16
- PC-Steuerung: Julia führt jetzt ein lokales Leistungs-Logbuch (Dauer und eigener CPU-Verbrauch je Aktion, ohne Inhalte) – so lässt sich eine CPU-Spitze dem Verursacher zuordnen; an den Entwickler geht davon nur eine bereinigte Zusammenfassung, und nur bei eingeschalteter Diagnose

## 1.5.0 – 2026-09-16
- Handy-App gibt es jetzt als fertige Android-APK zum direkten Herunterladen und Installieren – GitHub baut sie automatisch (kein Expo-Konto nötig), du findest sie beim Release android-latest

## 1.4.3 – 2026-09-15
- Weniger CPU-/GPU-Last durch die Blase: die animierte Kugel läuft jetzt mit gedeckelter Bildrate (30 statt rund 60 Bilder pro Sekunde) – sieht gleich aus, spart aber spürbar Rechenleistung, wenn die Blase an ist

## 1.4.2 – 2026-09-15
- Klarere Meldung, wenn ein Modell ohne Bild-Unterstützung einen Screenshot bekommt: statt eines kryptischen Fehlers sagt Julia jetzt, dass das Modell keine Bilder versteht und man ein Bild-fähiges Modell wählen oder ohne Screenshots arbeiten soll

## 1.4.1 – 2026-09-15
- Abhängigkeiten aktualisiert: @anthropic-ai/sdk auf 0.126.0 und Electron auf 44.4.0 (kleinere, geprüfte Updates)

## 1.4.0 – 2026-09-15
- Julia prüft sich jetzt einmal pro Woche selbst: sie schaut ohne KI-Kosten ins Start-Logbuch, ob es zuletzt Abstürze oder Grafikprobleme gab, hält das fest und meldet es nur, wenn du die Diagnose-Meldung ausdrücklich eingeschaltet hast (bereinigt, ohne IP oder Tokens)

## 1.3.3 – 2026-09-15
- Eigene KI-Adresse funktioniert jetzt auch, wenn du die volle Endpunkt-URL einträgst (…/v1/chat/completions): Julia kürzt sie automatisch auf die Basis, damit der Aufruf nicht doppelt zusammengesetzt wird

## 1.3.2 – 2026-09-15
- Besserer Installer: statt der stillen Ein-Klick-Installation führt jetzt ein Assistent durch die Einrichtung – mit Zielordner-Auswahl, Lizenz und Verknüpfungen (wie bei größeren Programmen)

## 1.3.1 – 2026-09-15
- Reparatur-Start gegen schwarze Fenster: Julia lässt sich mit 'Julia AI.exe --reparatur' zwingend mit Software-Grafik starten, wenn die Grafikkarte beim Start Probleme macht

## 1.3.0 – 2026-09-15
- Neue opt-in Diagnose: Julia kann bei Grafik- oder Startproblemen einen rein technischen, bereinigten Bericht an VibeWork melden – niemals mit IP-Adressen, Tokens oder persönlichen Daten; einzuschalten unter Einstellungen → System, standardmäßig aus

## 1.2.2 – 2026-09-15
- Julia heilt einen Grafik-Absturz beim Start jetzt selbst: statt schwarzem Fenster stellt sie automatisch auf Software-Grafik um und startet einmal neu; crasht es auch damit, kommt eine klare Meldung statt einer Endlosschleife

## 1.2.1 – 2026-09-15
- Julia bleibt in Minecraft nicht mehr an Abgründen hängen: die Gefahrenwache friert sie nicht mehr mitten in der Wegfindung ein, sondern lässt den Pathfinder selbst um Lava und Abgründe herumlaufen

## 1.2.0 – 2026-09-15
- Julia kommt in Minecraft jetzt aus Löchern und zwei Blöcke hoch (sie setzt dafür Blöcke, statt deine Bauten abzureißen), verteidigt sich immer selbst gegen Monster und schläft zuverlässig – stellt notfalls ein Bett aus dem Inventar auf

## 1.1.2 – 2026-09-15
- Beim Abbauen lässt Julia jetzt Truhen, Öfen, Türen, Werkbänke, Betten, Glas, Fackeln und andere wertvolle oder gebaute Blöcke in Ruhe – sie reißt nicht mehr aus Versehen deine Bauten ab; nur wenn du genau diesen Block nennst, baut sie ihn ab, und sie sucht etwas näher statt quer durch die Basis

## 1.1.1 – 2026-09-15
- Die Spracherkennung versteht wieder genau: Julia schreibt mit der präzisen Beam-Suche auf (statt der schnellen, aber ungenauen Variante) und wartet am Satzende wieder etwas länger, damit sie dich nicht mitten im Satz abschneidet

## 1.1.0 – 2026-09-15
- Jarvis lässt sich jetzt auch per Sprache einschalten (sag einfach 'Jarvis', 'Julia' zurück); im Jarvis-Modus reicht 'Jarvis' als Weckwort und Julia spricht mit einer anderen, männlichen Stimme

## 1.0.1 – 2026-09-15
- Grafikkarte und Treiber werden beim Start ins Logbuch geschrieben, und es gibt jetzt eine CLAUDE.md mit Fehler-Journal und klaren Datenschutzregeln fürs Logging (nie IP oder Tokens)

## 1.0.0 – 2026-09-15
- Julia arbeitet jetzt auch mit deinen Apps Patchfeld, Codewerk und dem Content-Helper zusammen – Lern-Sessions starten, Fortschritt abfragen, Beiträge planen und Ideen holen, alles über die API deiner App

## 0.9.1 – 2026-09-15
- Deine eigenen Apps ToDoch, Streamo und VibeWork werden jetzt einheitlich mit Domain und Anmeldedaten/API-Key verbunden (vorher waren ToDoch und Streamo versehentlich an fremde Dienste angebunden)

## 0.9.0 – 2026-09-15
- Julia arbeitet jetzt auch mit VibeWork: sie legt auf Ansage Projekte an, lädt Leute zu einem Projekt ein und holt den letzten Commit – über die VibeWork-API, die du mit Adresse und Token in den Einstellungen verbindest

## 0.8.2 – 2026-09-15
- Die Aufgaben-App heißt jetzt überall richtig ToDoch (Einstellungen, Julias Antworten, Anleitung)

## 0.8.1 – 2026-09-15
- Die Streaming-App heißt jetzt überall richtig Streamo, die Apps-Karte in den Einstellungen ist übersichtlicher (Logos, Status, Öffnen-Knöpfe), es gibt einen Knopf zum direkten Öffnen des Minecraft-Logbuchs, und dazu eine Schritt-für-Schritt-Anleitung samt Entwickler-Erklärung, wie Julia Minecraft spielt

## 0.8.0 – 2026-09-15
- Julia arbeitet jetzt mit Todoist und Stremio zusammen (z. B. 'Füg Iron Man zu meiner Stremio-Liste hinzu'), spielt Minecraft auf Ansage eigenständig durch – mit Tech-Baum bis zum Enderdrachen und täglichem Logbuch, das Abstürze übersteht – hört im Spiel nur auf Leute, die du ihr nennst, und der Jarvis-Modus fühlt sich mit echtem HUD-Look und 'Sir'-Anrede wie J.A.R.V.I.S. an

## 0.7.0 – 2026-09-15
- Kleines Easter-Egg: Tippe 'jarvis' in den Chat für einen kompletten Jarvis-Look samt Sprechweise, 'julia' schaltet zurück; dazu aufgefrischte README mit sichtbarer Android-/iOS-App

## 0.6.0 – 2026-09-15
- Julia lässt sich jetzt mit der Android-App vom Handy aus bedienen – im Heimnetz oder über dein VPN, per Code gekoppelt; Anfragen laufen durch Julia samt Ampel, Freigaben erscheinen am PC

## 0.5.4 – 2026-09-15
- Julia lebt jetzt in einem einzigen Repository; der Handy-Zugang und das Proxmox-Relay sind entfernt, ein GPU-Absturz beim Start wird sicher abgefangen, und die Versionszählung beginnt neu
