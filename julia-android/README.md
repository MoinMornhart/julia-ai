# Julia für Android (MVP)

Eigenständige Handy-App, in der Julia als KI-Assistent läuft (Expo / React Native).
Redet direkt mit dem KI-Anbieter (MVP: Anthropic/Claude), ohne PC. Der API-Schlüssel liegt
sicher im Android-Keystore (SecureStore). Die Verbindung mit dem PC ist als spätere Stufe
geplant – siehe `../docs/android-app.md`.

## Voraussetzungen
- Node.js
- Für den echten Test: ein Android-Handy mit der App **Expo Go** oder Android Studio (Emulator)

## Starten (auf deinem Rechner)
```bash
cd julia-android
npm install
npx expo start
```
Dann in Expo Go den QR-Code scannen (Handy und PC im selben WLAN) oder `a` für den Emulator drücken.

## Einrichten
1. Oben rechts auf **⚙︎** tippen.
2. API-Schlüssel (Anthropic, `sk-ant-…`), optional Name/dein Name/Modell setzen, **Speichern**.
3. Zurück im Chat mit Julia schreiben.

## Was drin ist
- Chat gegen **Anthropic (Claude)** oder **OpenAI** – umschaltbar in den Einstellungen
- **Streaming**: die Antwort erscheint Wort für Wort, mit **Stopp**-Knopf zum Abbrechen
- **Neues Gespräch** über „Neu" im Kopf
- **Antworten vorlesen** (Text-to-Speech, ein/aus; pro Antwort ein 🔊-Knopf)
- **Kosten-Anzeige** im Kopf (geschätzt aus den Tokens, pro Tag)
- Einstellungen: Name, dein Name, Sprache, Anbieter, Modell, API-Schlüssel (Keystore, je Anbieter getrennt)
- Gespräch lokal gespeichert, Dark/Light automatisch

## Was noch fehlt (nächste Schritte)
- Diktat (Spracheingabe) – am einfachsten über die Mikrofontaste der Handytastatur; echtes In-App-Diktat braucht einen Dev-Build
- Optionaler Modus „mit PC verbinden" (Heimnetz/VPN) – siehe `../docs/android-app.md`

> Hinweis: Dieses Gerüst wurde auf einem Windows/Electron-Rechner ohne Android-Werkzeuge
> geschrieben und dort **nicht gebaut/getestet**. Bitte einmal `npm install` und `npx expo start`
> ausführen und auftauchende Versions-/Build-Hinweise von Expo bestätigen.
