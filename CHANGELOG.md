# Changelog

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
