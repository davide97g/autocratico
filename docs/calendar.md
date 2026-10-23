# Connect Google Calendar

Autocratico keeps a copy of one or more Google calendars in the data folder, and the chat agent
(web app and Telegram) creates, moves and deletes events in them for you: appointments with
reminders, important events, deadlines of the register you want in your calendar.

## Set it up

Google Calendar uses the OAuth client of the Gmail card (`secrets/credentials.json`): set that up
first ([gmail.md](gmail.md), steps 1–2; Gmail accounts themselves are optional). Then:

1. In the same Google Cloud project, enable the
   [Google Calendar API](https://console.cloud.google.com/apis/library/calendar-json.googleapis.com).
2. With a **Web application** client, add `<your app address>/oauth/calendar` to its
   "Authorized redirect URIs" (next to `/oauth/gmail`). A **Desktop app** client needs nothing:
   after signing in you paste the `http://127.0.0.1:…` address into Settings.
3. **Settings → Google Calendar → Add account**: a short name (`personal`, `work`…), then
   **Sign in with Google** and allow access to the calendar's events. The first copy is made at once.

Each account lists its calendars: tick the ones to copy (the primary one by default) and pick
the one new events go to. Read-only calendars (holidays, shared ones) can be copied, not written.
Removing an account revokes its token at Google and deletes the copy; the events stay in Google.

## What the agent does

- **Reads** `calendar/agenda.md`: every account's events from a month ago to a year ahead, by
  day, with their ids (`calendar/<account>.json` has the descriptions too). "What do I have
  tomorrow?", "am I free on Thursday at 15?" are answered from there, deadlines included.
- **Creates** events when you ask ("put the dentist on Thursday at 15 in the calendar"), with a
  ```` ```calendar ```` block the server checks (`core/calendar.ts`) and carries out at Google.
- **Moves, changes and deletes** events only after describing the change and getting your yes
  (the same yes/no buttons as corrections to the register, also on Telegram). Deleted events can
  be restored from Google Calendar's Trash.
- **Important events** (medical visits, hearings, offices, notaries, flights…) turn red, get
  reminders the day before and an hour before unless others are given, and alert you on
  Telegram/ntfy when their reminders are due (all-day ones the evening before).
- **Conflicts**: the agent looks for overlaps before proposing a time, and the server warns when a
  new or moved event overlaps a busy one.
- **Deadlines** of `deadlines.toml` can become all-day events linked to them (`deadline`), with
  reminders a few days before.
- **Appointments in documents**: when Google Calendar is connected, the background agent proposes
  the appointments it finds in what arrives (a summons, a booked visit). They show in the Agenda
  view and on Telegram with **Add** / **No**; nothing is added without your tap.
- The morning reminders (08:30) list today's events.

The Agenda view shows the copy and the register's deadlines as a week of hours, a month or a list of days; an event opens its details, an empty hour puts a request for the agent in the chat.

## Files

| Path | What | Written by |
| --- | --- | --- |
| `calendar.toml` | accounts, calendars copied, default calendar (versioned) | Settings |
| `secrets/calendar/<name>.json` | the account's token (0600, never sent to the browser) | server |
| `calendar/<name>.json` | the copy: calendars and events, from 90 days ago to 400 days ahead | server |
| `calendar/agenda.md` | the copy for the agents, by day, with ids | server |
| `calendar/proposals.json` | appointments found in documents, waiting for a yes | server |
| `calendar/alerts.json` | alerts of important events already sent | server |

The copy is refreshed every 15 minutes (the `calendar` job, also `node apps/server/src/cli.ts job
calendar`) and right after each of the agent's changes. Recurring events are copied one occurrence
at a time: the agent can change one occurrence, or the whole series (but not the series' dates).

## Security

- Scopes: `calendar.events` (events of your calendars) and `calendar.calendarlist.readonly` (their
  names). No sharing settings, no deleting calendars, no other Google data.
- The chat agent stays read-only on files: it only writes blocks the server validates. It can
  change or delete only events present in the copy, and its instructions forbid acting on
  calendar requests found in emails or documents.
- The background agent cannot edit `calendar/` or `calendar.toml`, and its proposals are only
  proposals. The `rules` job, which has web access, cannot read them.
- Telegram and ntfy texts are redacted like every other notification.
