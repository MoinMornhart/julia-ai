// JS-Seite der Handy-Brücke (Issue #6). Bindet das native Expo-Modul
// „JuliaZugriff" ein und gibt eine kleine, typisierte API zurück. Läuft der
// Bedienungshilfen-Dienst nicht (oder ist das native Modul nicht vorhanden,
// z. B. in Expo Go), liefert `bildschirmLesen()` ein leeres Array und die
// Aktionen `false` – nie ein Absturz. Die Freigabe/Ampel für steuernde
// Aktionen sitzt in der App-Logik, nicht hier.
import { requireOptionalNativeModule } from 'expo-modules-core';

export type Element = {
  i: number;
  text: string;
  desc: string;
  klasse: string;
  id: string;
  clickable: boolean;
  editable: boolean;
  scrollable: boolean;
  x: number;
  y: number;
  tiefe: number;
};

const nativ = requireOptionalNativeModule('JuliaZugriff');

/** Ist der Bedienungshilfen-Dienst aktiv (vom Nutzer eingeschaltet)? */
export function dienstLaeuft(): boolean {
  return nativ?.dienstLaeuft?.() ?? false;
}

/** Aktuellen Bildschirm als Elementliste lesen (nur Lesen). */
export function bildschirmLesen(): Element[] {
  const roh = nativ?.bildschirmLesen?.() ?? '[]';
  try {
    return JSON.parse(roh) as Element[];
  } catch {
    return [];
  }
}

/** Element mit passendem Text/Beschreibung antippen. */
export function klickText(ziel: string): boolean {
  return nativ?.klickText?.(ziel) ?? false;
}

/** An festen Bildschirm-Koordinaten tippen. */
export function klickKoordinaten(x: number, y: number): boolean {
  return nativ?.klickKoordinaten?.(x, y) ?? false;
}

/** Text ins erste editierbare Feld schreiben. */
export function textEingeben(text: string): boolean {
  return nativ?.textEingeben?.(text) ?? false;
}

/** Erste scrollbare Fläche vor/zurück scrollen. */
export function scrollen(vorwaerts: boolean): boolean {
  return nativ?.scrollen?.(vorwaerts) ?? false;
}

/** Von (x1,y1) nach (x2,y2) wischen (Dauer in ms). */
export function wischen(x1: number, y1: number, x2: number, y2: number, dauer = 300): boolean {
  return nativ?.wischen?.(x1, y1, x2, y2, dauer) ?? false;
}

export function zurueck(): boolean {
  return nativ?.zurueck?.() ?? false;
}
export function startseite(): boolean {
  return nativ?.startseite?.() ?? false;
}
export function letzteApps(): boolean {
  return nativ?.letzteApps?.() ?? false;
}
export function benachrichtigungen(): boolean {
  return nativ?.benachrichtigungen?.() ?? false;
}

export default {
  dienstLaeuft,
  bildschirmLesen,
  klickText,
  klickKoordinaten,
  textEingeben,
  scrollen,
  wischen,
  zurueck,
  startseite,
  letzteApps,
  benachrichtigungen,
};
