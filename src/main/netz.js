'use strict';

const os = require('os');
const net = require('net');

// Netz-Helfer für den Geräte-Abgleich (Sync): erkennen, welche Adressen zum
// Heimnetz oder eigenen VPN gehören, und die Adressen dieses PCs auflisten.

const ipNormal = (ip) => String(ip || '').replace(/^::ffff:/i, '');

// VPN-Adressen aus 100.64.0.0/10 (Tailscale und andere VPNs mit CGNAT-Bereich).
function vpnAdresse(roh) {
  const ip = ipNormal(roh);
  if (!net.isIPv4(ip)) return false;
  const [a, b] = ip.split('.').map(Number);
  return a === 100 && b >= 64 && b <= 127;
}

// Nur Heimnetz oder eigenes VPN: private IPv4-Bereiche, Link-Local, Loopback,
// private IPv6 und VPN-Adressen. Aus dem offenen Internet kommt niemand rein.
function privateAdresse(roh) {
  const ip = ipNormal(roh);
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254) || vpnAdresse(ip);
  }
  if (net.isIPv6(ip)) {
    const k = ip.toLowerCase();
    return k === '::1' || /^f[cd]/.test(k) || /^fe[89ab]/.test(k);
  }
  return false;
}

// Gegen DNS-Rebinding: Die Seite wird nur über eine IP-Adresse aufgerufen.
function hostErlaubt(host) {
  const m = /^(\[[0-9a-f:.]+\]|[0-9.]+|localhost)(:\d{1,5})?$/.exec(String(host || '').toLowerCase());
  if (!m) return false;
  const name = m[1].replace(/^\[|\]$/g, '');
  return name === 'localhost' || net.isIP(name) !== 0;
}

// Adressen dieses PCs im Heimnetz; echte Netzwerkkarten vor virtuellen.
function lanAdressen(karten = os.networkInterfaces()) {
  const liste = [];
  for (const [karte, eintraege] of Object.entries(karten)) {
    for (const e of eintraege || []) {
      if (e.family !== 'IPv4' || e.internal || !privateAdresse(e.address) || vpnAdresse(e.address) || e.address.startsWith('169.254.')) continue;
      const virtuell = /vethernet|virtualbox|vmware|hyper-v|wsl|docker|loopback|bluetooth|tailscale|zerotier/i.test(karte);
      liste.push({ adresse: e.address, virtuell });
    }
  }
  liste.sort((x, y) => x.virtuell - y.virtuell);
  return liste.map((x) => x.adresse);
}

// Adressen dieses PCs im VPN (z. B. Tailscale): Darüber erreicht der Abgleich
// den anderen PC auch unterwegs – ohne offenen Port am Router.
function unterwegsAdressen(karten = os.networkInterfaces()) {
  const liste = [];
  for (const eintraege of Object.values(karten)) {
    for (const e of eintraege || []) if (e.family === 'IPv4' && !e.internal && vpnAdresse(e.address)) liste.push(e.address);
  }
  return liste;
}

module.exports = { ipNormal, vpnAdresse, privateAdresse, hostErlaubt, lanAdressen, unterwegsAdressen };
