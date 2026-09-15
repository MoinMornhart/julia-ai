# Wie Julias Minecraft-Spiel programmiert ist

Diese Doku erklärt die **Technik dahinter**: wie im Code umgesetzt ist, dass Julia
als eigene Figur Minecraft (Java Edition) spielt. Für die Bedienung siehe
[Mit Julia Minecraft spielen](minecraft-spielen.md).

## Grundidee: zwei Ebenen

Julia spielt mit zwei getrennten Ebenen, weil eine KI für die schnellen Sachen
(kämpfen, ausweichen) zu langsam und zu teuer wäre:

1. **Schnelle Reflexe** – normaler JavaScript-Code, läuft **20-mal pro Sekunde**.
2. **Langsamer Kopf** – die KI (Claude) setzt die **Ziele** und ruft Werkzeuge auf.

## Der Körper: mineflayer

Die Klasse `Minecraft` in [`src/main/minecraft.js`](../src/main/minecraft.js)
(erweitert `EventEmitter`) baut in `verbinden()` mit **mineflayer** einen echten
Java-Client auf:

```js
const bot = mineflayer.createBot({ host, port, ...anmeldung, version });
bot.loadPlugin(pf.pathfinder);
await new Promise((ok, nein) => { bot.once('spawn', ok); /* + kicked/error/end */ });
```

Für den Server ist das ein Spieler wie jeder andere – keine Cheats, keine
Server-Mods. Sie sieht nur, was ein normaler Spieler sieht. Das Laufen übernimmt
**mineflayer-pathfinder**: ein Ziel setzen (`GoalNear`, `GoalFollow`, `GoalBlock`)
und die Wegfindung steuert Springen und Ausweichen selbst.

Server-Auflösung (SRV-Einträge, Schutzdienste, Heimnetz-Beschränkung) macht
`zielFinden()` / `adressePruefen()` vor dem Verbinden.

## Die Reflex-Schleife: `_tick()`

`_einrichten(bot)` hängt sich an das Spiel-Ereignis `physicsTick` (20×/Sekunde):

```js
bot.on('physicsTick', () => { this.ticks++; try { this._tick(); } catch (e) { … } });
bot.on('chat',       (von, text) => this._chat(von, text));
bot.on('death',      () => this._gestorben());
bot.on('entityDead', (e)  => this._tot(e));      // u. a. Enderdrache besiegt
bot.on('end',        (grund) => /* Crash-Screen + evtl. Wiederverbinden */);
```

`_tick()` ist das „Rückenmark": Gefahr vor sich prüfen (`_gefahrWache` → Lava,
Abgrund), automatisch essen bei Hunger/wenig Leben, und den **aktuellen Auftrag**
(`this.auftrag`) weiterführen. Das Kämpfen läuft komplett hier, ohne KI:
`_kampf`, Bedrohungsauswahl `_bedrohung`, Creeper auf Abstand `_creeper`, Rückzug
`_zurueckziehen`. Weil das im selben Takt wie das Spiel läuft, reagiert sie sofort.

## Chat verstehen: `befehlLesen()` → `aufgabe()`

Chat-Nachrichten laufen durch `_chat(von, text)`. Dort sitzt das **Rechte-Gating**:
Besitzer immer, sonst nur, wenn der Spieler in der Erlaubnisliste `erlaubte` steht
(oder `jeder` an ist). Umstellen darf nur der Besitzer (`hoerModus`, `hoerName`).

Danach wird der Text geparst:

- `anrede(text, namen)` – meint „Julia" (irgendwo im Satz) oder „!" die Figur?
- `befehlLesen(text, namen)` – Regex-Parser Text → Aufgabe-Objekt, z. B.
  `!bau ab holz 10` → `{ aufgabe: 'abbauen', block: 'holz', anzahl: 10 }`.
- `frageLesen(text, namen)` – sonst eine Frage → Event `frage` an die KI.

`aufgabe({ aufgabe, … })` verteilt an die Methode: `_abbauen`, `_herstellen`,
`_schmelzen`, `_jagen`, `_bauen`, `_einsteigen`, `_verstauen`, `_schlafen` … Jede
startet einen async-Job und merkt ihn in `this.auftrag`, den `_tick()` weiterführt.

## Der Kopf: die KI ruft Werkzeuge

Am Ende der Datei steht `WERKZEUGE` – die Funktionen, die **Claude** aufrufen darf:
`minecraft_beitreten`, `minecraft_aufgabe`, `minecraft_umsehen`,
`minecraft_fortschritt`, `minecraft_logbuch`, `minecraft_trennen` … Bei einem freien
Auftrag oder `!spiel durch` sendet `_chat` ein `frage`-Event; in
[`src/main/main.js`](../src/main/main.js) landet das über `minecraftFrage()` bei
`agent.senden(…, { kanal: 'minecraft' })`. Die KI überlegt die Schritte und ruft die
Werkzeuge – ausgeführt wird wieder über Figur + Wegfindung. So bleibt es günstig und
trotzdem klug.

## Durchspielen: der Tech-Baum

[`src/main/minecraft-plan.js`](../src/main/minecraft-plan.js) ist eine reine,
testbare Liste `SPIELPLAN` mit 22 Etappen (Holz → Stein → Eisen → Diamant → Nether
→ Enderdrache). Jede Etappe hat eine `pruef(z)`-Funktion, die im Zustand
`z = { items, dimension, dracheBesiegt }` nachschaut. `fortschritt(z)` liefert die
erreichten Etappen, die aktuelle und den Prozentwert.

Wichtig: der Fortschritt ist **monoton** – erreicht ist alles bis zur höchsten
erfüllten Etappe. Sonst würden dimensionsabhängige Etappen (Nether/End) wieder
„falsch", sobald man weiterzieht. Den Zustand `z` baut `spielZustand()` in der
Minecraft-Klasse aus dem echten Inventar und `bot.game.dimension`.

## Gedächtnis: das Logbuch

[`src/main/minecraft-logbuch.js`](../src/main/minecraft-logbuch.js) ist eine kleine
`Logbuch`-Klasse. `eintrag(art, text, extra)` schreibt **sofort** mit
`appendFileSync` eine Zeile JSON in die Tagesdatei
(`%APPDATA%\Julia\minecraft-logbuch\minecraft-JJJJ-MM-TT.jsonl`) – deshalb übersteht
es einen Absturz. `_melden()` in der Minecraft-Klasse schreibt jedes Ereignis dort
hinein; `zusammenfassung()` fasst einen Tag zusammen.

## Verdrahtung in `main.js`

In [`src/main/main.js`](../src/main/main.js) wird alles zusammengesteckt:
`new Minecraft({ logbuch })`, die Ereignisse (`ereignis`, `frage`, `einstellung`)
gehen an Benachrichtigungen, den Agenten und die Konfiguration, und die IPC-Handler
(`mc:*`, `minecraft:logbuchOeffnen`) bedienen die Minecraft-Oberfläche im
Chat-Fenster ([`src/renderer/mc.js`](../src/renderer/mc.js)).

## Getestet

Die Logik ist ohne echten Server testbar (Fake-Bot, Fake-fetch): siehe
[`test/minecraft.test.js`](../test/minecraft.test.js),
[`test/minecraft-plan.test.js`](../test/minecraft-plan.test.js) und
[`test/minecraft-logbuch.test.js`](../test/minecraft-logbuch.test.js).

**Kurz:** mineflayer + Wegfindung sind der Körper, `_tick()` die Reflexe,
`befehlLesen`/`aufgabe` die Motorik, die Werkzeuge + der Tech-Baum der Kopf, das
Logbuch das Gedächtnis.
