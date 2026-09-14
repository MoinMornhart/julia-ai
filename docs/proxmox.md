# Julia von überall – mit deinem Proxmox-Server

Mit dem **Julia-Relay** auf deinem eigenen Proxmox-Server erreichst du Julia von überall über
eine normale Internetadresse – am Handy im Browser, ohne App und ohne VPN. Solange dein PC
läuft, reicht das Relay deine Nachrichten an Julia durch.

- **Nur mit Passkey:** Am Relay meldest du dich per Fingerabdruck, Gesicht oder Geräte-PIN an. Ein Passwort gibt es nicht, und damit auch keins zu erraten.
- **Kein Port am PC:** Dein PC verbindet sich von sich aus mit dem Relay. Nur der kleine Relay-Container ist aus dem Internet erreichbar.
- **Ampel unverändert:** Freigaben kommen als Ja/Nein-Karte aufs Handy, ROT bleibt ROT.

> Lieber gar nichts im Internet öffnen? Dann nimm den Weg über ein VPN:
> **[Julia von unterwegs mit Tailscale oder FritzBox-VPN](unterwegs.md)**.

## Was du brauchst

- Einen Proxmox-VE-Server (7 oder 8), der dauerhaft läuft.
- Eine **Domain**, die auf deine Internetadresse zeigt – zum Beispiel kostenlos bei
  [DuckDNS](https://www.duckdns.org) (`julia.meinname.duckdns.org`) oder über MyFRITZ deiner
  FritzBox. Wechselt deine IP, hält DynDNS die Domain aktuell.
- Einen Router, in dem du **TCP-Port 80 und 443** an eine Adresse weiterleiten kannst.
  Bei DS-Lite-Anschlüssen ohne eigene IPv4 geht das oft nicht – dann bleibt das VPN.

## 1. Relay installieren

Öffne in der Proxmox-Weboberfläche die **Shell** deines Hosts und füge ein:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/MoinMornhart/julia-ai-web/main/proxmox/julia-relay.sh)"
```

Das Skript fragt nach deiner Domain, zeigt Container-Nummer, Speicher und Netz und legt nach
deinem Ja einen kleinen Debian-Container an (1 Kern, 512 MB RAM, 4 GB Platte). Darin laufen
[Caddy](https://caddyserver.com) für HTTPS mit einem Zertifikat von Let's Encrypt und das Relay
selbst. Am Ende zeigt es die Adresse des Containers und einen **Einrichtungslink**.

## 2. Router einstellen

Leite **TCP-Port 80 und 443** an die Adresse des Containers weiter, die das Skript anzeigt.
Port 80 braucht Caddy nur, um das Zertifikat zu holen und zu erneuern; alles andere läuft über
HTTPS.

## 3. Passkey anlegen

Öffne den Einrichtungslink **am Handy** und tippe auf *Passkey anlegen*. Dein Handy fragt nach
Fingerabdruck, Gesicht oder PIN – fertig. Der Link gilt 24 Stunden und nur einmal. Weitere
Passkeys (etwa für ein Tablet) legst du später am Relay unter *Passkeys* an.

Einen neuen Einrichtungslink bekommst du jederzeit in der Proxmox-Shell:

```bash
pct exec <Container-Nummer> -- julia-relay-link
```

## 4. Julia koppeln

1. In Julia: **Einstellungen → Verbindungen → Proxmox-Relay**.
2. Deine Domain eintragen, *Über das Relay erreichbar* einschalten, **Code anzeigen**.
3. Am Relay (am Handy, angemeldet) unter **PC koppeln** den Code eingeben.

Julia zeigt danach *Verbunden*. Ab jetzt öffnest du am Handy einfach deine Domain und landest
nach der Passkey-Anmeldung bei Julia.

## Sicherheit

- **Anmeldung nur per Passkey** (WebAuthn mit Nutzerprüfung). Die Sitzung liegt in einem
  `HttpOnly`-Cookie; nach zehn Fehlversuchen ist eine Adresse eine Viertelstunde gesperrt.
- **Nur die Handy-Seite:** Das Relay reicht ausschließlich die Adressen der Handy-Seite an Julia
  weiter – Nachrichten, Freigaben, Stopp. Neu koppeln geht darüber nicht.
- **Kopplung per Code:** Der Code gilt zehn Minuten und nur einmal. Danach weist sich dein PC mit
  einem Zufallsschlüssel aus; das Relay kennt davon nur den Hash, Julia bewahrt ihn verschlüsselt
  auf. *Trennen* – in Julia oder am Relay – macht ihn wertlos.
- **Dein Server:** Das Relay entschlüsselt die Verbindung, damit es prüfen kann, wer angemeldet
  ist. Es läuft auf deinem eigenen Server; halte Proxmox und den Container aktuell.

## Aktualisieren und entfernen

```bash
pct exec <Container-Nummer> -- julia-relay-aktualisieren   # neueste Fassung
pct stop <Container-Nummer> && pct destroy <Container-Nummer>   # alles wieder weg
```

Denk nach dem Entfernen daran, die Portweiterleitung im Router zu löschen.
