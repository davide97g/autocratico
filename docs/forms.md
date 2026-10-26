# Forms filled in by the agent

Attach a PDF form to the web chat (a supplier's data sheet, an application, a consent) and ask the agent to fill it in. It answers with the filled PDF: pages previewed in the chat, a download button. You check it, sign it and send it yourself. The agent never signs, stamps or sends anything.

## How it works

1. **Layout.** The chat agent runs `node apps/server/src/form-layout.ts <PDF>` (allowed in the `read` profile, read-only). It prints one of two things:
   - for a fillable PDF (AcroForm), its fields with type, page and options;
   - for a flat PDF, its *blanks*, meaning the dotted, dashed or underscored spaces. Each has a stable id (`p1.3`), the words before it and its position, followed by every line of text with coordinates.

   Pages without text (scans, photos) are flagged, and the agent places text on them by eye.
2. **Values.** The agent reads the PDF itself, takes the values from `profile.toml`, the cases and the conversation, and leaves empty what it does not know.
3. **Block.** It ends its answer with a ```form block:

   ```json
   {"source": "chats/files/2026-10-26-1a2b3c4d/form.pdf", "fields": [
     {"blank": "p1.1", "text": "Rossi Servizi di Maria Rossi"},
     {"field": "Name", "value": "Maria"},
     {"page": 2, "x": 40, "y": 755, "text": "26/10/2026"},
     {"page": 1, "x": 52, "y": 300, "check": true}]}
   ```

   Coordinates are PDF points from the top-left corner, with `y` on the text baseline. Optional keys: `size` (default 9, shrunk to fit a blank), and `mask`, which covers the dots under the text and is on by default for blanks.
4. **Fill.** The server (`apps/server/src/forms.ts`) checks the source and writes the values with pdf-lib in dark blue Helvetica Bold. A fillable form's fields stay editable. The result is saved as a new chat attachment, `chats/files/<date>-<id>/<name> - compilato.pdf`, and the original is never changed. The answer keeps a ```filled block.
5. **Show.** The web chat (`components/filled-form.tsx`) draws the pages with pdf.js and offers the download. To fix something, the user says so and the agent sends a new block, which produces a new file.

## Limits and choices

- **Web app only.** On Telegram the block is answered with a line pointing to the web app. A filled form carries an IBAN and a tax code, and Telegram only ever gets redacted text.
- **Sources.** Only PDFs among the chat's attachments, in `inbox/` or in `archive/` are accepted, with the real path checked (`chatFile`, `documentFile`). Protected PDFs and PDFs over 30 pages are refused.
- **Fonts.** The standard fonts cover Western European text: accents stay, and other characters are spelled out without accents or replaced with `?`.
- **Placement.** On a scan the agent places text by eye, and one correction may be needed. XFA forms (dynamic Adobe forms) are not supported.
- **Lifetime.** Filled PDFs are deleted with their chat. To keep one, ask the agent to file it: an inbox block carries it into the archive.
- **Signatures.** Not supported yet.
- **Self-check.** Also not supported yet: the agent rendering the result and checking its own placement.
