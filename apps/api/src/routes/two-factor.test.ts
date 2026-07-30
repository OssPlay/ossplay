import { beforeAll, describe, expect, it } from 'bun:test';
import { generateTotpCode } from '../lib/auth/totp';
import { bootstrapAdmin, extractCookie, jsonRequest, truncateAllTables } from '../test-support';

describe.skipIf(!process.env.DATABASE_URL)('two-factor flow', () => {
  beforeAll(truncateAllTables);

  let sessionCookie: string;
  let secret: string;
  let recoveryCodes: string[];

  it('bootstraps an admin', async () => {
    ({ sessionCookie } = await bootstrapAdmin());
  });

  it('POST /auth/2fa/setup returns a secret and otpauth URL', async () => {
    const res = await jsonRequest('/auth/2fa/setup', { method: 'POST', cookie: sessionCookie });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { secret: string; otpauthUrl: string };
    expect(body.secret).toMatch(/^[A-Z2-7]+$/);
    expect(body.otpauthUrl).toStartWith('otpauth://totp/');
    secret = body.secret;
  });

  it('POST /auth/2fa/confirm rejects a wrong code', async () => {
    const res = await jsonRequest('/auth/2fa/confirm', {
      method: 'POST',
      cookie: sessionCookie,
      body: JSON.stringify({ code: '000000' }),
    });
    expect(res.status).toBe(400);
  });

  it('POST /auth/2fa/confirm with the correct code enables 2FA and returns recovery codes', async () => {
    const code = generateTotpCode(secret);
    const res = await jsonRequest('/auth/2fa/confirm', {
      method: 'POST',
      cookie: sessionCookie,
      body: JSON.stringify({ code }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { recoveryCodes: string[] };
    expect(body.recoveryCodes).toHaveLength(8);
    recoveryCodes = body.recoveryCodes;
  });

  it('login now returns requiresTwoFactor instead of a session', async () => {
    const res = await jsonRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'ada@example.com', password: 'correct horse battery staple' }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ requiresTwoFactor: true });
    expect(res.headers.get('set-cookie')).toContain('ossplay_2fa_challenge');
  });

  it('verify rejects a wrong code without burning the challenge', async () => {
    const loginRes = await jsonRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'ada@example.com', password: 'correct horse battery staple' }),
    });
    const challengeCookie = extractCookie(loginRes, 'ossplay_2fa_challenge');

    const wrongRes = await jsonRequest('/auth/2fa/verify', {
      method: 'POST',
      cookie: challengeCookie,
      body: JSON.stringify({ code: '000000' }),
    });
    expect(wrongRes.status).toBe(400);

    // The challenge should still be usable — a wrong guess didn't consume it.
    const rightRes = await jsonRequest('/auth/2fa/verify', {
      method: 'POST',
      cookie: challengeCookie,
      body: JSON.stringify({ code: generateTotpCode(secret) }),
    });
    expect(rightRes.status).toBe(200);
  });

  it('a recovery code works once, then is rejected on reuse', async () => {
    const code = recoveryCodes[0];
    if (!code) throw new Error('expected a recovery code');

    const loginRes = await jsonRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'ada@example.com', password: 'correct horse battery staple' }),
    });
    const challengeCookie = extractCookie(loginRes, 'ossplay_2fa_challenge');

    const firstUse = await jsonRequest('/auth/2fa/verify', {
      method: 'POST',
      cookie: challengeCookie,
      body: JSON.stringify({ code }),
    });
    expect(firstUse.status).toBe(200);

    const loginRes2 = await jsonRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'ada@example.com', password: 'correct horse battery staple' }),
    });
    const challengeCookie2 = extractCookie(loginRes2, 'ossplay_2fa_challenge');
    const secondUse = await jsonRequest('/auth/2fa/verify', {
      method: 'POST',
      cookie: challengeCookie2,
      body: JSON.stringify({ code }),
    });
    expect(secondUse.status).toBe(400);
  });

  it('disable requires the correct password and code, then login no longer requires 2FA', async () => {
    const loginRes = await jsonRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'ada@example.com', password: 'correct horse battery staple' }),
    });
    const challengeCookie = extractCookie(loginRes, 'ossplay_2fa_challenge');
    const verifyRes = await jsonRequest('/auth/2fa/verify', {
      method: 'POST',
      cookie: challengeCookie,
      body: JSON.stringify({ code: generateTotpCode(secret) }),
    });
    const freshSession = extractCookie(verifyRes, 'ossplay_session');

    const badDisable = await jsonRequest('/auth/2fa/disable', {
      method: 'POST',
      cookie: freshSession,
      body: JSON.stringify({ password: 'wrong', code: generateTotpCode(secret) }),
    });
    expect(badDisable.status).toBe(401);

    const goodDisable = await jsonRequest('/auth/2fa/disable', {
      method: 'POST',
      cookie: freshSession,
      body: JSON.stringify({
        password: 'correct horse battery staple',
        code: generateTotpCode(secret),
      }),
    });
    expect(goodDisable.status).toBe(204);

    const loginAfter = await jsonRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'ada@example.com', password: 'correct horse battery staple' }),
    });
    const body = (await loginAfter.json()) as { user?: { email: string } };
    expect(body.user?.email).toBe('ada@example.com');
  });
});
