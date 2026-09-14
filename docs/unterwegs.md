# Julia von unterwegs erreichen

Zu Hause im WLAN erreicht dein Handy Julia direkt. Für unterwegs baust du einen sicheren
Tunnel nach Hause – ein **VPN**. Julia öffnet dafür bewusst **keinen Port** am Router: Sie
steuert deinen PC, und ein offener Port wäre eine Einladung an jeden im Internet.

## Weg 1: Tailscale (am einfachsten)

Tailscale verbindet deine Geräte verschlüsselt miteinander (WireGuard), egal wo sie gerade
sind. Für private Nutzung ist es kostenlos.

1. Tailscale auf dem PC installieren: <https://tailscale.com/download> und anmelden.
2. Die Tailscale-App auf dem Handy installieren und mit **demselben Konto** anmelden.
3. In Julia: **Einstellungen → Verbindungen → Handy**. Dort steht jetzt
   *„Unterwegs-Zugang über dein VPN erkannt (100.…)"*.
4. **Handy koppeln** und den QR-Code scannen. Gekoppelt wird über die Tailscale-Adresse – sie
   gilt zu Hause und unterwegs.
5. Unterwegs: Tailscale auf dem Handy an, Julia-Seite öffnen. Tipp: Seite zum Startbildschirm
   hinzufügen.

Tailscale sieht, welche deiner Geräte verbunden sind, aber nicht, was du schreibst: Der Inhalt
ist doppelt verschlüsselt – vom VPN und von Julias eigenem HTTPS.

## Weg 2: das VPN deiner FritzBox

Viele FritzBoxen haben WireGuard eingebaut. Dein Handy ist damit unterwegs so im Heimnetz, als
wäre es im WLAN – an Julia musst du nichts ändern.

1. FritzBox-Oberfläche öffnen (<http://fritz.box>) → **Internet → Freigaben → VPN
   (WireGuard)** → **VPN-Verbindung hinzufügen** → **Einzelgerät verbinden**.
2. Den angezeigten QR-Code mit der WireGuard-App auf dem Handy scannen.
3. Unterwegs VPN einschalten und Julia wie zu Hause öffnen.

## Sicherheit bleibt gleich

- Nur dein gekoppeltes Handy kommt rein, mit Zufallsschlüssel; nach zehn Fehlversuchen ist eine
  Adresse zehn Minuten gesperrt.
- Julias Server antwortet nur Adressen aus dem Heimnetz oder aus dem VPN – nie dem offenen
  Internet.
- Die Ampel gilt unverändert: Freigaben kommen als Ja/Nein-Karte aufs Handy, ROT bleibt ROT.

## Wenn es unterwegs nicht klappt

| Problem | Lösung |
|---|---|
| Kein Hinweis „VPN erkannt" | Tailscale auf dem PC läuft nicht oder ist abgemeldet. |
| Seite lädt nicht, zu Hause geht es | Die Windows-Firewall lässt Julia im Tailscale-Netz nicht durch: In Windows das Tailscale-Netz als **privat** einstufen oder Julia in der Firewall auch für öffentliche Netzwerke erlauben. |
| Browser warnt wieder vor dem Zertifikat | Julia hat das Zertifikat für die neue Adresse neu erstellt. Fingerabdruck mit den Einstellungen vergleichen und fortfahren. |
| Zu Hause geht es plötzlich nicht | Nach dem Koppeln über Tailscale braucht das Handy Tailscale auch zu Hause – einfach anlassen. |
