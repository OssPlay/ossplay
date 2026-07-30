import { getDb, instanceSettings } from '@ossplay/db';
import { eq } from 'drizzle-orm';
import nodemailer from 'nodemailer';
import { decryptSecret } from '../crypto/secret-box';
import type { MailMessage } from './templates';

export async function getInstanceSettings() {
  const [settings] = await getDb()
    .select()
    .from(instanceSettings)
    .where(eq(instanceSettings.id, 1));
  return settings ?? null;
}

export function isSmtpConfigured(
  settings: Awaited<ReturnType<typeof getInstanceSettings>>,
): boolean {
  return Boolean(settings?.smtpHost && settings.smtpPort && settings.smtpFromAddress);
}

// SMTP protocol/TLS negotiation is genuinely complex and risk-prone to hand-
// roll (unlike TOTP or session tokens) — nodemailer is the well-tested
// library for it. Throws a clear, catchable error if SMTP isn't configured
// rather than silently failing.
export async function sendMail(to: string, message: MailMessage): Promise<void> {
  const settings = await getInstanceSettings();
  if (!isSmtpConfigured(settings) || !settings) {
    throw new Error(
      'Email is not configured for this instance — an instance root must set SMTP settings first.',
    );
  }

  const transport = nodemailer.createTransport({
    host: settings.smtpHost as string,
    port: settings.smtpPort as number,
    secure: settings.smtpSecure,
    auth: settings.smtpUsername
      ? {
          user: settings.smtpUsername,
          pass: settings.smtpPasswordEncrypted ? decryptSecret(settings.smtpPasswordEncrypted) : '',
        }
      : undefined,
  });

  const from = settings.smtpFromName
    ? `"${settings.smtpFromName}" <${settings.smtpFromAddress}>`
    : (settings.smtpFromAddress as string);

  try {
    await transport.sendMail({
      from,
      to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
  } finally {
    // Otherwise nodemailer's connection pool keeps sockets open and the
    // process never exits on its own.
    transport.close();
  }
}
