#!/usr/bin/env bash
# Julia-Relay für Proxmox VE – Julia von überall erreichen, solange dein PC läuft.
# Legt einen kleinen Debian-Container an: darin Caddy (HTTPS mit Let's Encrypt)
# und das Relay. Anmeldung nur per Passkey; dein PC verbindet sich von sich aus.
#
# In der Shell deines Proxmox-Hosts:
#   bash -c "$(curl -fsSL https://raw.githubusercontent.com/MoinMornhart/julia-ai-web/main/proxmox/julia-relay.sh)"
#
# Ohne Rückfragen: JULIA_RELAY_DOMAIN=… CTID=… SPEICHER=… BRUECKE=… JA=1 vorne anstellen.
set -euo pipefail

QUELLE="${JULIA_RELAY_QUELLE:-https://github.com/MoinMornhart/julia-ai-web/archive/refs/heads/main.tar.gz}"
gruen() { printf '\033[1;32m%s\033[0m\n' "$*"; }
gelb() { printf '\033[1;33m%s\033[0m\n' "$*"; }
abbruch() { printf '\033[1;31m%s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || abbruch "Bitte als root in der Shell deines Proxmox-Hosts ausführen."
command -v pct >/dev/null && command -v pveam >/dev/null && command -v pvesh >/dev/null \
  || abbruch "Das hier ist kein Proxmox-Host (pct, pveam oder pvesh fehlen)."

cat <<'TEXT'

  Julia-Relay
  -----------
  Julia von überall erreichen, solange dein PC läuft. Anmeldung nur per
  Passkey. Dein PC verbindet sich von sich aus – im Router brauchst du nur
  TCP-Port 80 und 443 zu diesem Container, am PC keinen.

TEXT

DOMAIN="${JULIA_RELAY_DOMAIN:-}"
while [ -z "$DOMAIN" ]; do read -rp "Domain für das Relay (z. B. julia.meinname.duckdns.org): " DOMAIN; done
DOMAIN="$(printf '%s' "$DOMAIN" | tr 'A-Z' 'a-z' | sed -E 's#^https?://##; s#/.*$##')"
printf '%s' "$DOMAIN" | grep -Eq '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$' \
  || abbruch "Das ist keine gültige Domain: $DOMAIN"

CTID="${CTID:-$(pvesh get /cluster/nextid)}"
SPEICHER="${SPEICHER:-$(pvesm status -content rootdir | awk 'NR>1 && $3=="active" {print $1; exit}')}"
VORLAGEN="${VORLAGEN:-$(pvesm status -content vztmpl | awk 'NR>1 && $3=="active" {print $1; exit}')}"
BRUECKE="${BRUECKE:-vmbr0}"
[ -n "$SPEICHER" ] || abbruch "Kein aktiver Speicher für Container gefunden."
[ -n "$VORLAGEN" ] || abbruch "Kein aktiver Speicher für Vorlagen gefunden."

gelb "Container $CTID · Speicher $SPEICHER · Netz $BRUECKE (DHCP) · Domain $DOMAIN"
if [ "${JA:-}" != "1" ]; then
  read -rp "Weiter? [J/n] " ok
  case "${ok:-j}" in [JjYy]*) ;; *) abbruch "Abgebrochen – nichts verändert." ;; esac
fi

gelb "Hole die Debian-12-Vorlage …"
pveam update >/dev/null
VORLAGE="$(pveam available --section system | awk '$2 ~ /^debian-12-standard_.*_amd64\.tar\.zst$/ {print $2}' | sort -V | tail -n1)"
[ -n "$VORLAGE" ] || abbruch "Keine Debian-12-Vorlage gefunden."
pveam list "$VORLAGEN" | grep -q "$VORLAGE" || pveam download "$VORLAGEN" "$VORLAGE" >/dev/null

gelb "Lege den Container an …"
pct create "$CTID" "$VORLAGEN:vztmpl/$VORLAGE" --hostname julia-relay --cores 1 --memory 512 --swap 256 \
  --rootfs "$SPEICHER:4" --net0 "name=eth0,bridge=$BRUECKE,ip=dhcp" \
  --unprivileged 1 --features nesting=1 --onboot 1 --ostype debian >/dev/null
pct start "$CTID"
IP=""
for _ in $(seq 1 30); do
  IP="$(pct exec "$CTID" -- hostname -I 2>/dev/null | awk '{print $1}')" || true
  [ -n "$IP" ] && break
  sleep 2
done
[ -n "$IP" ] || abbruch "Der Container hat keine IP-Adresse bekommen."

gelb "Installiere Caddy, Node.js und das Relay (dauert ein paar Minuten) …"
pct exec "$CTID" -- bash -s -- "$DOMAIN" "$QUELLE" <<'INNEN'
set -euo pipefail
DOMAIN="$1"
QUELLE="$2"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq --no-install-recommends ca-certificates curl gnupg nodejs npm >/dev/null
# Caddy liegt nicht in den Standard-Repos von Debian – das offizielle Repo einbinden
# (die .deb.txt bringt die signed-by-Angabe schon mit).
if ! command -v caddy >/dev/null 2>&1; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' >/etc/apt/sources.list.d/caddy-stable.list
  apt-get update -qq
  apt-get install -y -qq caddy >/dev/null
fi
id julia-relay >/dev/null 2>&1 || useradd --system --home /var/lib/julia-relay --shell /usr/sbin/nologin julia-relay
install -d -o julia-relay -g julia-relay -m 700 /var/lib/julia-relay
printf 'JULIA_RELAY_DOMAIN=%s\n' "$DOMAIN" >/etc/julia-relay.env
printf 'JULIA_RELAY_QUELLE=%s\n' "$QUELLE" >>/etc/julia-relay.env

# Aktualisieren: neue Fassung daneben aufbauen, erst dann austauschen.
cat >/usr/local/bin/julia-relay-aktualisieren <<'SKRIPT'
#!/usr/bin/env bash
set -euo pipefail
. /etc/julia-relay.env
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
curl -fsSL "$JULIA_RELAY_QUELLE" | tar -xz -C "$tmp"
rm -rf /opt/julia-relay.neu
cp -r "$tmp"/*/proxmox/relay /opt/julia-relay.neu
(cd /opt/julia-relay.neu && npm ci --omit=dev --ignore-scripts --no-audit --no-fund >/dev/null)
rm -rf /opt/julia-relay.alt
if [ -d /opt/julia-relay ]; then mv /opt/julia-relay /opt/julia-relay.alt; fi
mv /opt/julia-relay.neu /opt/julia-relay
rm -rf /opt/julia-relay.alt
systemctl restart julia-relay 2>/dev/null || true
echo "Julia-Relay ist auf dem neuesten Stand."
SKRIPT

# Neuer Einrichtungslink für einen Passkey (gilt 24 Stunden, nur einmal).
cat >/usr/local/bin/julia-relay-link <<'SKRIPT'
#!/usr/bin/env bash
set -euo pipefail
. /etc/julia-relay.env
runuser -u julia-relay -- env JULIA_RELAY_DOMAIN="$JULIA_RELAY_DOMAIN" node /opt/julia-relay/server.js einrichten
SKRIPT
chmod 755 /usr/local/bin/julia-relay-aktualisieren /usr/local/bin/julia-relay-link
/usr/local/bin/julia-relay-aktualisieren >/dev/null

cat >/etc/systemd/system/julia-relay.service <<'DIENST'
[Unit]
Description=Julia-Relay
After=network-online.target
Wants=network-online.target

[Service]
User=julia-relay
EnvironmentFile=/etc/julia-relay.env
ExecStart=/usr/bin/node /opt/julia-relay/server.js
Restart=on-failure
NoNewPrivileges=yes
PrivateTmp=yes

[Install]
WantedBy=multi-user.target
DIENST

cat >/etc/caddy/Caddyfile <<CADDY
$DOMAIN {
	encode gzip
	header {
		Strict-Transport-Security "max-age=31536000"
		-Server
	}
	reverse_proxy 127.0.0.1:8780
}
CADDY
systemctl daemon-reload
systemctl enable --now julia-relay >/dev/null 2>&1
systemctl restart caddy
INNEN

LINK="$(pct exec "$CTID" -- /usr/local/bin/julia-relay-link)"
echo
gruen "Fertig! Das Julia-Relay läuft im Container $CTID ($IP)."
cat <<TEXT

Noch drei Schritte:

  1. Die Domain $DOMAIN muss auf deine öffentliche IP zeigen
     (z. B. mit DuckDNS oder MyFRITZ – bei wechselnder IP mit DynDNS).
  2. Im Router TCP-Port 80 und 443 an $IP weiterleiten. Sonst nichts.
     Beim ersten Aufruf holt sich das Relay sein HTTPS-Zertifikat selbst.
  3. Diesen Link am Handy öffnen und deinen Passkey anlegen (gilt 24 Stunden):

     $LINK

Danach in Julia: Einstellungen → Verbindungen → Proxmox-Relay → Adresse
$DOMAIN eintragen, einschalten und „Code anzeigen“. Den Code gibst du am
Relay unter „PC koppeln“ ein.

Später:
  Neuer Einrichtungslink:  pct exec $CTID -- julia-relay-link
  Aktualisieren:           pct exec $CTID -- julia-relay-aktualisieren
TEXT
