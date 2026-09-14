# Julia from anywhere – with your Proxmox server

With the **Julia relay** on your own Proxmox server you reach Julia from anywhere through a
normal internet address – in your phone’s browser, no app and no VPN. As long as your PC is
running, the relay passes your messages on to Julia.

- **Passkey only:** You sign in at the relay with your fingerprint, face or device PIN. There is no password, so there is none to guess.
- **No port on your PC:** Your PC connects to the relay on its own. Only the small relay container is reachable from the internet.
- **Traffic light unchanged:** Approvals arrive as yes/no cards on your phone, RED stays RED.

> Rather not open anything to the internet? Use a VPN instead:
> **[Julia on the road with Tailscale or FritzBox VPN](unterwegs.en.md)**.

## What you need

- A Proxmox VE server (7 or 8) that runs all the time.
- A **domain** pointing to your internet address – for example free at
  [DuckDNS](https://www.duckdns.org) (`julia.yourname.duckdns.org`). If your IP changes, dynamic
  DNS keeps the domain up to date.
- A router where you can forward **TCP ports 80 and 443** to an address. On connections without
  a public IPv4 (DS-Lite, CGNAT) this often isn’t possible – then use the VPN.

## 1. Install the relay

Open the **Shell** of your host in the Proxmox web interface and paste:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/MoinMornhart/julia-ai-web/main/proxmox/julia-relay.sh)"
```

The script asks for your domain, shows container number, storage and network, and after your
yes creates a small Debian container (1 core, 512 MB RAM, 4 GB disk). It runs
[Caddy](https://caddyserver.com) for HTTPS with a Let’s Encrypt certificate and the relay itself.
At the end it shows the container’s address and a **setup link**.

## 2. Set up your router

Forward **TCP ports 80 and 443** to the container address the script shows. Caddy only needs
port 80 to get and renew the certificate; everything else runs over HTTPS.

## 3. Create a passkey

Open the setup link **on your phone** and tap *Create passkey*. Your phone asks for fingerprint,
face or PIN – done. The link is valid for 24 hours and only once. Create more passkeys (say, for a
tablet) later at the relay under *Passkeys*.

You can get a new setup link any time in the Proxmox shell:

```bash
pct exec <container number> -- julia-relay-link
```

## 4. Pair Julia

1. In Julia: **Settings → Connections → Proxmox relay**.
2. Enter your domain, switch on *Reachable through the relay*, **Show code**.
3. At the relay (on your phone, signed in) enter the code under **Pair PC**.

Julia then shows *Connected*. From now on you just open your domain on your phone and land at
Julia after signing in with your passkey.

## Security

- **Passkey-only sign-in** (WebAuthn with user verification). The session lives in an `HttpOnly`
  cookie; after ten failed attempts an address is blocked for 15 minutes.
- **Only the phone page:** The relay only passes the phone page’s addresses on to Julia –
  messages, approvals, stop. Pairing a phone isn’t possible through it.
- **Pairing by code:** The code is valid for ten minutes and only once. After that your PC
  identifies itself with a random key; the relay only knows its hash, Julia stores it encrypted.
  *Disconnect* – in Julia or at the relay – makes it worthless.
- **Your server:** The relay decrypts the connection so it can check who is signed in. It runs on
  your own server; keep Proxmox and the container up to date.

## Update and remove

```bash
pct exec <container number> -- julia-relay-aktualisieren   # latest version
pct stop <container number> && pct destroy <container number>   # remove everything
```

Remember to delete the port forwarding in your router afterwards.
