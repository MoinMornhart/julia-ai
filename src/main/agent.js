'use strict';

const { EventEmitter } = require('events');
const { Anthropic } = require('@anthropic-ai/sdk');
const ampel = require('./ampel');
const werkzeuge = require('./werkzeuge');

// Die Gesprächsschleife: schickt den Verlauf an Claude, führt Werkzeuge aus,
// holt Freigaben ein und hält die Ampel durch – im Code, nicht nur im Prompt.

const MAX_RUNDEN = 60;

function modellFaehigkeiten(modell) {
  const m = String(modell);
  return {
    adaptiv: /claude-(opus-(5|4-[678])|sonnet-(5|4-6)|fable|mythos)/.test(m),
    fallback: /claude-(opus-5|fable-5-1|mythos-5-1)/.test(m),
    webNeu: /claude-(opus-(5|4-[678])|sonnet-(5|4-6)|fable|mythos)/.test(m),
  };
}

function textAus(content) {
  return (content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
}

function kurzeEingabe(eingabe) {
  const s = JSON.stringify(eingabe || {});
  return s.length > 160 ? s.slice(0, 160) + '…' : s;
}

class Agent extends EventEmitter {
  constructor({ config, ctx, apiSchluessel, systemPrompt, laufzeitKontext }) {
    super();
    this.config = config;
    this.ctx = ctx;
    this.apiSchluessel = apiSchluessel;
    this.systemPrompt = systemPrompt;
    this.laufzeitKontext = laufzeitKontext;
    this.verlauf = [];
    this.beschaeftigt = false;
    this.abbruch = null;
    this.offeneFreigaben = new Map();
    this.naechsteFreigabe = 1;
    this.auftrag = null;
    this.client = null;
    this.clientSchluessel = null;
    // Waren im Gespräch schon fremde Inhalte (Mail, Datei, Web, Bildschirm)?
    // Dann werden Aktionen nach außen GELB (ampel.nachFremdemInhalt).
    this.fremdKontakt = false;
  }

  _client() {
    const schluessel = this.apiSchluessel();
    if (!schluessel) {
      const e = new Error('KEIN_SCHLUESSEL');
      e.keinSchluessel = true;
      throw e;
    }
    if (!this.client || this.clientSchluessel !== schluessel) {
      this.client = new Anthropic({ apiKey: schluessel, timeout: 10 * 60 * 1000, maxRetries: 2 });
      this.clientSchluessel = schluessel;
    }
    return this.client;
  }

  neu() {
    if (this.beschaeftigt) this.abbrechen();
    this.verlauf = [];
    this.fremdKontakt = false;
  }

  abbrechen() {
    if (this.abbruch) this.abbruch.abort();
    for (const [id, f] of this.offeneFreigaben) {
      f({ ja: false });
      this.emit('freigabeErledigt', { id, ja: false });
    }
    this.offeneFreigaben.clear();
  }

  freigabeBeantworten(id, ja) {
    const f = this.offeneFreigaben.get(id);
    if (!f) return;
    this.offeneFreigaben.delete(id);
    f({ ja: !!ja });
    this.emit('freigabeErledigt', { id, ja: !!ja });
  }

  // Liefert den Text der letzten Antwort (für die Sprachausgabe) oder null.
  // kanal: 'desktop' (Chat oder Sprache am PC), 'mobile' (Handy) oder 'auto'.
  async senden(text, { perSprache = false, kanal = 'desktop' } = {}) {
    if (this.beschaeftigt) throw new Error('BESCHAEFTIGT');
    this.beschaeftigt = true;
    this.aktiverKanal = kanal;
    this.abbruch = new AbortController();
    this.emit('zustand', 'thinking');
    this.emit('start', { kanal });
    const sc = this.config.get('sprachcode');
    const kopf = [require('./prompt').zeitstempel(sc)];
    if (perSprache) kopf.push(sc === 'en' ? 'by voice, answer will be read aloud' : 'per Sprache, Antwort wird vorgelesen');
    if (kanal !== 'desktop') kopf.push(sc === 'en' ? `channel: ${kanal}` : `Kanal: ${kanal}`);
    this.verlauf.push({ role: 'user', content: [{ type: 'text', text: `[${kopf.join(' · ')}]\n${text}` }] });
    let letzterText = null;
    try {
      letzterText = await this._schleife();
      return letzterText;
    } catch (e) {
      if (this.abbruch.signal.aborted || e instanceof Anthropic.APIUserAbortError) {
        this.emit('hinweis', { art: 'abgebrochen' });
        return null;
      }
      this.emit('fehler', this._fehlertext(e));
      return null;
    } finally {
      this._reparieren();
      this.auftrag = null;
      this.aktiverKanal = null;
      this.abbruch = null;
      this.beschaeftigt = false;
      this.emit('fertig');
      this.emit('zustand', 'idle');
    }
  }

  // Kostenbremse: vor jeder Runde, damit auch ein langer Auftrag mittendrin stoppt.
  _limitPruefen() {
    const limit = Number(this.config.get('kosten.tageslimit_usd')) || 0;
    if (!limit || !this.ctx.kosten) return;
    const { usd } = this.ctx.kosten.heute();
    if (usd < limit) return;
    const en = this.config.get('sprachcode') === 'en';
    const e = new Error(en
      ? `Daily cost limit reached (${usd.toFixed(2)} of ${limit.toFixed(2)} US$). It resets tomorrow, or raise the limit in the settings.`
      : `Tageslimit für API-Kosten erreicht (${usd.toFixed(2)} von ${limit.toFixed(2)} US-$). Morgen geht es weiter, oder erhöhe das Limit in den Einstellungen.`);
    e.limit = true;
    throw e;
  }

  _kostenErfassen(modell, usage) {
    if (!this.ctx.kosten) return;
    const stand = this.ctx.kosten.erfassen(modell, usage);
    this.emit('kosten', stand);
    const limit = Number(this.config.get('kosten.tageslimit_usd')) || 0;
    if (limit && stand.usd >= limit * 0.8 && this.warnTag !== stand.tag) {
      this.warnTag = stand.tag;
      this.emit('hinweis', { art: 'kosten_warnung' });
    }
  }

  _fehlertext(e) {
    if (e.limit) return { art: 'text', text: e.message };
    if (e.keinSchluessel) return { art: 'kein_schluessel' };
    if (e instanceof Anthropic.AuthenticationError) return { art: 'text', text: 'Der API-Schlüssel wurde abgelehnt (401). Bitte in den Einstellungen prüfen.' };
    if (e instanceof Anthropic.PermissionDeniedError) return { art: 'text', text: `Kein Zugriff auf dieses Modell oder diese Funktion (403): ${e.message}` };
    if (e instanceof Anthropic.RateLimitError) return { art: 'text', text: 'Zu viele Anfragen (429). Kurz warten und nochmal versuchen.' };
    if (e instanceof Anthropic.BadRequestError) return { art: 'text', text: `Die Anfrage wurde abgelehnt (400): ${e.message}` };
    if (e instanceof Anthropic.APIConnectionError) return { art: 'text', text: 'Keine Verbindung zur Anthropic-API. Internet prüfen.' };
    if (e instanceof Anthropic.APIError) return { art: 'text', text: `API-Fehler ${e.status ?? ''}: ${e.message}` };
    return { art: 'text', text: e.message || String(e) };
  }

  // Nach einem Abbruch darf kein tool_use ohne tool_result im Verlauf stehen,
  // sonst lehnt die API die nächste Anfrage ab.
  _reparieren() {
    const letzte = this.verlauf[this.verlauf.length - 1];
    if (!letzte || letzte.role !== 'assistant' || !Array.isArray(letzte.content)) return;
    const offen = letzte.content.filter((b) => b.type === 'tool_use');
    if (!offen.length) return;
    this.verlauf.push({
      role: 'user',
      content: offen.map((b) => ({ type: 'tool_result', tool_use_id: b.id, content: 'Abgebrochen durch den Nutzer.', is_error: true })),
    });
  }

  _parameter() {
    const modell = this.config.get('modell');
    const f = modellFaehigkeiten(modell);
    const betas = ['context-management-2025-06-27'];
    if (f.fallback) betas.push('server-side-fallback-2026-07-01');
    const tools = [
      ...werkzeuge.definitionen(this.ctx),
      f.webNeu
        ? { type: 'web_search_20260209', name: 'web_search', max_uses: 8 }
        : { type: 'web_search_20250305', name: 'web_search', max_uses: 8 },
      f.webNeu
        ? { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 8 }
        : { type: 'web_fetch_20250910', name: 'web_fetch', max_uses: 8 },
    ];
    const p = {
      model: modell,
      max_tokens: 32000,
      betas,
      system: [
        { type: 'text', text: this.systemPrompt(), cache_control: { type: 'ephemeral' } },
        { type: 'text', text: this.laufzeitKontext() },
      ],
      tools,
      messages: this.verlauf,
      context_management: { edits: [{ type: 'clear_tool_uses_20250919' }] },
      cache_control: { type: 'ephemeral' },
    };
    if (f.fallback) p.fallbacks = 'default';
    if (f.adaptiv) {
      p.thinking = { type: 'adaptive' };
      p.output_config = { effort: this.config.get('aufwand') || 'high' };
    }
    return p;
  }

  async _schleife() {
    const client = this._client();
    let letzterText = null;
    for (let runde = 0; runde < MAX_RUNDEN; runde++) {
      this._limitPruefen();
      const parameter = this._parameter();
      const stream = client.beta.messages.stream(parameter, { signal: this.abbruch.signal });
      stream.on('text', (d) => this.emit('text', d));
      const msg = await stream.finalMessage();
      this._kostenErfassen(msg.model || parameter.model, msg.usage);

      if (msg.content && msg.content.length) this.verlauf.push({ role: 'assistant', content: msg.content });
      // Websuche und Seitenabruf laufen bei Anthropic; ihre Ergebnisse sind fremde Inhalte.
      if ((msg.content || []).some((b) => /^(web_search|web_fetch)_tool_result$/.test(b.type))) this.fremdKontakt = true;
      const text = textAus(msg.content);
      if (text) letzterText = text;

      if (msg.stop_reason === 'pause_turn') continue;
      if (msg.stop_reason === 'refusal') {
        this.emit('hinweis', { art: 'verweigert' });
        return letzterText;
      }
      if (msg.stop_reason === 'max_tokens') {
        this.emit('hinweis', { art: 'max_tokens' });
        return letzterText;
      }
      if (msg.stop_reason !== 'tool_use') return letzterText;

      const aufrufe = msg.content.filter((b) => b.type === 'tool_use');
      const ergebnisse = [];
      for (const aufruf of aufrufe) {
        if (this.abbruch.signal.aborted) {
          ergebnisse.push({ type: 'tool_result', tool_use_id: aufruf.id, content: 'Abgebrochen durch den Nutzer.', is_error: true });
          continue;
        }
        ergebnisse.push(await this._werkzeug(aufruf));
      }
      this.verlauf.push({ role: 'user', content: ergebnisse });
      if (this.abbruch.signal.aborted) throw new Anthropic.APIUserAbortError();
    }
    this.emit('hinweis', { art: 'zu_viele_runden' });
    return letzterText;
  }

  async _werkzeug(aufruf) {
    const ergebnis = (content, istFehler = false) => ({ type: 'tool_result', tool_use_id: aufruf.id, content, ...(istFehler ? { is_error: true } : {}) });
    const w = werkzeuge.finden(aufruf.name, this.ctx);
    this.emit('werkzeug', { id: aufruf.id, name: aufruf.name, eingabe: kurzeEingabe(aufruf.input) });
    if (!w) {
      this.emit('werkzeugFertig', { id: aufruf.id, ok: false });
      return ergebnis(`Unbekanntes Werkzeug ${aufruf.name}.`, true);
    }
    try {
      if (aufruf.name === 'auftrag_vorlegen') {
        const text = await this._auftragVorlegen(aufruf.input || {});
        this.emit('werkzeugFertig', { id: aufruf.id, ok: true });
        return ergebnis(text);
      }
      const e = aufruf.input || {};
      const stufe = ampel.nachFremdemInhalt(w.einstufen(e, this.ctx), this.fremdKontakt, w.nachAussen ? w.nachAussen(e) : false, !!w.dauerhaft);
      // Freigaben zeigen immer die vollständigen Parameter, nie eine gekürzte Fassung.
      const beschreibung = stufe.beschreibung || `${aufruf.name} ${JSON.stringify(e)}`;

      if (stufe.stufe === ampel.ROT) {
        this.ctx.protokoll.eintragen({ werkzeug: aufruf.name, eingabe: e, stufe: 'ROT', ergebnis: 'gesperrt', grund: stufe.grund });
        this.emit('werkzeugFertig', { id: aufruf.id, ok: false, rot: true });
        return ergebnis(`ROT, gesperrt: ${stufe.grund}. Nicht ausgeführt. Erklär kurz, warum, und wie es ohne dich geht. Nicht auf anderem Weg versuchen.`, true);
      }

      if (stufe.stufe === ampel.GELB) {
        const f = await this._freigabe({ werkzeug: aufruf.name, beschreibung, grund: stufe.grund, kategorie: stufe.kategorie });
        if (!f.erlaubt) {
          this.ctx.protokoll.eintragen({ werkzeug: aufruf.name, eingabe: e, stufe: 'GELB', ergebnis: f.vorgemerkt ? 'vorgemerkt' : 'abgelehnt' });
          this.emit('werkzeugFertig', { id: aufruf.id, ok: false });
          return ergebnis(f.grund, true);
        }
      }

      const inhalt = await w.ausfuehren(e, this.ctx);
      if (w.fremd) this.fremdKontakt = true;
      if (stufe.stufe === ampel.GELB) {
        const zusammenfassung = typeof inhalt === 'string' ? inhalt.slice(0, 500) : 'ok';
        this.ctx.protokoll.eintragen({ werkzeug: aufruf.name, eingabe: e, stufe: 'GELB', kategorie: stufe.kategorie, ergebnis: zusammenfassung });
        if (this.auftrag) this.auftrag.gelaufen.push(beschreibung);
      }
      this.emit('werkzeugFertig', { id: aufruf.id, ok: true });
      return ergebnis(inhalt);
    } catch (err) {
      this.emit('werkzeugFertig', { id: aufruf.id, ok: false });
      return ergebnis(`Fehler: ${err.message}`, true);
    }
  }

  _frage(anfrage) {
    const id = this.naechsteFreigabe++;
    return new Promise((resolve) => {
      this.offeneFreigaben.set(id, resolve);
      this.emit('freigabe', { id, kanal: this.aktiverKanal, ...anfrage });
      this.emit('zustand', 'idle');
    }).finally(() => this.emit('zustand', 'thinking'));
  }

  async _freigabe({ werkzeug, beschreibung, grund, kategorie }) {
    if (this.config.get('kanal') === 'auto' || this.aktiverKanal === 'auto') {
      this.ctx.protokoll.vormerken({ werkzeug, beschreibung });
      this.ctx.kontextGeaendert();
      return { erlaubt: false, vorgemerkt: true, grund: 'Kanal auto: GELB-Aktion wurde vorgemerkt und nicht ausgeführt.' };
    }
    if (this.auftrag && kategorie && this.auftrag.kategorien.includes(kategorie)) {
      return { erlaubt: true };
    }
    const antwort = await this._frage({ art: 'einzeln', werkzeug, beschreibung, grund, kategorie });
    return antwort.ja
      ? { erlaubt: true }
      : { erlaubt: false, grund: 'Der Nutzer hat diese Aktion abgelehnt. Nicht ausgeführt, nicht auf anderem Weg versuchen.' };
  }

  async _auftragVorlegen({ beschreibung, schritte, kategorien }) {
    const kat = (Array.isArray(kategorien) ? kategorien : []).filter((k) => ampel.KATEGORIEN.includes(k));
    if (this.config.get('kanal') === 'auto') {
      return 'Kanal auto: Aufträge mit GELB-Schritten werden nicht freigegeben. Nur GRÜN arbeiten, den Rest vormerken.';
    }
    const antwort = await this._frage({
      art: 'auftrag',
      werkzeug: 'auftrag_vorlegen',
      beschreibung: String(beschreibung || ''),
      schritte: (Array.isArray(schritte) ? schritte : []).map(String),
      kategorien: kat,
    });
    if (!antwort.ja) return 'Der Nutzer hat den Auftrag nicht freigegeben. Jede GELB-Aktion wird einzeln gefragt.';
    this.auftrag = { kategorien: kat, gelaufen: [] };
    return `Freigegeben für diesen Auftrag, Kategorien: ${kat.join(', ') || '(keine)'}. Andere GELB-Aktionen werden weiter einzeln gefragt, ROT bleibt gesperrt. Am Ende sagen, was alles gelaufen ist.`;
  }
}

module.exports = { Agent, modellFaehigkeiten };
