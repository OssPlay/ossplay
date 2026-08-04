/** @jsxImportSource react */
import { Button, Section, Text } from "@react-email/components";
import { EmailLayout } from "./layout";

export function PasswordResetEmail({ resetUrl }: { resetUrl: string }) {
	return (
		<EmailLayout preview="Reset your OSSPlay password">
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
				Reset your password
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
				We received a request to reset the password for your OSSPlay account. Click the button below
				to set a new password.
			</Text>

			{/* CTA */}
			<Section className="text-center mb-6">
				<Button
					href={resetUrl}
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
					Reset password
				</Button>
			</Section>

			{/* Security notice */}
			<Text
				style={{
					margin: "0",
					fontSize: "13px",
					color: "#6b7280",
					lineHeight: "1.5",
				}}
			>
				This link expires in <strong>1 hour</strong>. If you didn't request a password reset, you
				can safely ignore this email — your password won't change.
			</Text>
		</EmailLayout>
	);
}
