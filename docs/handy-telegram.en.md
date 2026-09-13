# Controlling Julia from your phone (Telegram)

You can message Julia on the go: "Is the download still running?", "How full is the
disk?", "Send me tomorrow's events", "Shut the PC down in 10 minutes". This works through
**your own Telegram bot** that only you use. Julia polls it herself – no server, no port
forwarding, no static IP needed.

## 1. Create the bot (2 minutes)

1. Open Telegram and search for **@BotFather** (blue check mark).
2. Send it `/newbot`.
3. Name: e.g. `Julia`. Username: must end in `bot`, e.g. `philips_julia_bot`.
4. BotFather replies with a **token** like `123456789:AAH…`. Copy it.

The token is like a password for the bot. Don't give it to anyone but Julia.

## 2. Connect in Julia

1. Julia → **Settings → Connections → Phone (Telegram)**.
2. Paste the token, **Connect bot**.
3. Julia shows a **6-digit code** and an **Open in Telegram** button. Tap the link on your
   phone, or open your bot and press **Start** – or send it the code. The code is valid for
   15 minutes.
4. The bot replies: *"Connected. From now on I only listen to you."*

## Commands

| Command | Effect |
|---|---|
| just write | Julia does it on the PC and replies briefly |
| `/stop` | cancels the current task immediately |
| `/new` | new conversation |
| `/status` | quick look: battery, memory, disk, what's running |
| `/help` | this overview |

It's the same conversation as on the PC: what you start on the phone you can continue at
the PC. Messages from the phone appear in the chat window with 📱.

## Security

- **Only you:** after pairing, the bot responds exclusively to your Telegram account.
  Messages from anyone else are ignored and noted in the log.
- **Pairing:** 6-digit code, valid for 15 minutes, void after 5 wrong attempts.
- **No stale commands:** messages older than two minutes (e.g. sent while the PC was off)
  are not executed.
- **The traffic light applies here too.** RED stays RED. Julia asks for YELLOW actions on
  the phone with **✅ Yes / ❌ No**. If you don't want that, set *Approvals for tasks from the
  phone* to **only at the PC** in the settings.
- **Log:** every task from the phone is recorded in `protokoll.jsonl`.
- **Token:** stored encrypted by Windows in `%APPDATA%\Julia\konten.json`.

Two honest notes:

1. **Protect your Telegram account.** Whoever has your Telegram can give Julia tasks.
   Turn on **two-step verification** in Telegram (*Settings → Privacy and Security →
   Two-Step Verification*).
2. **Telegram can read along.** Bot chats are not end-to-end encrypted; messages pass
   through Telegram's servers. For truly confidential things, work at the PC.

## Disconnecting

**Settings → Connections → Phone → Disconnect.** Julia sends one last message, stops
polling the bot and deletes the token and pairing. You can delete the bot itself with
`/deletebot` at @BotFather.
