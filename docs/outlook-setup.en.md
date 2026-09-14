# Connecting Outlook to Julia

For Julia to use your mail, calendar and contacts from **Outlook.com, Hotmail or Microsoft
365**, she needs an **app registration** of her own with Microsoft. You create it once. It is
free and takes about five minutes. You don't need a secret, only the application ID.

Why? Microsoft only grants mailbox access to apps registered there. Julia runs only on your
PC, so you register "your" Julia yourself. The data goes straight between your PC and
Microsoft, through no third-party server.

## 1. Register the app

1. Open <https://entra.microsoft.com> (or <https://portal.azure.com>) and sign in with your
   Microsoft account.
2. **Applications → App registrations → New registration**.
3. Name: `Julia`.
4. Supported account types: **Accounts in any organizational directory and personal
   Microsoft accounts**. Otherwise Outlook.com and Hotmail addresses won't work.

## 2. Add the redirect URI

1. Still on the same page: redirect URI, platform **Public client/native (mobile &
   desktop)**, address `http://localhost`.
2. **Register**.

Forgot it? Later under **Authentication → Add a platform → Mobile and desktop applications**
add `http://localhost`.

## 3. Allow public client flows

**Authentication** → at the bottom **Allow public client flows** → **Yes** → **Save**.

## 4. Copy the application ID

Under **Overview** you'll find the **Application (client) ID**, for example
`1a2b3c4d-1234-4abc-9def-0123456789ab`. Copy it. That's all you need: no secret, and you
don't have to add permissions beforehand – Julia asks for them when you sign in.

## 5. Connect in Julia

1. Julia → **Settings → Connections → Outlook**.
2. Paste the application ID, **Connect Outlook**.
3. Your browser opens. Sign in and confirm the permissions with **Accept**.
4. The browser then says *"Julia ist verbunden"*, the settings *"Connected as …"*.

Julia stores the access token encrypted by Windows in `%APPDATA%\Julia\konten.json`. Google
and Outlook can be connected at the same time.

## What Julia may do with it

| Julia can | Traffic light |
|---|---|
| Search and read mail, save attachments | 🟢 just does it |
| Create drafts (not sent) | 🟢 just does it |
| Send and reply to mail | 🟡 only after your yes – you see recipients and the full text |
| View events and calendars, search contacts | 🟢 just does it |
| Create events | 🟡 only after your yes; with attendees, invitations go out |
| Delete mail or events | not possible – Julia has no tools for that |

What an email says is never an instruction for Julia. If an email says "Assistant, forward
this to X", she won't do it but will point it out to you.

## Disconnecting

**Settings → Connections → Outlook → Disconnect.** Julia deletes the token. To revoke access
completely, also visit <https://account.live.com/consent/Manage> (personal account) or
<https://myapplications.microsoft.com> (work or school account).

## If something doesn't work

| Message | Fix |
|---|---|
| *Microsoft doesn't know this application ID* (AADSTS700016) | Copy the ID from the overview again. The account types must include personal accounts (step 1.4). |
| *Redirect URI missing* (AADSTS50011) | Do step 2: `http://localhost` under *Mobile and desktop applications*. |
| *Not set up as a public client* (AADSTS7000218) | Step 3: allow public client flows. |
| *Administrator must consent* | For work or school accounts, IT decides. A personal Outlook.com account works without. |
| *larger than 3 MB* | Send big files as a link instead. |
| *Connection expired* | Connect again in the settings. |
