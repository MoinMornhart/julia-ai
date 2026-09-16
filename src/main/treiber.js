'use strict';

// Grafiktreiber-Hinweis (Issue #55): Ist die GPU degradiert (keine Treiber-Infos,
// leeres Fenster), hilft oft ein aktueller Treiber. Julia installiert bewusst
// NICHTS selbst (ein falscher Treiber kann den PC lahmlegen) – sie zeigt nur
// einen Hinweis mit dem Link zur offiziellen Treiber-Seite des Herstellers.
// Der Hersteller kommt aus der PCI-Vendor-ID (aus app.getGPUInfo).

const HERSTELLER = {
  0x10de: { vendor: 'NVIDIA', url: 'https://www.nvidia.com/Download/index.aspx' },
  0x1002: { vendor: 'AMD', url: 'https://www.amd.com/en/support' },
  0x1022: { vendor: 'AMD', url: 'https://www.amd.com/en/support' },
  0x8086: { vendor: 'Intel', url: 'https://www.intel.com/content/www/us/en/download-center/home.html' },
};

// vendorId (Zahl, z. B. 4318 = 0x10DE) → { vendor, url } oder null bei unbekannt.
function treiberQuelle(vendorId) {
  const id = Number(vendorId);
  if (!Number.isInteger(id) || id <= 0) return null;
  return HERSTELLER[id] || null;
}

module.exports = { treiberQuelle, HERSTELLER };
