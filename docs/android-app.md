# Julia für Android – Konzept (Issue #1)

Eine **eigenständige Android-App**, in der Julia als KI-Assistent auf dem Handy läuft.
**Nicht** dasselbe wie die Windows-App: kein Sehen und Steuern des PCs (das gibt es auf Android
technisch nicht). Es ist ein neues Produkt mit eigenem Code – deshalb ein eigener Plan.

## Ziel und Grenzen

**Ziel:** Mit Julia am Handy reden (Text und Sprache), Antworten bekommen, Kosten im Blick,
eigener Name/Charakter wie am PC. Läuft **für sich allein** – und kann sich **optional mit dem
PC verbinden** (siehe unten), um dort Julia zu bedienen.

**Zwei Betriebsarten:**
1. **Eigenständig (MVP):** Die App redet direkt mit dem KI-Anbieter, ganz ohne PC.
2. **Mit PC verbunden (späterer Ausbau):** Die App steuert die PC-Julia – Chat, Freigaben. Dafür
   braucht der PC wieder einen Verbindungspunkt (im Kern das entfernte Handy-Prinzip, aber gezielt
   für die App, im **Heimnetz/VPN**, **kein** öffentliches Relay). Bewusst als spätere Stufe, damit
   der Start schlank bleibt.

**Nicht dabei:**
- Keine Bildschirm-/Fenster-/Datei-Werkzeuge auf dem Handy selbst (Android lässt das nicht zu) –
  PC-Aktionen laufen nur im verbundenen Modus über die PC-Julia und deren Ampel.

## Tech-Stack (Empfehlung)

**Expo / React Native (JavaScript/TypeScript).** Gründe:
- Gleiche Sprache wie die Desktop-App – Prompt-Texte, Anbieter-Logik und die Ampel-Idee lassen
  sich übernehmen statt neu zu schreiben.
- Ein Codestand, später auch iOS möglich.
- Expo bringt Build (EAS), Secure-Store (für den API-Schlüssel), Audio (Aufnahme/Abspielen) und
  Benachrichtigungen fertig mit.

Alternative: **Flutter (Dart)** – sehr rund, aber neue Sprache und kein Code-Übernehmen.

## Architektur

```
App (Expo/React Native)
├─ UI: Chat, Verlauf, Einstellungen (Name, Anbieter, Schlüssel, Sprache, Kostenlimit)
├─ KI-Client: spricht direkt mit dem gewählten Anbieter (Anthropic/OpenAI/…),
│             Streaming der Antwort – wie am PC, nur ohne PC-Werkzeuge
├─ Sprache: Aufnahme → Anbieter/Cloud-STT; Antwort vorlesen (Android-TTS)
├─ Speicher: Gespräche lokal (verschlüsselt), Schlüssel im Android-Keystore (SecureStore)
└─ Kosten: Token-Zählung und Tageslimit wie am PC
```

**Wichtig zur Sicherheit:** Der API-Schlüssel liegt dann auf dem Handy (SecureStore/Keystore).
Das ist ein bewusster Unterschied zum PC; ein direkter Anbieter-Zugriff vom Handy heißt, der
Schlüssel ist dort. Alternativ ein kleiner eigener Vermittlungs-Dienst – das wäre aber wieder
Server-Infrastruktur, die du gerade nicht willst. Für den Start: Schlüssel im Keystore.

## Übernehmbar aus der Desktop-App
- `prompt/julia.*.md` (System-Prompt, ohne die PC-Werkzeug-Teile) – Persönlichkeit, Sprache, Grenzen.
- `src/main/anbieter/liste.js` und die Anbieter-Anbindung (an React Native anpassen).
- Die Ampel-Idee: am Handy gibt es kaum GELB/ROT-Aktionen (keine PC-Eingriffe), aber die
  Denkweise „erst fragen bei Wichtigem" bleibt im Prompt.
- Texte/Übersetzungen (`src/shared/texte.js`) als Grundlage für die App-Texte.

## Umfang in Schritten

**MVP (erste lauffähige App):**
1. Expo-Projekt anlegen, Grundnavigation (Chat, Einstellungen).
2. Einstellungen: Anbieter + API-Schlüssel (SecureStore), Name, Sprache.
3. Chat mit Streaming-Antwort gegen einen Anbieter (zuerst Anthropic).
4. Gespräche lokal speichern und fortsetzen.

**Danach:**
5. Sprache: Diktat aufnehmen und Antwort vorlesen.
6. Kosten-Anzeige und Tageslimit.
7. Feinschliff Design (an Julias Look angelehnt), Dark/Light.
8. Build über EAS, Test-APK.

**Später (optional):**
- Push-Benachrichtigungen, Erinnerungen, Foto/Datei an den Chat anhängen.

**Ausbaustufe „mit PC verbinden":**
- Am PC einen schlanken Verbindungspunkt bereitstellen (im Heimnetz/VPN, verschlüsselt, einmal
  per Code gekoppelt) – funktional wie der frühere Handy-Server, aber als API für die App.
- In der App ein Umschalter „Diesem PC" / „Eigenständig". Im PC-Modus laufen Aufträge über die
  PC-Julia, Freigaben (GELB/ROT) kommen als Ja/Nein aufs Handy, ROT bleibt ROT.
- Erst angehen, wenn der eigenständige Teil steht.

## Was du dafür brauchst
- Node.js (hast du), dazu die Expo-/EAS-Tools und ein Android-Handy oder den Android-Emulator
  (Android Studio) zum Testen. Bauen und Ausprobieren läuft auf deinem Rechner – hier geht es nicht.

## Nächster Schritt
Wenn der Stack (Expo/React Native) für dich passt, lege ich das **Projekt-Gerüst und den MVP-Code**
an (eigener Ordner, z. B. `julia-android/`), den du dann bei dir mit Expo startest. Sag Bescheid.
```
