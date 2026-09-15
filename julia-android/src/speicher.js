// Speicher der App: API-Schlüssel sicher im Android-Keystore (SecureStore),
// je Anbieter getrennt. Einstellungen, Gespräch und Tageskosten in AsyncStorage.
// Ein Schlüssel wird nie in AsyncStorage oder ins Gespräch geschrieben.

import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

const EINSTELLUNGEN = 'julia_einstellungen';
const GESPRAECH = 'julia_gespraech';
const KOSTEN = 'julia_kosten';

export const STANDARD_EINSTELLUNGEN = {
  name: 'Julia',
  nutzer: '',
  sprachcode: 'de',
  anbieter: 'anthropic',
  modell: 'claude-sonnet-5',
  vorlesen: true,
  pcAdresse: '', // z. B. 192.168.1.20:8770 oder 100.x.x.x:8770 (VPN)
  pcModus: false, // true = Anfragen laufen über den PC statt direkt zum Anbieter
};

const PC_TOKEN = 'julia_pc_token';
export async function pcTokenLesen() {
  try { return (await SecureStore.getItemAsync(PC_TOKEN)) || ''; } catch { return ''; }
}
export async function pcTokenSpeichern(wert) {
  const w = String(wert || '').trim();
  if (w) await SecureStore.setItemAsync(PC_TOKEN, w);
  else await SecureStore.deleteItemAsync(PC_TOKEN);
}

// SecureStore erlaubt nur [A-Za-z0-9._-] im Schlüsselnamen.
const keyName = (anbieter) => `julia_api_key_${String(anbieter || 'anthropic').replace(/[^\w.-]/g, '')}`;

export async function schluesselLesen(anbieter) {
  try { return (await SecureStore.getItemAsync(keyName(anbieter))) || ''; } catch { return ''; }
}

export async function schluesselSpeichern(anbieter, wert) {
  const w = String(wert || '').trim();
  if (w) await SecureStore.setItemAsync(keyName(anbieter), w);
  else await SecureStore.deleteItemAsync(keyName(anbieter));
}

export async function einstellungenLesen() {
  try {
    const roh = await AsyncStorage.getItem(EINSTELLUNGEN);
    return { ...STANDARD_EINSTELLUNGEN, ...(roh ? JSON.parse(roh) : {}) };
  } catch {
    return { ...STANDARD_EINSTELLUNGEN };
  }
}

export async function einstellungenSpeichern(e) {
  await AsyncStorage.setItem(EINSTELLUNGEN, JSON.stringify(e));
}

export async function gespraechLesen() {
  try {
    const roh = await AsyncStorage.getItem(GESPRAECH);
    return roh ? JSON.parse(roh) : [];
  } catch {
    return [];
  }
}

export async function gespraechSpeichern(nachrichten) {
  await AsyncStorage.setItem(GESPRAECH, JSON.stringify(nachrichten.slice(-100)));
}

const heute = () => new Date().toISOString().slice(0, 10);

// Kosten des heutigen Tages: { tag, usd, anfragen }. Wechselt der Tag, wird zurückgesetzt.
export async function kostenLesen() {
  try {
    const roh = await AsyncStorage.getItem(KOSTEN);
    const k = roh ? JSON.parse(roh) : null;
    if (k && k.tag === heute()) return k;
  } catch { /* leer */ }
  return { tag: heute(), usd: 0, anfragen: 0 };
}

export async function kostenAddieren(usd) {
  const k = await kostenLesen();
  const neu = { tag: heute(), usd: k.usd + (Number(usd) || 0), anfragen: k.anfragen + 1 };
  await AsyncStorage.setItem(KOSTEN, JSON.stringify(neu));
  return neu;
}
