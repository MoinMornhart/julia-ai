'use strict';

// Stoppuhr für den PC – rein rechnerisch, damit sie gut prüfbar bleibt.
// (Timer und Wecker laufen über die Erinnerungen.)

class Stoppuhr {
  constructor(jetzt = Date.now) {
    this.jetzt = jetzt;
    this.zuruecksetzen();
  }

  zuruecksetzen() {
    this.startZeit = null;
    this.summe = 0;
    this.runden = [];
    return this.status();
  }

  start() {
    if (this.startZeit == null) this.startZeit = this.jetzt();
    return this.status();
  }

  stopp() {
    if (this.startZeit != null) {
      this.summe += this.jetzt() - this.startZeit;
      this.startZeit = null;
    }
    return this.status();
  }

  runde() {
    const t = this.verstrichen();
    this.runden.push(t);
    return this.status();
  }

  get laeuft() {
    return this.startZeit != null;
  }

  verstrichen() {
    return this.summe + (this.startZeit != null ? this.jetzt() - this.startZeit : 0);
  }

  status() {
    return { laeuft: this.laeuft, ms: this.verstrichen(), runden: [...this.runden] };
  }
}

// Millisekunden lesbar: unter einer Stunde "m:ss,z", sonst "h:mm:ss".
function zeitFormat(ms) {
  const gesamt = Math.max(0, Math.floor(ms));
  const s = Math.floor(gesamt / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sek = s % 60;
  if (h) return `${h}:${String(m).padStart(2, '0')}:${String(sek).padStart(2, '0')}`;
  const zehntel = Math.floor((gesamt % 1000) / 100);
  return `${m}:${String(sek).padStart(2, '0')},${zehntel}`;
}

module.exports = { Stoppuhr, zeitFormat };
