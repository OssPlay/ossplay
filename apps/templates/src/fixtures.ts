/**
 * Fixture data for each email template.
 * Each template can have multiple fixtures (e.g. different role states)
 * selectable via the fixture picker in the sidebar.
 *
 * Keys must match the template file basename (without .tsx).
 */
export const FIXTURES = {
	"invite-email": [
		{
			orgName: "Acme Corp",
			inviterName: "Alice Johnson",
			acceptUrl: "https://example.com/invite/tok_abc123",
		},
		{
			orgName: "Open Source Foundation",
			inviterName: "Bob Smith",
			acceptUrl: "https://example.com/invite/tok_xyz789",
		},
	],

	"instance-invite-email": [
		{
			instanceName: "OSSPlay Production",
			inviterName: "Carol White",
			acceptUrl: "https://example.com/invite/tok_inst_root",
			grantRoot: true,
		},
		{
			instanceName: "OSSPlay Staging",
			inviterName: "Dave Brown",
			acceptUrl: "https://example.com/invite/tok_inst_member",
			grantRoot: false,
		},
	],

	"password-reset-email": [
		{
			resetUrl:
				"https://example.com/reset-password?token=tok_reset_demo1234567890",
		},
	],
} as const;

export type FixtureName = keyof typeof FIXTURES;
export type TemplateFixtures = typeof FIXTURES;
