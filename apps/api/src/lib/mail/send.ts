import { getDb, type SmtpConfig, smtpConfigs } from '@ossplay/db';
import { eq } from 'drizzle-orm';
import nodemailer from 'nodemailer';
import { decryptSecret } from '../crypto/secret-box';
import type { MailMessage } from './templates';

// Instance-wide, DB-backed (not the file-based instance-config.ts) — SMTP
// moved off ossplay.yaml's old singleton `smtp` section once multiple named
// configs with a default flag became a real requirement. Exactly one row
// (or zero) has isDefault: true at any time, enforced app-side by
// instance-smtp.ts's PUT .../default handler, not a DB constraint.
export async function getDefaultSmtpConfig(): Promise<SmtpConfig | null> {
  const [config] = await getDb().select().from(smtpConfigs).where(eq(smtpConfigs.isDefault, true));
  return config ?? null;
}

export async function isSmtpConfigured(): Promise<boolean> {
  return (await getDefaultSmtpConfig()) !== null;
}

// SMTP protocol/TLS negotiation is genuinely complex and risk-prone to hand-
// roll (unlike TOTP or session tokens) — nodemailer is the well-tested
// library for it. Throws a clear, catchable error if no default config is
// set rather than silently failing.
export async function sendMail(to: string, message: MailMessage): Promise<void> {
  const config = await getDefaultSmtpConfig();
  if (!config) {
    throw new Error(
      'Email is not configured for this instance — an instance root must set a default SMTP config first.',
    );
  }

  await sendMailWithConfig(config, to, message);
}

// nodemailer's `secure` option means implicit TLS from the first byte —
// only correct for port 465. Every other encrypted port (587, 25) speaks
// plaintext first and upgrades via STARTTLS; passing `secure: true` there
// makes nodemailer attempt a raw TLS handshake against a server expecting
// an SMTP greeting, which surfaces as a confusing cert/altname mismatch
// rather than a clear connection error. A stored config's `secure` field
// only records "this config wants an encrypted connection" — which of the
// two encryption modes that means is derived from the port, not stored.
// Exported standalone (rather than inlined) so this derivation is directly
// unit-testable without spinning up a real SMTP connection.
export function resolveTlsOptions(
  config: Pick<SmtpConfig, 'secure' | 'port'>,
): { secure: boolean; requireTLS: boolean } {
  const implicitTls = config.secure && config.port === 465;
  return { secure: implicitTls, requireTLS: config.secure && !implicitTls };
}

// Split out from sendMail so instance-smtp.ts's "Test" action can send
// through a specific (possibly not-yet-default) config without first
// promoting it.
export async function sendMailWithConfig(
  config: SmtpConfig,
  to: string,
  message: MailMessage,
): Promise<void> {
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    ...resolveTlsOptions(config),
    auth: config.username
      ? {
          user: config.username,
          pass: config.passwordEncrypted ? decryptSecret(config.passwordEncrypted) : '',
        }
      : undefined,
  });

  const from = config.fromName
    ? `"${config.fromName}" <${config.fromAddress}>`
    : config.fromAddress;

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
