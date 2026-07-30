#!/usr/bin/env bun
// Emergency recovery tool for when the instance root is completely locked
// out — wrong password AND no working second factor, so no HTTP endpoint
// (including /instance/users' own force-reset, which itself requires being
// logged in as root) can help. This is the escape hatch below that: direct
// DB access, same as the api server itself already has via DATABASE_URL.
//
// Usage (bare host, DATABASE_URL in env):
//   bun run src/cli/reset-root.ts [--interactive]
// Usage (self-hosted Docker Compose — the realistic case):
//   docker compose exec api bun run src/cli/reset-root.ts [--interactive]
//
// Default mode generates a strong random password and prints it once.
// --interactive prompts for a new password twice instead, with masked
// input (no --set <password> flag, ever — that would land in shell
// history). Either way, this also clears TOTP/recovery codes/passkeys and
// revokes all sessions: a root locked out by password is, by definition,
// also unable to clear whichever second factor is also blocking them, so a
// password-only reset would just leave them stuck at the next prompt.
import { getDb, users } from '@ossplay/db';
import { eq } from 'drizzle-orm';
import { clearUserSecondFactors, setUserPassword } from '../lib/auth/admin-reset';
import { hashPassword } from '../lib/auth/password';
import { generateToken } from '../lib/auth/tokens';

const GENERATED_PASSWORD_BYTES = 18;

const KEY_CODE_CR = 13;
const KEY_CODE_LF = 10;
const KEY_CODE_CTRL_C = 3;
const KEY_CODE_BACKSPACE = 8;
const KEY_CODE_DEL = 127;

function fail(message: string): never {
  console.error(`\nError: ${message}`);
  process.exit(1);
}

async function prompt(question: string): Promise<string> {
  process.stdout.write(question);
  for await (const line of console) {
    return line.trim();
  }
  return '';
}

// No built-in masked-input prompt in Bun/Node — toggle raw mode around a
// manual keypress loop so the typed password never echoes to the terminal
// or ends up in scrollback. Matched by key code, not literal control
// characters, so the source stays free of raw unprintable bytes.
async function promptPassword(question: string): Promise<string> {
  process.stdout.write(question);
  const stdin = process.stdin;
  const wasRaw = stdin.isRaw;
  stdin.setRawMode?.(true);
  stdin.resume();

  let value = '';
  try {
    await new Promise<void>((resolve, reject) => {
      const onData = (chunk: Buffer) => {
        const code = chunk[0];
        if (code === KEY_CODE_CR || code === KEY_CODE_LF) {
          stdin.off('data', onData);
          process.stdout.write('\n');
          resolve();
          return;
        }
        if (code === KEY_CODE_CTRL_C) {
          stdin.off('data', onData);
          reject(new Error('Cancelled'));
          return;
        }
        if (code === KEY_CODE_BACKSPACE || code === KEY_CODE_DEL) {
          value = value.slice(0, -1);
          return;
        }
        value += chunk.toString('utf8');
      };
      stdin.on('data', onData);
    });
  } finally {
    stdin.setRawMode?.(wasRaw ?? false);
  }
  return value;
}

async function main() {
  const interactive = process.argv.includes('--interactive');

  const roots = await getDb().select().from(users).where(eq(users.instanceRole, 'root'));
  if (roots.length === 0) {
    fail('No instance root exists yet — run initial setup instead, this tool is for recovery.');
  }

  let target = roots[0];
  if (roots.length > 1) {
    console.log('Multiple root users found:');
    for (const root of roots) console.log(`  ${root.email}`);
    const chosen = await prompt('Email of the root account to reset: ');
    target = roots.find((root) => root.email === chosen);
    if (!target) fail(`No root user with email "${chosen}"`);
  }
  if (!target) fail('Could not resolve a target root user');

  console.log('\nAbout to reset the password AND clear all 2FA/passkeys/sessions for:');
  console.log(`  ${target.name} <${target.email}>`);
  console.log('\nThis is the single most powerful action this instance supports.');
  const confirmation = await prompt('Type the email address to confirm: ');
  if (confirmation !== target.email) {
    fail('Email did not match — nothing was changed.');
  }

  let newPassword: string;
  if (interactive) {
    const first = await promptPassword('New password: ');
    const second = await promptPassword('Confirm new password: ');
    if (first !== second) fail('Passwords did not match — nothing was changed.');
    if (first.length < 12) fail('Password must be at least 12 characters — nothing was changed.');
    newPassword = first;
  } else {
    newPassword = generateToken(GENERATED_PASSWORD_BYTES);
  }

  await setUserPassword(target.id, await hashPassword(newPassword));
  await clearUserSecondFactors(target.id);

  console.log('\nDone. Password reset and all 2FA/passkeys/sessions cleared.');
  if (!interactive) {
    console.log(
      `\nTemporary password (copy now, it will not be shown again):\n\n  ${newPassword}\n`,
    );
  }
  console.log('Log in, then set a permanent password and re-enable 2FA if you want it.');
  process.exit(0);
}

main().catch((err) => {
  fail(err instanceof Error ? err.message : String(err));
});
