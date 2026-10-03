# Telegram: notifications and chat

The bot is the notification center (reminders, what the agent filed, digests, failures) and a chat with the agent. It uses long polling, so nothing is exposed to the internet.

## Privacy

Bots are not end-to-end encrypted: Telegram's servers see the messages. Every outgoing text goes through `redact()` (`packages/core/src/redact.ts`): anything the agent marks as `||personal||` and recognisable amounts, IBANs, tax codes, card numbers and email addresses become `•••`. For details, follow the link to the web app. Files and messages **you** send to the bot do go through Telegram.

## Setup

1. In Telegram, @BotFather → `/newbot` → pick a name and a username → copy the token.
2. Optional, with BotFather: `/setprivacy` → Enable; `/setjoingroups` → Disable; `/setcommands`:
   ```
   oggi - scadenze di oggi e della settimana
   scadenze - prossime scadenze
   casi - pratiche aperte
   inbox - ultimi documenti
   fatto - segna fatta una scadenza
   salva - aggiungi un testo all'inbox
   nuova - nuova conversazione
   stato - stato del server
   ```
3. Set `TELEGRAM_BOT_TOKEN` on the server and restart.
4. Web app → Settings → Telegram → **Pair a chat** → send `/start <code>` to the bot within 10 minutes. The code works once; anyone else writing to the bot gets no answer.

## Use

- Send a voice message: it is transcribed on the server (ffmpeg + `parakeet-cli`, nothing leaves the machine), the bot shows what it understood, then the agent answers. A forwarded voice note, or one with a caption, goes to the inbox with its transcript instead.
- Write a question: the agent answers (read-only, same as the web chat; one conversation per chat, `/nuova` starts over).
- Send a photo or a PDF, or forward a message: it goes to the inbox and the agent files it.
- Reminders at 08:30 come with **✓ Fatto** buttons.
