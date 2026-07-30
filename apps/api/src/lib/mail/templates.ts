export type MailMessage = { subject: string; html: string; text: string };

// orgName/inviterName are user-controlled (org name at creation, user's own
// name at signup) — escape before interpolating into HTML.
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function inviteEmail(params: {
  orgName: string;
  inviterName: string;
  acceptUrl: string;
}): MailMessage {
  const orgName = escapeHtml(params.orgName);
  const inviterName = escapeHtml(params.inviterName);
  return {
    subject: `${params.inviterName} invited you to join ${params.orgName} on OSSPlay`,
    text: [
      `${params.inviterName} has invited you to join ${params.orgName} on OSSPlay.`,
      '',
      `Accept the invitation: ${params.acceptUrl}`,
      '',
      'This link expires in 7 days.',
    ].join('\n'),
    html: [
      `<p>${inviterName} has invited you to join <strong>${orgName}</strong> on OSSPlay.</p>`,
      `<p><a href="${params.acceptUrl}">Accept the invitation</a></p>`,
      '<p>This link expires in 7 days.</p>',
    ].join('\n'),
  };
}

export function passwordResetEmail(params: { resetUrl: string }): MailMessage {
  return {
    subject: 'Reset your OSSPlay password',
    text: [
      'We received a request to reset your OSSPlay password.',
      '',
      `Reset your password: ${params.resetUrl}`,
      '',
      "If you didn't request this, you can safely ignore this email. This link expires in 1 hour.",
    ].join('\n'),
    html: [
      '<p>We received a request to reset your OSSPlay password.</p>',
      `<p><a href="${params.resetUrl}">Reset your password</a></p>`,
      "<p>If you didn't request this, you can safely ignore this email. This link expires in 1 hour.</p>",
    ].join('\n'),
  };
}
