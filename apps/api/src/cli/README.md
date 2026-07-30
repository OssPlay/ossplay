# CLI recovery tools

Direct-database, no-HTTP scripts for operator recovery scenarios that the
running API server itself can't help with, because the whole point is that
normal login (password, 2FA, passkey, the `/instance/users` force-reset
panel — all of it) is what's broken. Treat access to these tools as
equivalent in sensitivity to any other production secret: anyone who can run
them already has `DATABASE_URL`, which already means full instance control.

## `reset-root.ts` — locked-out root recovery

For when the instance root can't log in at all — wrong password *and* no
working second factor (lost authenticator, no recovery codes, no passkey).

```bash
# Bare host, DATABASE_URL already in your shell env:
bun run cli:reset-root

# Self-hosted Docker Compose (the realistic case):
docker compose exec api bun run cli:reset-root

# Prompt for a new password yourself instead of generating one:
docker compose exec api bun run cli:reset-root -- --interactive
```

Resets the root account's password **and** clears TOTP, recovery codes,
and passkeys, and revokes every existing session — a root locked out by
password is, by definition, unable to clear whichever second factor is
also blocking them, so a password-only reset would just leave them stuck
at the next prompt.

Requires re-typing the target's email address to confirm before doing
anything — there is no `--yes`/`--force` flag. There is also no way to
set the password via a command-line flag (it would land in shell
history); either a strong password is generated and printed once, or
`--interactive` prompts for one with masked input.
