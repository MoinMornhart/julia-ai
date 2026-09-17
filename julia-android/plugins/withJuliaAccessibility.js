// Expo-Config-Plugin (Issue #6): meldet Julias AccessibilityService im nativen
// Android-Projekt an und legt die Service-Konfiguration (res/xml) ab.
// Läuft bei `expo prebuild`. Additiv – ändert nichts am bestehenden App-Verhalten;
// der Dienst tut nichts, solange der Nutzer ihn nicht in den Bedienungshilfen
// einschaltet. Die Kotlin-Klasse selbst liefert das Expo-Modul „julia-zugriff"
// (modules/julia-zugriff); deshalb wird sie hier nur noch registriert, nicht kopiert.
const { withAndroidManifest, withDangerousMod, AndroidConfig } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

// Voll qualifizierter Klassenname im Modul-Paket (nicht im App-Paket).
const DIENST_NAME = 'expo.modules.juliazugriff.JuliaAccessibilityService';

const XML_CONFIG = `<?xml version="1.0" encoding="utf-8"?>
<accessibility-service xmlns:android="http://schemas.android.com/apk/res/android"
    android:description="@string/app_name"
    android:accessibilityEventTypes="typeAllMask"
    android:accessibilityFlags="flagDefault|flagRetrieveInteractiveWindows|flagReportViewIds"
    android:canRetrieveWindowContent="true"
    android:canPerformGestures="true"
    android:accessibilityFeedbackType="feedbackGeneric"
    android:notificationTimeout="100" />
`;

// Den Service in <application> eintragen (idempotent).
function dienstEintragen(manifest) {
  const app = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);
  app.service = app.service || [];
  if (app.service.some((s) => s.$ && s.$['android:name'] === DIENST_NAME)) return manifest;
  app.service.push({
    $: {
      'android:name': DIENST_NAME,
      'android:permission': 'android.permission.BIND_ACCESSIBILITY_SERVICE',
      'android:exported': 'false',
      'android:label': '@string/app_name',
    },
    'intent-filter': [
      { action: [{ $: { 'android:name': 'android.accessibilityservice.AccessibilityService' } }] },
    ],
    'meta-data': [
      { $: { 'android:name': 'android.accessibilityservice', 'android:resource': '@xml/julia_accessibility_config' } },
    ],
  });
  return manifest;
}

const withJuliaAccessibility = (config) => {
  config = withAndroidManifest(config, (c) => {
    c.modResults = dienstEintragen(c.modResults);
    return c;
  });

  config = withDangerousMod(config, ['android', (c) => {
    const wurzel = c.modRequest.platformProjectRoot; // .../android

    // Service-Konfiguration nach res/xml (die Kotlin-Klasse liefert das Modul).
    const xmlDir = path.join(wurzel, 'app', 'src', 'main', 'res', 'xml');
    fs.mkdirSync(xmlDir, { recursive: true });
    fs.writeFileSync(path.join(xmlDir, 'julia_accessibility_config.xml'), XML_CONFIG);

    return c;
  }]);

  return config;
};

module.exports = withJuliaAccessibility;
