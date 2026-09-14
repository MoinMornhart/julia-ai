# Reaching Julia on the road

At home on Wi-Fi your phone reaches Julia directly. For the road you build a secure tunnel
home – a **VPN**. Julia deliberately opens **no port** on your router: she controls your PC,
and an open port would invite everyone on the internet.

## Option 1: Tailscale (easiest)

Tailscale connects your devices with encryption (WireGuard), wherever they are. It is free for
personal use.

1. Install Tailscale on the PC: <https://tailscale.com/download> and sign in.
2. Install the Tailscale app on your phone and sign in with **the same account**.
3. In Julia: **Settings → Connections → Phone**. It now says
   *"On-the-road access through your VPN detected (100.…)"*.
4. **Pair phone** and scan the QR code. Pairing uses the Tailscale address – it works at home
   and on the road.
5. On the road: Tailscale on, open the Julia page. Tip: add the page to your home screen.

Tailscale sees which of your devices are connected, but not what you write: the content is
encrypted twice – by the VPN and by Julia's own HTTPS.

## Option 2: your FritzBox VPN

Many FritzBox routers have WireGuard built in. With it, your phone is in your home network on
the road as if it were on Wi-Fi – nothing to change in Julia.

1. Open the FritzBox interface (<http://fritz.box>) → **Internet → Permit Access → VPN
   (WireGuard)** → **Add VPN connection** → **Connect a single device**.
2. Scan the QR code shown with the WireGuard app on your phone.
3. On the road, switch the VPN on and open Julia as at home.

## Security stays the same

- Only your paired phone gets in, with a random key; after ten failed attempts an address is
  blocked for ten minutes.
- Julia's server only answers addresses from your home network or your VPN – never the open
  internet.
- The traffic light is unchanged: approvals arrive on the phone as a yes/no card, RED stays RED.

## If it doesn't work on the road

| Problem | Fix |
|---|---|
| No "VPN detected" note | Tailscale isn't running on the PC or is signed out. |
| Page doesn't load, but works at home | Windows Firewall blocks Julia on the Tailscale network: set the Tailscale network to **private** in Windows or allow Julia for public networks in the firewall. |
| Browser warns about the certificate again | Julia created a new certificate for the new address. Compare the fingerprint with the settings and continue. |
| Suddenly doesn't work at home | After pairing through Tailscale the phone needs Tailscale at home too – just leave it on. |
