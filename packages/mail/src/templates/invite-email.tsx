/** @jsxImportSource react */
import { Button, Section, Text } from "@react-email/components";
import { EmailLayout } from "./layout";

export function InviteEmail({
	orgName,
	inviterName,
	acceptUrl,
}: {
	orgName: string;
	inviterName: string;
	acceptUrl: string;
}) {
	return (
		<EmailLayout preview={`${inviterName} invited you to join ${orgName} on OSSPlay`}>
			{/* Heading */}
			<Text
				style={{
					margin: "0 0 8px",
					fontSize: "20px",
					fontWeight: "600",
					color: "#0f0e17",
					letterSpacing: "-0.01em",
				}}
			>
				You've been invited
			</Text>

			{/* Body */}
			<Text
				style={{
					margin: "0 0 24px",
					fontSize: "15px",
					lineHeight: "1.6",
					color: "#3f3f46",
				}}
			>
				<strong style={{ color: "#0f0e17" }}>{inviterName}</strong> has invited you to join the{" "}
				<strong style={{ color: "#0f0e17" }}>{orgName}</strong> organization on OSSPlay.
			</Text>

			{/* CTA */}
			<Section className="text-center mb-6">
				<Button
					href={acceptUrl}
					style={{
						backgroundColor: "#7c3aed",
						borderRadius: "4px",
						color: "#f5f3ff",
						display: "inline-block",
						fontSize: "14px",
						fontWeight: "600",
						padding: "10px 24px",
						textDecoration: "none",
						letterSpacing: "0.01em",
					}}
				>
					Accept invitation
				</Button>
			</Section>

			{/* Expiry notice */}
			<Text
				style={{
					margin: "0",
					fontSize: "13px",
					color: "#6b7280",
					lineHeight: "1.5",
				}}
			>
				This link expires in <strong>7 days</strong>. If you weren't expecting this invite, you can
				safely ignore this email.
			</Text>
		</EmailLayout>
	);
}
