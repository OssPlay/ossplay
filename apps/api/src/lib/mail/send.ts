import nodemailer from 'nodemailer';
import { readInstanceConfig } from '../config/instance-config';
import { decryptSecret } from '../crypto/secret-box';
import type { MailMessage } from './templates';

// Kept as an async function (the file read behind it is synchronous) purely
// so existing `await getInstanceSettings()` call sites don't need touching.
export async function getInstanceSettings() {
  return readInstanceConfig();
}

export function isSmtpConfigured(
  smtp: Awaited<ReturnType<typeof getInstanceSettings>>['smtp'],
): boolean {
  return Boolean(smtp.host && smtp.port && smtp.from.address);
}

// SMTP protocol/TLS negotiation is genuinely complex and risk-prone to hand-
// roll (unlike TOTP or session tokens) — nodemailer is the well-tested
// library for it. Throws a clear, catchable error if SMTP isn't configured
// rather than silently failing.
export async function sendMail(to: string, message: MailMessage): Promise<void> {
  const { smtp } = await getInstanceSettings();
  if (!isSmtpConfigured(smtp)) {
    throw new Error(
      'Email is not configured for this instance — an instance root must set SMTP settings first.',
    );
  }

  const transport = nodemailer.createTransport({
    host: smtp.host as string,
    port: smtp.port as number,
    secure: smtp.secure,
    auth: smtp.username
      ? {
          user: smtp.username,
          pass: smtp.passwordEncrypted ? decryptSecret(smtp.passwordEncrypted) : '',
        }
      : undefined,
  });

  const from = smtp.from.name
    ? `"${smtp.from.name}" <${smtp.from.address}>`
    : (smtp.from.address as string);

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
