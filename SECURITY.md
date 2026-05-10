# Security policy

## Reporting a vulnerability

**Please don't open a public GitHub issue for a security or privacy
problem** — the report itself can leak the vulnerability before a fix
is in place.

Instead, send a private message on X / Twitter:

→ **<https://x.com/imlenti>**

Include in your message:

- A short description of the issue and its potential impact.
- Steps to reproduce, ideally with the smallest possible setup.
- The version / commit of MinerWatch you tested
  (`git rev-parse HEAD` from your install).
- Whether you'd like to be credited in the release notes once the
  fix is out.

I aim to acknowledge reports within a few days. There's no formal
SLA — MinerWatch is a hobby / community project — but real
vulnerabilities are handled as soon as I can.

## Scope

In scope:

- Remote code execution, unauthenticated data exfiltration,
  privilege escalation in the FastAPI backend, the auto-fan
  controller, the discovery scanner, or any miner driver.
- Push-notification abuse (e.g. forging notifications to other
  subscribers, leaking VAPID private keys).
- Auth bypass when bearer-token auth is enabled.
- Persistent XSS / open redirects in the web UI.
- Any path that allows a malicious miner on the LAN to attack the
  MinerWatch host beyond returning bad metrics.

Out of scope:

- Issues that require physical access to the host or the miners,
  or compromise of the operating system itself.
- "An attacker on your home LAN can do X" without a privilege
  escalation: the project assumes a trusted LAN by default
  (see the `auth.enabled` flag for stricter setups).
- Denial-of-service via flooding the discovery scan or the API.
- Vulnerabilities in third-party dependencies that are already
  tracked upstream — please report those to the upstream project
  first; MinerWatch will pick up the fixed version on release.

## Responsible-disclosure expectations

If you report responsibly (private DM, reasonable time to patch,
no public exploit before a release), I'll credit you in
`CHANGELOG.md` for the version that fixes the issue. If you want
to be listed by handle / nickname only, just tell me.
