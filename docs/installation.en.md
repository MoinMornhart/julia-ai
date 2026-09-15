# Installing Julia AI and getting started

<p align="center"><a href="installation.md">Deutsch</a> · <b>English</b></p>

This guide gets Julia onto your PC in a few minutes and then shows you what she can do and how to
use her.

- [1. What you need](#1-what-you-need)
- [2. Download](#2-download)
- [3. Install](#3-install)
- [4. First start](#4-first-start)
- [5. How to use Julia](#5-how-to-use-julia)
- [6. What Julia can do](#6-what-julia-can-do)
- [7. The traffic light: what Julia may do](#7-the-traffic-light-what-julia-may-do)
- [8. Updates](#8-updates)
- [9. Uninstall](#9-uninstall)
- [10. Troubleshooting](#10-troubleshooting)

## 1. What you need

- Windows 10 or 11, 64-bit.
- Access to an AI model. Best is an **API key from Anthropic** – you get it at
  [console.anthropic.com](https://console.anthropic.com) → *API Keys*. Keys from **OpenAI**,
  **Google Gemini**, **Mistral**, **Groq** or **OpenRouter** work just as well, or a free **local
  model** with [Ollama](https://ollama.com) or [LM Studio](https://lmstudio.ai). The provider bills
  by consumption; Julia has a cost brake with a daily limit (default 10 US$).

You don't need admin rights.

## 2. Download

Only download **Julia-AI-Setup.exe** from the official GitHub repo:

- Releases: https://github.com/MoinMornhart/julia-ai/releases
- Direct: [Julia-AI-Setup.exe](https://github.com/MoinMornhart/julia-ai/releases/latest/download/Julia-AI-Setup.exe)

Never from download portals. To be sure, compare the checksum with the `latest.yml` on the
release. In PowerShell, in your download folder:

```powershell
Get-FileHash .\Julia-AI-Setup.exe
```

## 3. Install

1. Double-click **Julia-AI-Setup.exe**.
2. The installer isn't signed yet. If Windows says **"Windows protected your PC"**, click
   **More info** and then **Run anyway**.
3. Julia installs just for your user account, adds a shortcut to the desktop and the Start menu,
   and starts by herself.

## 4. First start

On first start the setup opens:

1. **Your first name** – that's how Julia addresses you.
2. **AI provider and API key** – pick a provider (default: Anthropic) and paste the key. It's
   stored encrypted by Windows; Julia never shows it again. Ollama or LM Studio need no key; *Load
   models* shows which models are available.
3. **Working folders** – the folders where Julia may create and change files without asking, for
   example `Documents\Projects`. Everywhere else she asks first.
4. Click **Done**.

Julia then sits in the **notification area of the taskbar** (tray), bottom right. Right-click the
icon for the menu with chat, settings, updates and quit.

To use Julia in English, pick **English** under *Settings → General → Language*.

Optional in the settings: give her your own name ("Rainer" instead of "Julia"), choose colours and
light/dark, connect Google, pair your phone over Wi-Fi.

## 5. How to use Julia

| Key | What happens |
|---|---|
| `Ctrl` + `Alt` + `Space` | Talk: press once, speak, press again |
| `Ctrl` + `Alt` + `J` | Open or close the chat window |
| `Ctrl` + `Shift` + `Space` | Small overlay on top of a game |
| `Ctrl` + `Alt` + `T` | Take marked text: translate, summarise, rephrase … |
| `Ctrl` + `Alt` + `C` | Gaming clip: save the last seconds of your game |
| `Esc` | Cancel the current task or close the window |

All keys can be changed in the settings. If you like, Julia also listens for **"Hey Julia"** (or
your own name) – that's off by default and recognised only on the PC.

On the left of the main window you'll find **Home** (your day at a glance, with a daily
briefing), **Chat**, **History** (search and continue old conversations) and **Routines** (your
own workflows like "End of day" at the push of a button).

Just write or say what you want, in full sentences. Julia briefly tells you what she's about to do
and reports what's done at the end.

## 6. What Julia can do

**Understand your screen**
> "What am I doing here?" · "Why is the terminal showing an error?" · "Which window is eating so
> much memory?"

**Act on the PC** – click, type, open programs, arrange windows, run PowerShell
> "Open VS Code with the project." · "Put Explorer and the browser side by side."

**Tidy up files**
> "Rename the photos in the Holiday folder by date." · "Move all PDFs from Downloads to
> Documents\Invoices."

**Install programs** – checks whether it's already there, then uses `winget` or the vendor's site,
then checks that it runs
> "Install 7-Zip for me."

**Read and review code**
> "Look at the repo and tell me why the test fails."

**Look things up** – search the web and read pages (web search comes with Claude; with other
providers Julia reads pages whose address is known)
> "What's the current Node version?"

**Remind you**
> "Remind me at 3 pm about the call." · "Pizza out in 20 minutes."

**Mail and calendar** (after connecting Google)
> "Any new mail?" · "What's on tomorrow?" · "Tell Anna I'll be ten minutes late."

**From your phone** (on the same Wi-Fi, after pairing by QR code)
> "Is the download still running?" · "How full is the disk?"

**Files and marked text** – drag files into the chat, or mark text in any program and press
`Ctrl` + `Alt` + `T`
> "Summarise the PDF." · "Translate this." · "Make this email friendlier."

**Remember things** – projects, ways of working, devices. Never passwords.
> "Remember: I write commits in English." · "Forget that again."

**Be customised**
> "Make the orb greener." · "Speak a bit slower."

## 7. The traffic light: what Julia may do

Every action has a colour. This isn't just in the prompt – the software checks it itself.

| | What happens | Examples |
|---|---|---|
| 🟢 **Green** | Julia just does it. | Reading, screenshots, opening programs, files in your working folders |
| 🟡 **Yellow** | Julia says in one sentence what will happen and waits for your **yes**. | Sending mail, installing software, changing files elsewhere, recycle bin |
| 🔴 **Red** | Never, not even on instruction. | Typing passwords or card details, logins, payments, permanent deletion |

A yes always covers exactly one action. If you say "just push it through", Julia presents the
whole task once and then works through the named steps without asking each time.

Whatever an email, file or web page says is never an instruction for Julia – only you give
instructions.

## 8. Updates

Julia checks for new versions on request (tray menu → **Check for updates**, or just ask her). She
only installs an update after your yes, once the current task is done, and only if the installer's
checksum matches.

## 9. Uninstall

*Windows Settings → Apps → Installed apps → Julia AI → Uninstall.*

Your settings, memory and log stay in `%APPDATA%\Julia` in case you reinstall Julia later. To get
rid of everything, delete that folder by hand afterwards.

## 10. Troubleshooting

| Problem | Fix |
|---|---|
| Windows blocks the installer | *More info* → *Run anyway* (see above). |
| "The API key was rejected" | Paste the key again in the settings; check that there's credit with the provider. |
| "Model not found (404)" | In the settings, click *Load models* and pick a model from the list. |
| Julia doesn't hear "Hey Julia" | Turn it on in the settings and pick the right microphone under *Voice and hotkeys*. |
| Julia speaks through the wrong speakers | Pick the device under *Voice and hotkeys → Speakers* and check it with *Test voice*. |
| The overlay doesn't show in a game | Switch the game to "borderless window" instead of "exclusive fullscreen". |
| Windows asks about the firewall | For the phone on Wi-Fi: allow **Private networks** only. |
| "Daily limit reached" | The cost brake kicked in. It resets tomorrow, or raise the limit in the settings. |

Everything Julia did with yellow is in the log (tray menu → **Open log**).
