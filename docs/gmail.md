# Connect Gmail (read-only)

One-off, about 5 minutes, from the Google account that receives your paperwork:

1. https://console.cloud.google.com/projectcreate → create a project named "autocratico".
2. https://console.cloud.google.com/apis/library/gmail.googleapis.com → **Enable**.
3. https://console.cloud.google.com/auth/branding → configure the consent screen:
   type **External**, app name "Autocratico", support email = yours.
4. https://console.cloud.google.com/auth/audience → **Test users** → add your Gmail address.
5. https://console.cloud.google.com/auth/clients → **Create client** → type **Desktop app** → **Download JSON**.
6. Save the file as `data/secrets/credentials.json`.
7. Run `python3 scripts/gmail.py login` and pick the account with your paperwork.

The app stays in "testing" mode, which is fine for personal use. Google may ask you to
sign in again every 7 days until the app is published.

The token (`data/secrets/token.json`) gives **read-only** access to the whole mailbox:
never share it. To revoke it: `python3 scripts/gmail.py logout`
or https://myaccount.google.com/permissions.
