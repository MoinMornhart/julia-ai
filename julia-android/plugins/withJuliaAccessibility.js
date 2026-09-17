// Expo-Config-Plugin (Issue #6): meldet Julias AccessibilityService im nativen
// Android-Projekt an und legt die Kotlin-Datei + die Service-Konfiguration ab.
// Läuft bei `expo prebuild`. Additiv – ändert nichts am bestehenden App-Verhalten;
// der Dienst tut nichts, solange der Nutzer ihn nicht in den Bedienungshilfen
// einschaltet.
const { withAndroidManifest, withDangerousMod, AndroidConfig } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const DIENST_NAME = '.JuliaAccessibilityService';

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
    const paket = (c.android && c.android.package) || 'io.github.moinmornhart.julia';
    const wurzel = c.modRequest.platformProjectRoot; // .../android

    // 1) Service-Konfiguration nach res/xml
    const xmlDir = path.join(wurzel, 'app', 'src', 'main', 'res', 'xml');
    fs.mkdirSync(xmlDir, { recursive: true });
    fs.writeFileSync(path.join(xmlDir, 'julia_accessibility_config.xml'), XML_CONFIG);

    // 2) Kotlin-Service an die Paketstelle kopieren (package im Quelltext ersetzen)
    const quelle = path.join(c.modRequest.projectRoot, 'native', 'JuliaAccessibilityService.kt');
    let kotlin = fs.readFileSync(quelle, 'utf8').split('__PACKAGE__').join(paket);
    const zielDir = path.join(wurzel, 'app', 'src', 'main', 'java', ...paket.split('.'));
    fs.mkdirSync(zielDir, { recursive: true });
    fs.writeFileSync(path.join(zielDir, 'JuliaAccessibilityService.kt'), kotlin);

    return c;
  }]);

  return config;
};

module.exports = withJuliaAccessibility;
