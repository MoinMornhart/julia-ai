'use strict';

const crypto = require('crypto');
const { EventEmitter } = require('events');

// Handy-Verbindung über einen eigenen Telegram-Bot. Kein eigener Server, keine
// Portfreigabe: Julia fragt die Bot-API selbst ab (Long-Polling).
//
// Sicherheit:
// - Der Bot hört nach der Kopplung nur auf genau ein Telegram-Konto (Chat- und
//   Nutzer-ID). Alles andere wird ignoriert und protokolliert.
// - Gekoppelt wird mit einem 6-stelligen Code, der 15 Minuten gilt und nach
//   5 Fehlversuchen verfällt.
// - Nachrichten, die älter als 2 Minuten sind, werden nicht ausgeführt – etwa
//   Befehle, die ankamen, während der PC aus war.
// - Der Bot-Token liegt verschlüsselt im Tresor und taucht in keiner
//   Fehlermeldung auf.

const API = 'https://api.telegram.org';
const DIENST = 'telegram';
const CODE_GUELTIG_MS = 15 * 60 * 1000;
const MAX_FEHLVERSUCHE = 5;
const ALT_MS = 2 * 60 * 1000;
const MAX_LAENGE = 4000;
const TOKEN_MUSTER = /^\d{5,}:[A-Za-z0-9_-]{30,}$/;

// Telegram zeigt Markdown ohne parse_mode als Zeichen an – also raus damit.
function fuerHandy(text) {
  return String(text || '')
    .replace(/```[a-z0-9+#.-]*\n?([\s\S]*?)```/gi, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '$1 ($2)')
    .trim();
}

function zerlegen(text, max = MAX_LAENGE) {
  const teile = [];
  let rest = String(text || '');
  while (rest.length > max) {
    let schnitt = rest.lastIndexOf('\n', max);
    if (schnitt < max * 0.5) schnitt = rest.lastIndexOf(' ', max);
    if (schnitt < max * 0.5) schnitt = max;
    teile.push(rest.slice(0, schnitt));
    rest = rest.slice(schnitt).replace(/^\s+/, '');
  }
  if (rest) teile.push(rest);
  return teile;
}

function sicherGleich(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

class TelegramFehler extends Error {}

class TelegramHandy extends EventEmitter {
  constructor({ tresor, abruf = globalThis.fetch, texte = (k) => k, jetzt = () => Date.now(), warte, autostart = true }) {
    super();
    this.tresor = tresor;
    this.abruf = abruf;
    this.texte = texte;
    this.jetzt = jetzt;
    this.warte = warte || ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.autostart = autostart;
    this.laeuft = false;
    this.lauf = 0;
    this.abbruch = null;
    this.offset = 0;
    this.kopplung = null;
    this.fehlversuche = 0;
    this.fehler = null;
    this.freigabeNachrichten = new Map();
  }

  _daten() {
    return this.tresor.lesen(DIENST) || {};
  }

  status() {
    const d = this._daten();
    const codeGueltig = !!this.kopplung && this.jetzt() < this.kopplung.bis;
    return {
      eingerichtet: !!d.token,
      gekoppelt: !!d.chat_id,
      bot: d.bot_name || null,
      nutzer: d.nutzername || null,
      code: codeGueltig ? this.kopplung.code : null,
      codeAbgelaufen: !!this.kopplung && !codeGueltig,
      link: codeGueltig && d.bot_name ? `https://t.me/${d.bot_name}?start=${this.kopplung.code}` : null,
      laeuft: this.laeuft,
      fehler: this.fehler,
    };
  }

  get gekoppelt() {
    return !!this._daten().chat_id;
  }

  _verbergen(text, token) {
    return token ? String(text).split(token).join('***') : String(text);
  }

  async _api(methode, daten, { token, signal } = {}) {
    const t = token || this._daten().token;
    if (!t) throw new TelegramFehler('Kein Telegram-Bot eingerichtet.');
    let r;
    try {
      r = await this.abruf(`${API}/bot${t}/${methode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(daten || {}),
        signal,
      });
    } catch (e) {
      if (e && e.name === 'AbortError') throw e;
      throw new TelegramFehler(this._verbergen(`Telegram ist nicht erreichbar: ${e.message}`, t));
    }
    const j = await r.json().catch(() => ({}));
    if (!j.ok) {
      const fehler = new TelegramFehler(this._verbergen(j.description || `Telegram-Fehler ${r.status}`, t));
      fehler.code = j.error_code || r.status;
      throw fehler;
    }
    return j.result;
  }

  // --- Einrichten, Koppeln, Trennen ---

  async einrichten(token) {
    const alt = this._daten();
    const t = String(token || alt.token || '').trim();
    if (!TOKEN_MUSTER.test(t)) throw new TelegramFehler(this.texte('handy.fehler_format'));
    let ich;
    try {
      ich = await this._api('getMe', {}, { token: t });
    } catch (e) {
      if (e.code === 401 || e.code === 404) throw new TelegramFehler(this.texte('handy.fehler_token'));
      throw e;
    }
    const neuerBot = alt.token !== t;
    this.tresor.schreiben(DIENST, {
      token: t,
      bot_name: ich.username,
      ...(neuerBot ? { chat_id: null, user_id: null, nutzername: null } : {}),
    });
    if (!this._daten().chat_id) {
      this.kopplung = { code: String(crypto.randomInt(100000, 1000000)), bis: this.jetzt() + CODE_GUELTIG_MS };
      this.fehlversuche = 0;
    }
    this.fehler = null;
    if (neuerBot) this.offset = 0;
    if (this.autostart) this.starten();
    this.emit('status');
    return this.status();
  }

  async trennen() {
    const d = this._daten();
    this.stoppen();
    if (d.chat_id && d.token) {
      await this._api('sendMessage', { chat_id: d.chat_id, text: this.texte('handy.getrennt') }, { token: d.token }).catch(() => {});
    }
    this.tresor.loeschen(DIENST);
    this.kopplung = null;
    this.fehler = null;
    this.freigabeNachrichten.clear();
    this.emit('status');
    return this.status();
  }

  // --- Abfrageschleife ---

  starten() {
    if (this.laeuft || !this._daten().token) return;
    this.laeuft = true;
    this.lauf += 1;
    this._schleife(this.lauf);
  }

  stoppen() {
    this.laeuft = false;
    this.lauf += 1;
    if (this.abbruch) this.abbruch.abort();
  }

  async _schleife(meiner) {
    let pause = 1000;
    while (this.laeuft && this.lauf === meiner) {
      this.abbruch = new AbortController();
      try {
        const updates = await this._api('getUpdates', {
          offset: this.offset,
          timeout: 50,
          allowed_updates: ['message', 'callback_query'],
        }, { signal: this.abbruch.signal });
        pause = 1000;
        if (this.fehler) { this.fehler = null; this.emit('status'); }
        for (const u of updates || []) {
          this.offset = u.update_id + 1;
          try { await this.verarbeiten(u); } catch (e) { this.emit('fehler', e); }
        }
      } catch (e) {
        if (this.lauf !== meiner || (e && e.name === 'AbortError')) return;
        if (e.code === 401 || e.code === 404) {
          this.fehler = this.texte('handy.fehler_token');
          this.laeuft = false;
          this.emit('status');
          return;
        }
        this.fehler = e.code === 409 ? this.texte('handy.fehler_konflikt') : e.message;
        this.emit('status');
        await this.warte(pause);
        pause = Math.min(60000, pause * 2);
      }
    }
  }

  // Öffentlich, damit Tests einzelne Updates durchspielen können.
  async verarbeiten(u) {
    const d = this._daten();
    if (u.callback_query) return this._rueckruf(u.callback_query, d);
    const m = u.message;
    if (!m || !m.chat || m.chat.type !== 'private' || !m.from || m.from.is_bot) return;
    const text = typeof m.text === 'string' ? m.text.trim() : '';

    if (!d.chat_id) return this._koppeln(m, text);

    if (m.chat.id !== d.chat_id || m.from.id !== d.user_id) {
      this.emit('fremd', { id: m.from.id, name: m.from.username || m.from.first_name || '' });
      return;
    }
    if (m.date && m.date * 1000 < this.jetzt() - ALT_MS) {
      await this._an(d.chat_id, this.texte('handy.zu_alt'));
      return;
    }
    if (!text) {
      await this._an(d.chat_id, this.texte('handy.nur_text'));
      return;
    }
    const befehl = /^\/([a-z]+)(?:@\w+)?(?:\s|$)/i.exec(text);
    if (befehl) {
      switch (befehl[1].toLowerCase()) {
        case 'stopp':
        case 'stop':
          this.emit('stopp');
          return;
        case 'neu':
        case 'new':
          this.emit('neu');
          return;
        case 'status':
          this.emit('nachricht', { text: this.texte('handy.status_frage') });
          return;
        default:
          await this._an(d.chat_id, this.texte('handy.hilfe'));
          return;
      }
    }
    this.emit('nachricht', { text });
  }

  async _koppeln(m, text) {
    const code = (/^\/start\s+(\d{6})$/.exec(text) || /^(\d{6})$/.exec(text) || [])[1];
    if (!code || !this.kopplung) return;
    if (this.jetzt() >= this.kopplung.bis) return;
    if (!sicherGleich(code, this.kopplung.code)) {
      this.fehlversuche += 1;
      if (this.fehlversuche >= MAX_FEHLVERSUCHE) {
        this.kopplung = null;
        this.emit('status');
      }
      return;
    }
    const name = m.from.username ? `@${m.from.username}` : (m.from.first_name || 'Telegram');
    this.tresor.schreiben(DIENST, { chat_id: m.chat.id, user_id: m.from.id, nutzername: name });
    this.kopplung = null;
    this.fehlversuche = 0;
    await this._an(m.chat.id, this.texte('handy.verbunden_nachricht'));
    this.emit('status');
    this.emit('gekoppelt', { nutzer: name });
  }

  async _rueckruf(q, d) {
    const erlaubt = d.chat_id && q.from && q.from.id === d.user_id && q.message && q.message.chat && q.message.chat.id === d.chat_id;
    if (!erlaubt) {
      await this._api('answerCallbackQuery', { callback_query_id: q.id, text: 'Nicht erlaubt.' }).catch(() => {});
      if (q.from) this.emit('fremd', { id: q.from.id, name: q.from.username || '' });
      return;
    }
    await this._api('answerCallbackQuery', { callback_query_id: q.id }).catch(() => {});
    const m = /^f:(\d+):([01])$/.exec(q.data || '');
    if (m) this.emit('freigabe', { id: Number(m[1]), ja: m[2] === '1' });
  }

  // --- Senden ---

  async _an(chatId, text) {
    for (const teil of zerlegen(text)) {
      await this._api('sendMessage', { chat_id: chatId, text: teil, link_preview_options: { is_disabled: true } });
    }
  }

  async senden(text) {
    const d = this._daten();
    if (!d.chat_id) return;
    const sauber = fuerHandy(text);
    if (sauber) await this._an(d.chat_id, sauber);
  }

  async tippt() {
    const d = this._daten();
    if (!d.chat_id) return;
    await this._api('sendChatAction', { chat_id: d.chat_id, action: 'typing' }).catch(() => {});
  }

  async freigabeFragen(f, { knoepfe = true } = {}) {
    const d = this._daten();
    if (!d.chat_id) return;
    const zeilen = [this.texte('handy.freigabe_titel'), '', String(f.beschreibung || '')];
    if (Array.isArray(f.schritte) && f.schritte.length) zeilen.push('', ...f.schritte.map((s, i) => `${i + 1}. ${s}`));
    if (f.grund) zeilen.push('', `(${f.grund})`);
    if (!knoepfe) zeilen.push('', this.texte('handy.freigabe_pc'));
    const text = zeilen.join('\n').slice(0, MAX_LAENGE);
    const n = await this._api('sendMessage', {
      chat_id: d.chat_id,
      text,
      ...(knoepfe ? {
        reply_markup: {
          inline_keyboard: [[
            { text: this.texte('handy.ja'), callback_data: `f:${f.id}:1` },
            { text: this.texte('handy.nein'), callback_data: `f:${f.id}:0` },
          ]],
        },
      } : {}),
    });
    this.freigabeNachrichten.set(f.id, { id: n.message_id, text });
  }

  // Knöpfe entfernen und das Ergebnis dazuschreiben, egal wo geantwortet wurde.
  async freigabeErledigt(id, ja) {
    const n = this.freigabeNachrichten.get(id);
    if (!n) return;
    this.freigabeNachrichten.delete(id);
    const d = this._daten();
    await this._api('editMessageText', {
      chat_id: d.chat_id,
      message_id: n.id,
      text: `${n.text}\n\n${this.texte(ja ? 'handy.freigegeben' : 'handy.abgelehnt')}`.slice(0, MAX_LAENGE),
    }).catch(() => {});
  }
}

module.exports = { TelegramHandy, TelegramFehler, fuerHandy, zerlegen, TOKEN_MUSTER, ALT_MS };
