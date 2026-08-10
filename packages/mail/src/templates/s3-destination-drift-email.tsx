/** @jsxImportSource react */
import { Button, Section, Text } from "@react-email/components";
import { EmailLayout } from "./layout";

export function S3DestinationDriftEmail({
	label,
	orgName,
	reason,
	destinationsUrl,
}: {
	label: string;
	orgName: string;
	reason: string;
	destinationsUrl: string;
}) {
	return (
		<EmailLayout preview={`"${label}" no longer matches its configured permissions`}>
			<Text
				style={{
					margin: "0 0 8px",
					fontSize: "20px",
					fontWeight: "600",
					color: "#0f0e17",
					letterSpacing: "-0.01em",
				}}
			>
				S3 destination configuration drifted
			</Text>

			<Text style={{ margin: "0 0 24px", fontSize: "15px", lineHeight: "1.6", color: "#3f3f46" }}>
				<strong>{label}</strong> in {orgName} no longer matches the bucket permissions OSSPlay
				expects for its visibility setting. This usually means the bucket policy or Block Public
				Access setting was changed outside OSSPlay.
			</Text>

			<Text
				style={{
					margin: "0 0 24px",
					fontSize: "14px",
					lineHeight: "1.6",
					color: "#3f3f46",
					backgroundColor: "#fafafa",
					borderRadius: "4px",
					padding: "12px 16px",
				}}
			>
				{reason}
			</Text>

			<Section className="text-center mb-6">
				<Button
					href={destinationsUrl}
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
					Review and reconfigure
				</Button>
			</Section>
		</EmailLayout>
	);
}
