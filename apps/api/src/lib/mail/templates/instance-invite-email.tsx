/** @jsxImportSource react */
import { Button, Section, Text } from "@react-email/components";
import { EmailLayout } from "./layout";

export function InstanceInviteEmail({
	instanceName,
	inviterName,
	acceptUrl,
	grantRoot,
}: {
	instanceName: string;
	inviterName: string;
	acceptUrl: string;
	grantRoot: boolean;
}) {
	const roleLabel = grantRoot ? "instance administrator" : "member";

	return (
		<EmailLayout
			preview={`${inviterName} invited you to join ${instanceName}`}
		>
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
				<strong style={{ color: "#0f0e17" }}>{inviterName}</strong> has invited
				you to join{" "}
				<strong style={{ color: "#0f0e17" }}>{instanceName}</strong> as an{" "}
				<strong style={{ color: "#0f0e17" }}>{roleLabel}</strong>.
			</Text>

			{/* Role badge for admins */}
			{grantRoot && (
				<Section className="mb-6">
					<Text
						style={{
							margin: "0",
							display: "inline-block",
							backgroundColor: "#ede9fe",
							color: "#6d28d9",
							fontSize: "12px",
							fontWeight: "600",
							padding: "4px 10px",
							borderRadius: "4px",
							letterSpacing: "0.03em",
							textTransform: "uppercase",
						}}
					>
						Instance Administrator
					</Text>
				</Section>
			)}

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
				This link expires in <strong>7 days</strong>. If you weren't expecting
				this invite, you can safely ignore this email.
			</Text>
		</EmailLayout>
	);
}
