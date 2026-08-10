/** @jsxImportSource react */
import { render } from "@react-email/render";
import { createElement } from "react";
import { InstanceInviteEmail } from "./templates/instance-invite-email";
import { InviteEmail } from "./templates/invite-email";
import { PasswordResetEmail } from "./templates/password-reset-email";
import { S3DestinationDriftEmail } from "./templates/s3-destination-drift-email";

export type MailMessage = { subject: string; html: string; text: string };

// React Email's `render` produces both an HTML string (with Tailwind classes
// compiled to inline styles) and a plain-text version automatically derived
// from the component tree. This keeps the `MailMessage` contract identical
// to what call sites already expect — subject, html, text — without any
// change needed in `send.ts` or the route files that build the message.
//
// `render` is async in @react-email/render v2, so these functions are too.
// Call sites already use `await sendMail(to, ...)`, just need to also
// await the template call: `await sendMail(to, await inviteEmail({...}))`.

export async function inviteEmail(params: {
	orgName: string;
	inviterName: string;
	acceptUrl: string;
}): Promise<MailMessage> {
	const element = createElement(InviteEmail, params);
	return {
		subject: `${params.inviterName} invited you to join ${params.orgName} on OSSPlay`,
		html: await render(element),
		text: await render(element, { plainText: true }),
	};
}

export async function instanceInviteEmail(params: {
	instanceName: string;
	inviterName: string;
	acceptUrl: string;
	instanceRole: "root" | "org_creator" | null;
}): Promise<MailMessage> {
	const element = createElement(InstanceInviteEmail, params);
	return {
		subject: `${params.inviterName} invited you to join ${params.instanceName}`,
		html: await render(element),
		text: await render(element, { plainText: true }),
	};
}

export async function passwordResetEmail(params: { resetUrl: string }): Promise<MailMessage> {
	const element = createElement(PasswordResetEmail, params);
	return {
		subject: "Reset your OSSPlay password",
		html: await render(element),
		text: await render(element, { plainText: true }),
	};
}

export async function s3DestinationDriftEmail(params: {
	label: string;
	orgName: string;
	reason: string;
	destinationsUrl: string;
}): Promise<MailMessage> {
	const element = createElement(S3DestinationDriftEmail, params);
	return {
		subject: `"${params.label}" configuration drifted`,
		html: await render(element),
		text: await render(element, { plainText: true }),
	};
}
