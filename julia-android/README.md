# Julia für Android & iOS

Eigenständige Handy-App, in der Julia als KI-Assistent läuft (Expo / React Native – **läuft auf
Android und iOS**; der Ordner heißt aus historischen Gründen `julia-android`).
Sie redet direkt mit dem KI-Anbieter (**Claude** oder **OpenAI**) und **funktioniert immer, auch
wenn dein PC aus ist**. Der API-Schlüssel liegt sicher im Schlüsselspeicher des Handys. Optional
verbindet sie sich mit dem PC – ist der aus/nicht erreichbar, antwortet sie einfach direkt weiter.

## Voraussetzungen
- Node.js
- Zum Ausprobieren: Android-Handy mit **Expo Go** oder ein Emulator
- Für eine **echte APK / iOS-App**: ein kostenloses [Expo](https://expo.dev)-Konto (Cloud-Build, kein Android-SDK nötig)

## Schnell ausprobieren
```bash
cd julia-android
npm install
npx expo start
```
Dann in Expo Go den QR-Code scannen (Handy und PC im selben WLAN) oder `a` für den Emulator drücken.

## Echte App bauen (installierbare APK / iOS)
Das erzeugt eine richtige `.apk` (Android) bzw. iOS-App über die Expo-Cloud – ohne lokales Android-SDK:
```bash
npm install -g eas-cli
eas login                       # kostenloses Expo-Konto
eas init                        # legt die Projekt-ID an (einmalig)
eas build -p android --profile preview   # → fertige .apk zum Download/Installieren
eas build -p ios --profile preview       # → iOS-App (Simulator-Build; echte iPhone-Installation braucht ein Apple-Developer-Konto)
```
Am Ende gibt EAS einen Link zur fertigen Datei aus. Die APK lädst du aufs Handy und installierst
sie direkt (bei Android „Unbekannte Quellen" erlauben). Alternativ lokal mit
`npx expo prebuild` + Android Studio/Xcode bauen.

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
- **Mit PC verbinden** (optional): im Heimnetz/VPN per Code koppeln (Einstellungen), dann laufen Anfragen durch die PC-Julia samt Ampel. **Ist der PC aus, antwortet die App nahtlos direkt weiter.**
- Einstellungen: Name, dein Name, Sprache, Anbieter, Modell, API-Schlüssel (Keystore, je Anbieter getrennt)
- Gespräch lokal gespeichert, Dark/Light automatisch

## Was noch fehlt (nächste Schritte)
- Diktat (Spracheingabe) – am einfachsten über die Mikrofontaste der Handytastatur; echtes In-App-Diktat braucht einen Dev-Build
- App-Icon/Startbild im Julia-Look (aktuell Expo-Standard)

> Hinweis: Dieses Gerüst wurde auf einem Windows/Electron-Rechner ohne Android-Werkzeuge
> geschrieben und dort **nicht gebaut/getestet**. Bitte einmal `npm install` und `npx expo start`
> ausführen und auftauchende Versions-/Build-Hinweise von Expo bestätigen.
