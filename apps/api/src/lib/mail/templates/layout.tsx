/** @jsxImportSource react */
import {
	Body,
	Container,
	Head,
	Hr,
	Html,
	Link,
	Preview,
	Section,
	Tailwind,
	Text,
} from "@react-email/components";
import type { ReactNode } from "react";

// Design tokens translated from globals.css (oklch → hex) to match the
// violet shadcn/ui theme used in apps/dashboard. Email clients can't parse
// oklch(), so we convert to hex equivalents for maximum compatibility:
//
//   --primary            oklch(0.491 0.27 292.581)  → #7c3aed  violet-600
//   --primary-foreground oklch(0.969 0.016 293.756) → #f5f3ff  violet-50
//   --background         oklch(1 0 0)               → #ffffff
//   --foreground         oklch(0.141 0.005 285.823) → #0f0e17  near-black
//   --muted-foreground   oklch(0.552 0.016 285.938) → #6b7280  gray-500
//   --border             oklch(0.92 0.004 286.32)   → #e4e4e7  zinc-200
//   --muted              oklch(0.967 0.001 286.375) → #f4f4f5  zinc-100
//   --radius             0.225rem                   → 4px (tight, as in dashboard)

const tailwindConfig = {
	theme: {
		extend: {
			colors: {
				// Primary violet — matches --primary in globals.css
				primary: "#7c3aed",
				"primary-dark": "#6d28d9",
				"primary-fg": "#f5f3ff",
				// Surface & text
				foreground: "#0f0e17",
				"muted-fg": "#6b7280",
				border: "#e4e4e7",
				muted: "#f4f4f5",
				card: "#ffffff",
				"bg-page": "#f9f9fb",
			},
			borderRadius: {
				// Matches the tight --radius: 0.225rem used by the dashboard
				sm: "4px",
				DEFAULT: "4px",
				md: "6px",
				lg: "8px",
			},
			fontFamily: {
				sans: [
					"-apple-system",
					"BlinkMacSystemFont",
					'"Segoe UI"',
					"Roboto",
					'"Helvetica Neue"',
					"Arial",
					"sans-serif",
				],
			},
		},
	},
} as const;

export function EmailLayout({
	preview,
	children,
}: {
	preview: string;
	children: ReactNode;
}) {
	return (
		<Tailwind config={tailwindConfig}>
			<Html lang="en" dir="ltr">
				<Head />
				<Preview>{preview}</Preview>
				<Body className="bg-bg-page font-sans m-0 p-0">
					<Container className="mx-auto max-w-[560px] px-4 py-10">
						{/* ── Wordmark ────────────────────────────────── */}
						<Section className="mb-6 text-center">
							<Text className="m-0 text-[22px] font-bold tracking-tight text-foreground">
								<span style={{ color: "#7c3aed" }}>OSS</span>Play
							</Text>
						</Section>

						{/* ── Main card ───────────────────────────────── */}
						<Section
							style={{
								backgroundColor: "#ffffff",
								borderRadius: "8px",
								border: "1px solid #e4e4e7",
								padding: "36px 40px",
							}}
						>
							{children}
						</Section>

						{/* ── Footer ──────────────────────────────────── */}
						<Section className="mt-6 text-center px-4">
							<Hr style={{ borderColor: "#e4e4e7", margin: "0 0 16px" }} />
							<Text className="m-0 text-xs text-muted-fg leading-5">
								Sent by{" "}
								<Link
									href="https://ossplay.io"
									style={{ color: "#7c3aed", textDecoration: "none" }}
								>
									OSSPlay
								</Link>
								{" · "}
								<Link
									href="https://ossplay.io/docs"
									style={{ color: "#7c3aed", textDecoration: "none" }}
								>
									Docs
								</Link>
							</Text>
							<Text className="mt-1 text-xs text-muted-fg leading-5">
								If you didn't expect this email, you can safely ignore it.
							</Text>
						</Section>
					</Container>
				</Body>
			</Html>
		</Tailwind>
	);
}
