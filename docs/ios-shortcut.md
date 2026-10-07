# Share sheet shortcut (iOS and macOS)

Safari does not support the Web Share Target API, so the PWA cannot appear in the share sheet. A Shortcut does the same job: share any file, photo, PDF, link, text or WhatsApp export to **Autocratico** and it lands in the inbox.

## What you need

- From the web app: Settings → Shortcut tokens → **New token** (name it e.g. "iPhone shortcut"). It can only call `/api/ingest`.
- From Cloudflare Zero Trust: the service token's **Client ID** and **Client Secret** (docs/self-hosting.md, Cloudflare).

## Build it (Shortcuts app)

1. New shortcut, name **Invia ad Autocratico**. In its details enable **Show in Share Sheet** (iOS) / **Use as Quick Action** and **Share Sheet** (macOS). Accepted types: Files, Images, PDFs, Text, URLs, Media.
2. Action **If** *Shortcut Input* *has any value* (otherwise: **Ask for Text** "Cosa vuoi salvare?").
3. Action **Get Contents of URL**:
   - URL: `https://autocratico.<domain>/api/ingest`
   - Method: **POST**
   - Headers:
     - `Authorization`: `Bearer <shortcut token>`
     - `CF-Access-Client-Id`: `<client id>`
     - `CF-Access-Client-Secret`: `<client secret>`
   - Request Body: **Form**
     - `file` (type File): *Shortcut Input*
     - `title` (type Text): *Name* of Shortcut Input (optional)
4. Action **Show Notification**: "Inviato ad Autocratico".

For plain text or a URL, the same request works: the server stores the text in `content.md`.

## WhatsApp

In a chat: contact name → **Export Chat** → *Attach media* or not → share to **Invia ad Autocratico**. The server unpacks the zip, reads `_chat.txt` and keeps the media as attachments.

## Mail

Forwarding is simpler for email: forward to a Gmail account that autocratico syncs (docs/gmail.md).

## Revoke

Settings → Shortcut tokens → Revoke. Rotate the Cloudflare service token from Zero Trust if the phone is lost.
