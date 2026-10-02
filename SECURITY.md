# Security

Autocratico runs only on your computer, but it handles sensitive personal data, so security reports are welcome.

## Reporting

Please report vulnerabilities privately through [GitHub security advisories](https://github.com/davide97g/autocratico/security/advisories/new), not in public issues. Include the steps to reproduce and the impact you expect.

Never attach real personal data, tokens or credentials to a report: use the `example/` dataset.

## Scope

- `scripts/serve.py`: anything that lets a website, another user or a remote host read the data or trigger the chat.
- `scripts/chat.py`: ways for file contents (e.g. a downloaded email) to make the chat write files, run commands or send data outside the allowed domains.
- `scripts/gmail.py`: OAuth handling, token storage, file names and content written from emails.
- Anything that could put personal data into the repository (code, `example/`, build output).
