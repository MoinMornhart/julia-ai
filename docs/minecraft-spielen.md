# Mit Julia Minecraft spielen

Diese Anleitung zeigt Schritt für Schritt, wie Julia als eigene Spielfigur zu dir
in Minecraft (Java Edition) kommt, wie du ihr Aufträge gibst und wie sie das Spiel
sogar eigenständig weiterspielt. Für Sprache und Aussehen der App gibt es die
[README](../README.md); hier geht es nur ums Spielen.

## Was Julia in Minecraft kann

- Als eigener Spieler auf deinem Server mitspielen (nicht als Cheat/Hack – ein
  ganz normaler Client wie du).
- Dir folgen, dich beschützen, gegen dich kämpfen, Sachen abbauen, craften,
  schmelzen, jagen, bauen, Boot fahren, schlafen.
- **Erkennen, was vor ihr liegt** (auch Lava oder ein Abgrund) und von selbst
  bremsen; **essen**, wenn sie Hunger hat; **klug kämpfen** (Rüstung anlegen, bei
  wenig Leben zurückziehen, Creeper auf Abstand halten).
- Auf Ansage **eigenständig durchspielen** – vom ersten Holz bis zum Enderdrachen.
- Alles in einem **täglichen Logbuch** festhalten, das einen Absturz übersteht.

## Was du brauchst

- Einen **Minecraft-Server (Java Edition)** – zu Hause auf deinem PC, im Heimnetz
  oder einen, dessen Adresse du selbst einträgst.
- Julia braucht **keinen** Mod und **kein** Plugin, um mitzuspielen. (Nur für den
  Voice-Chat muss auf dem Server *Simple Voice Chat* laufen – siehe unten.)

## Schritt 1 – Julia mit dem Server verbinden

1. Öffne in Julia den Reiter **Minecraft**.
2. Trage die **Serveradresse** ein (z. B. `localhost`, `192.168.1.20` oder
   `mein-server.de`). Den Port findet Julia meist selbst (auch über SRV-Einträge
   und Server-Schutz wie NeoProtect oder TCPShield); nur wenn nötig, trägst du ihn
   dazu.
3. Klick auf **Beitreten**. Kurz darauf steht Julias Spielfigur im Spiel.

> **Konto:** Auf Servern mit `online-mode=false` geht es ohne Anmeldung. Für
> normale Server verbindest du unter **Konto verbinden** Julias eigenes
> Java-Konto – die Anmeldung läuft im Browser über microsoft.com/link, Julia
> sieht dabei kein Passwort.

## Schritt 2 – Deinen Spielernamen eintragen

Damit Julia weiß, auf **wen** sie hört, trägst du im Minecraft-Reiter deinen
eigenen **Spielernamen** ein. Standardmäßig hört sie dann **nur auf dich**.

## Schritt 3 – Im Spiel mit ihr reden

Schreib im Spielchat einfach `Julia, …` – der Name darf irgendwo in der Nachricht
stehen, nicht nur am Anfang. Alternativ geht ein `!` vorne. Beispiele:

- `Julia, folge mir`
- `komm her julia`
- `!bau ab holz 20`
- `Julia, wo finde ich Diamanten?` (eine Frage – die Antwort kommt in den Chat)

## Befehle auf einen Blick

| Was | Im Spielchat | Was passiert |
|---|---|---|
| Folgen · Komm her | `!folge` · `!komm` | läuft dir nach oder einmal zu dir |
| Beschützen · Duell | `!beschütze mich` · `!duell` | kämpft gegen Monster bei dir oder gegen dich |
| Abbauen | `!bau ab holz 10` | baut Blöcke ab und sammelt sie ein |
| Gehe zu | `!geh 100 64 -20` | läuft zu Koordinaten |
| Geben | `!gib 5 brot` | bringt dir etwas aus dem Inventar |
| Einsammeln | `!sammel` | hebt herumliegende Sachen auf |
| Jagen | `!jag 3 kuh` | holt Essen von Tieren und sammelt es ein |
| Herstellen | `!craft 4 fackel` | craftet im Inventar oder an der Werkbank |
| Einräumen | `!verstau` | legt das Inventar in die nächste Truhe (Waffen, Werkzeug, Essen bleiben) |
| Schmelzen | `!schmelz 8 eisen` | schmilzt oder brät im Ofen, Brennstoff nimmt sie selbst |
| Hinstellen · Essen | `!stell werkbank hin` · `!ess` | stellt einen Block neben sich · isst etwas |
| Bauen | `!bau turm 8` · `!bau mauer 10 3` · `!bau hütte` · `!bau brücke 12` | baut aus vorhandenem Material |
| Boot & Reittier | `!steig ein` · `!steig aus` | steigt ein und wieder aus |
| Durchspielen | `!spiel durch` | arbeitet sich selbst Richtung Enderdrache |
| Zuhören steuern | `!hör auch auf NAME` · `!hör nur auf mich` | erlaubt einzelne Spieler / setzt zurück |
| Schlafen · Stopp | `!schlaf` · `!stopp` | geht ins Bett · hört sofort auf |

`!hilfe` nennt alle Befehle direkt im Spiel.

## Aufträge in eigenen Worten

Im Minecraft-Reiter kannst du Julia auch frei beauftragen, z. B.:

> „Hol Holz, bau eine Werkbank und mach dir eine Steinspitzhacke.“

Sie sieht sich um, plant die Schritte, arbeitet sie mit ihren Fähigkeiten ab,
wartet jeweils auf das Ergebnis und sagt am Ende, was geschafft ist.

## Eigenständig durchspielen & dabei lernen

Mit **`!spiel durch`** (oder „spiel weiter“) arbeitet sich Julia eigenständig
einen **Tech-Baum** entlang: Holz → Werkbank → Holz-/Steinwerkzeug → Ofen →
Kohle & Fackeln → Essen → Eisen → Diamant → Obsidian → Nether-Portal → Nether →
Lohenruten → Enderperlen → Enderaugen → End-Portal → **Enderdrache**.

Sie weiß dank der Fortschritts-Anzeige jederzeit, auf welcher Etappe sie steht und
was als Nächstes dran ist, und macht Etappe für Etappe weiter.

**Ehrlich:** Ein garantiertes Solo-Durchspielen bis zum Drachen ist nicht sicher –
Minecraft ist groß und voller Überraschungen. Aber sie **versteht den Weg**, macht
echte Fortschritte, und über das Logbuch wird sie nachvollziehbar besser.

### Das tägliche Logbuch

Alles, was beim Spielen passiert (Etappen, Funde, Tode, Fehler), schreibt Julia
**sofort** in ein Logbuch – eine Datei pro Tag:

```
%APPDATA%\Julia\minecraft-logbuch\minecraft-JJJJ-MM-TT.jsonl
```

Das überlebt einen Absturz: Auch wenn Julia oder der PC neu startet, ist der
Spieltag nicht verloren. Du kannst hinterher genau sehen, was geklappt hat und wo
sie hängen blieb. Im Chat geht das auch bequem:

> „Julia, lies das Minecraft-Logbuch“ (Zusammenfassung von heute)
> „Julia, lies das Minecraft-Logbuch, voll“ (alle Einträge des Tages)

Wenn etwas nicht rundläuft, ist genau diese `.jsonl`-Datei das, was am meisten
hilft, um den Ablauf zu verbessern.

## Auf andere Spieler hören

Standardmäßig hört Julia **nur auf dich**. Statt gleich alle freizugeben, nennst
du im Spiel einzelne Leute:

- `Julia, hör auch auf Peter und Anna` – ab jetzt hört sie auf dich **und** die Genannten
- `Julia, hör nicht mehr auf Peter` – nimmt jemanden wieder raus
- `Julia, hör nur auf mich` – zurück auf dich allein

Umstellen darf **nur der Besitzer** (dein eingetragener Spielername). Im Panel gibt
es zusätzlich den groben Schalter „auf alle hören“. In jedem Fall gilt: aus dem
Spiel heraus handelt Julia **nur im Spiel**, nie auf deinem PC.

## Mit Stimme reden (Voice-Chat, Testversion)

Läuft auf dem Server *Simple Voice Chat*, hört Julia dort mit und antwortet mit
Stimme im Spiel – sag „Hey Julia, …“. Sie hört nur auf deinen Spielernamen; andere
Stimmen verwirft sie sofort. Voice-Chat-Gruppen listet Julia auf; du wählst, in
welche sie geht (geschützte Gruppen mit Passwort – das geht nur an den Server, die
KI sieht es nie).

## Wenn sie vom Server fliegt

Der Minecraft-Reiter zeigt einen **Crash-Screen** mit klarem Grund, Zeit,
Spieldauer und der Aufgabe, die gerade lief. Nach einem reinen
Verbindungsabbruch versucht Julia dreimal von selbst, zurückzukommen; nach einem
Rauswurf nicht. Das Logbuch (siehe oben) bleibt in jedem Fall erhalten.

## Wie schafft Julia das eigentlich?

Damit du weißt, was im Hintergrund passiert – ganz ohne Cheats oder Server-Hacks:

- **Eigener, ganz normaler Spieler.** Julia meldet sich wie ein echtes Minecraft
  (Java Edition) am Server an – über die Bibliothek [mineflayer](https://github.com/PrismarineJS/mineflayer),
  die das Java-Protokoll spricht. Für den Server ist sie ein Spieler wie jeder
  andere; sie sieht nur, was ein normaler Spieler auch sieht.
- **Bewegung & Wegfindung.** Zum Laufen, Klettern und Ausweichen nutzt sie
  [mineflayer-pathfinder](https://github.com/PrismarineJS/mineflayer-pathfinder):
  Der sucht einen begehbaren Weg zum Ziel (Block, Spieler, Koordinate) und steuert
  die Figur dorthin – inklusive Springen und um Hindernisse herum.
- **Reflexe laufen lokal, 20-mal pro Sekunde.** Kämpfen, Essen, Gefahr erkennen
  (Lava/Abgrund/Creeper) und Zurückziehen passieren in einer schnellen Schleife
  direkt in Julia, im selben Takt wie das Spiel. Das muss sofort reagieren –
  dafür wäre die KI zu langsam und zu teuer.
- **Die KI gibt die Ziele vor, nicht jeden Mausklick.** Was sie tun soll
  („bau eine Werkbank“, „hol Eisen“, „spiel weiter“), entscheidet die KI und ruft
  dazu ihre **Minecraft-Werkzeuge** auf (umsehen, abbauen, herstellen, schmelzen,
  jagen, bauen …). Die eigentliche Ausführung übernehmen dann die Figur und die
  Wegfindung. So bleibt es günstig und trotzdem klug.
- **Der Fahrplan zum Durchspielen.** Für `!spiel durch` kennt Julia einen
  **Tech-Baum** (Holz → Stein → Eisen → Diamant → Nether → Enderdrache). Sie prüft
  per Werkzeug, auf welcher Etappe sie steht, erfüllt die aktuelle mit ihren
  Fähigkeiten und geht dann zur nächsten – Schritt für Schritt.
- **Gedächtnis über das Logbuch.** Jede Etappe, jeder Fund und jeder Fehler landet
  sofort im Tages-Logbuch. So geht bei einem Absturz nichts verloren, und man sieht
  hinterher genau, was lief – die Grundlage, um sie besser zu machen.

Kurz gesagt: mineflayer + Wegfindung sind Julias „Körper“ im Spiel, die schnellen
Reflexe laufen lokal, und die KI ist der „Kopf“, der Ziele setzt und den Fahrplan
abarbeitet.

> 🛠️ **Für Entwickler:** Wie das im Code aufgebaut ist (Dateien, Klassen, der
> Tick-Loop, die Werkzeuge, der Tech-Baum), steht in
> [Wie Julias Minecraft-Spiel programmiert ist](minecraft-technik.md).

## Grenzen & Sicherheit

- Von sich aus verbindet sich Julia nur mit Servern **auf deinem PC oder im
  Heimnetz**; einen Server im Internet trägst du selbst ein.
- Große öffentliche Netzwerke (z. B. Hypixel) sind **gesperrt** – dort sind Bots
  nicht erlaubt.
- Aus dem Spiel heraus steuert Julia ausschließlich ihre Spielfigur, **nie** etwas
  auf deinem Computer.
