# Julia vom Handy aus steuern (Telegram)

Du kannst Julia von unterwegs schreiben: „Läuft der Download noch?", „Wie voll ist die
Platte?", „Schick mir die Termine von morgen", „Mach den PC in 10 Minuten aus". Das läuft
über einen **eigenen Telegram-Bot**, den nur du benutzt. Julia fragt ihn selbst ab – du
brauchst keinen Server, keine Portfreigabe und keine feste IP.

## 1. Bot anlegen (2 Minuten)

1. Öffne Telegram und such nach **@BotFather** (blauer Haken).
2. Schick ihm `/newbot`.
3. Name: z. B. `Julia`. Benutzername: muss auf `bot` enden, z. B. `philips_julia_bot`.
4. BotFather antwortet mit einem **Token** der Form `123456789:AAH…`. Kopieren.

Der Token ist wie ein Passwort für den Bot. Gib ihn niemandem außer Julia.

## 2. In Julia verbinden

1. Julia → **Einstellungen → Verbindungen → Handy (Telegram)**.
2. Token einfügen, **Bot verbinden**.
3. Julia zeigt einen **6-stelligen Code** und den Knopf **In Telegram öffnen**. Tipp am
   Handy auf den Link bzw. öffne deinen Bot und drück **Starten** – oder schick ihm den
   Code. Der Code gilt 15 Minuten.
4. Der Bot antwortet: *„Verbunden. Ich höre ab jetzt nur auf dich."*

## Befehle

| Befehl | Wirkung |
|---|---|
| einfach schreiben | Julia erledigt es am PC und antwortet kurz |
| `/stopp` | bricht die laufende Aufgabe sofort ab |
| `/neu` | neues Gespräch |
| `/status` | kurzer Blick: Akku, Speicher, Platte, was läuft |
| `/hilfe` | diese Übersicht |

Das Gespräch ist dasselbe wie am PC: Was du am Handy anfängst, kannst du am PC
weiterführen. Nachrichten vom Handy erscheinen im Chatfenster mit 📱.

## Sicherheit

- **Nur du:** Nach der Kopplung reagiert der Bot ausschließlich auf dein Telegram-Konto.
  Nachrichten von anderen werden ignoriert und im Protokoll vermerkt.
- **Kopplung:** 6-stelliger Code, 15 Minuten gültig, nach 5 falschen Versuchen verfällt er.
- **Keine alten Befehle:** Nachrichten, die älter als zwei Minuten sind (z. B. während der PC
  aus war), führt Julia nicht aus.
- **Die Ampel gilt auch hier.** ROT bleibt ROT. GELB-Aktionen fragt Julia am Handy mit
  **✅ Ja / ❌ Nein** ab. Wer das nicht will, stellt in den Einstellungen *Freigaben bei
  Aufträgen vom Handy* auf **nur am PC**.
- **Protokoll:** Jeder Auftrag vom Handy steht in `protokoll.jsonl`.
- **Token:** liegt mit Windows verschlüsselt in `%APPDATA%\Julia\konten.json`.

Zwei ehrliche Hinweise:

1. **Schütze dein Telegram-Konto.** Wer dein Telegram hat, kann Julia Aufträge geben.
   Schalte in Telegram die **zweistufige Bestätigung** ein (*Einstellungen → Datenschutz
   und Sicherheit → Zweistufige Bestätigung*).
2. **Telegram sieht mit.** Bot-Chats sind nicht Ende-zu-Ende-verschlüsselt, die Nachrichten
   laufen über Telegrams Server. Für wirklich Vertrauliches besser am PC arbeiten.

## Trennen

**Einstellungen → Verbindungen → Handy → Trennen.** Julia schickt eine letzte Nachricht,
hört auf, den Bot abzufragen, und löscht Token und Kopplung. Den Bot selbst kannst du bei
@BotFather mit `/deletebot` löschen.
