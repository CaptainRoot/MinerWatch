<!--
Thanks for sending a pull request! Please fill in what's relevant
and delete what isn't. Small, focused PRs land much faster than
big ones — splitting an idea into 2-3 commits / PRs is encouraged.
-->

## Summary

<!-- One or two sentences: what does this PR do, and why? -->

## Type of change

- [ ] Bug fix (non-breaking, restores expected behaviour)
- [ ] New feature (non-breaking, adds capability)
- [ ] Breaking change (changes public API / DB schema / config keys)
- [ ] New miner driver
- [ ] Documentation only
- [ ] Refactor / cleanup (no behaviour change)

## Linked issues

<!-- "Fixes #123" / "Closes #456" / "Refs #789" -->

## How was this tested?

<!--
Be specific. "It works on my Bitaxe Gamma at firmware 2.7.0" is more
useful than "tested locally". For driver work, the miner family +
firmware version is essential.
-->

- [ ] Tested against real hardware (specify family + firmware below)
- [ ] Tested against simulated payloads / unit-style smoke tests
- [ ] No runtime testing needed (docs / type-only changes)

Hardware / firmware tested:

```
e.g. Bitaxe Gamma 601, AxeOS v2.7.0
     Avalon Nano 3s, MM319 / 25021401
```

## Screenshots (UI changes only)

<!-- Drag-and-drop or paste links. Light + dark themes if relevant. -->

## Checklist

- [ ] My code follows the structure / naming conventions of the
      existing codebase
- [ ] SPDX header `# SPDX-License-Identifier: AGPL-3.0-only` is
      present in any new Python file
- [ ] `python -m py_compile` passes on every modified `.py`
- [ ] No new dependency added, **or** the new dependency is in
      `requirements.txt` with a version pin and a one-line comment
      explaining why
- [ ] I haven't introduced any personal data (real IPs, MAC
      addresses, push endpoints, wallet addresses, names)
- [ ] CHANGELOG.md updated under `## [Unreleased]` if user-visible
- [ ] If the change touches the DB schema, an idempotent
      `ALTER TABLE ... IF NOT EXISTS` migration is added in
      `_init_db_sync()` so existing installs don't break
