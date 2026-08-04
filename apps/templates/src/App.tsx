import { useEffect, useRef, useState } from "react";
import { FIXTURES } from "./fixtures";
import type { FixtureName } from "./fixtures";

// ── Helpers ──────────────────────────────────────────────────────────────────

function templateLabel(name: string): string {
	return name
		.split("-")
		.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
		.join(" ");
}

function fixtureCount(name: string): number {
	return (
		(FIXTURES[name as FixtureName] as readonly unknown[] | undefined)?.length ??
		1
	);
}

type ViewMode = "desktop" | "mobile" | "source";

// ── Sidebar item ─────────────────────────────────────────────────────────────

function SidebarItem({
	name,
	active,
	onClick,
}: {
	name: string;
	active: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			style={{
				display: "flex",
				alignItems: "center",
				gap: 8,
				width: "100%",
				padding: "8px 12px",
				borderRadius: "var(--radius)",
				border: "none",
				cursor: "pointer",
				textAlign: "left",
				fontSize: 13,
				fontWeight: active ? 600 : 400,
				color: active ? "var(--primary-fg)" : "var(--fg-muted)",
				background: active ? "var(--primary)" : "transparent",
				transition: "background 120ms, color 120ms",
			}}
			onMouseEnter={(e) => {
				if (!active)
					(e.currentTarget as HTMLButtonElement).style.background =
						"var(--surface-raised)";
			}}
			onMouseLeave={(e) => {
				if (!active)
					(e.currentTarget as HTMLButtonElement).style.background =
						"transparent";
			}}
		>
			{/* envelope icon */}
			<svg
				aria-hidden="true"
				width="14"
				height="14"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				strokeWidth="2"
				strokeLinecap="round"
				strokeLinejoin="round"
				style={{ flexShrink: 0, opacity: active ? 1 : 0.6 }}
			>
				<rect width="20" height="16" x="2" y="4" rx="2" />
				<path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
			</svg>
			{templateLabel(name)}
		</button>
	);
}

// ── View mode toggle ──────────────────────────────────────────────────────────

function ViewToggle({
	mode,
	onChange,
}: {
	mode: ViewMode;
	onChange: (m: ViewMode) => void;
}) {
	const modes: { id: ViewMode; label: string; icon: string }[] = [
		{
			id: "desktop",
			label: "Desktop",
			icon: "M20 7H4a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2ZM8 21h8M12 17v4",
		},
		{
			id: "mobile",
			label: "Mobile",
			icon: "M12 18h.01M8 21h8a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2Z",
		},
		{
			id: "source",
			label: "HTML",
			icon: "m18 16 4-4-4-4M6 8l-4 4 4 4M14 4l-4 16",
		},
	];

	return (
		<div
			style={{
				display: "flex",
				gap: 2,
				background: "var(--surface)",
				borderRadius: "var(--radius)",
				padding: 2,
				border: "1px solid var(--border)",
			}}
		>
			{modes.map((m) => (
				<button
					key={m.id}
					type="button"
					onClick={() => onChange(m.id)}
					title={m.label}
					style={{
						display: "flex",
						alignItems: "center",
						gap: 5,
						padding: "5px 10px",
						borderRadius: "calc(var(--radius) - 1px)",
						border: "none",
						cursor: "pointer",
						fontSize: 12,
						fontWeight: 500,
						color: mode === m.id ? "var(--fg)" : "var(--fg-muted)",
						background: mode === m.id ? "var(--surface-raised)" : "transparent",
						transition: "background 100ms, color 100ms",
					}}
				>
					<svg
						aria-hidden="true"
						width="13"
						height="13"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
						strokeLinejoin="round"
					>
						<path d={m.icon} />
					</svg>
					{m.label}
				</button>
			))}
		</div>
	);
}

// ── Main App ──────────────────────────────────────────────────────────────────

export default function App() {
	const [templates, setTemplates] = useState<string[]>([]);
	const [selected, setSelected] = useState<string | null>(null);
	const [fixtureIdx, setFixtureIdx] = useState(0);
	const [viewMode, setViewMode] = useState<ViewMode>("desktop");
	const [html, setHtml] = useState<string>("");
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const iframeRef = useRef<HTMLIFrameElement>(null);

	// Fetch template list on mount
	useEffect(() => {
		fetch("/__email/templates")
			.then((r) => r.json())
			.then((list: string[]) => {
				setTemplates(list);
				if (list.length) setSelected(list[0]);
			})
			.catch(() => setError("Could not load template list"));
	}, []);

	// Reset fixture index when template changes
	// biome-ignore lint/correctness/useExhaustiveDependencies: selected is a deliberate re-run trigger, not read in the body.
	useEffect(() => {
		setFixtureIdx(0);
	}, [selected]);

	// Fetch rendered HTML whenever template or fixture changes
	useEffect(() => {
		if (!selected) return;
		setLoading(true);
		setError(null);
		fetch(`/__email/render/${selected}?fixture=${fixtureIdx}`)
			.then((r) => r.text())
			.then((h) => {
				setHtml(h);
				setLoading(false);
			})
			.catch((e) => {
				setError(String(e));
				setLoading(false);
			});
	}, [selected, fixtureIdx]);

	// Write HTML into iframe (srcdoc avoids cross-origin issues)
	useEffect(() => {
		const iframe = iframeRef.current;
		if (!iframe || viewMode === "source") return;
		const doc = iframe.contentDocument;
		if (doc) {
			doc.open();
			doc.write(html);
			doc.close();
		}
	}, [html, viewMode]);

	const numFixtures = selected ? fixtureCount(selected) : 0;

	// ── Render ──────────────────────────────────────────────────────────────

	return (
		<div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
			{/* ── Sidebar ───────────────────────────────────────────────────── */}
			<aside
				style={{
					width: 220,
					flexShrink: 0,
					background: "var(--surface)",
					borderRight: "1px solid var(--border)",
					display: "flex",
					flexDirection: "column",
					overflow: "hidden",
				}}
			>
				{/* Logo / app name */}
				<div
					style={{
						padding: "14px 16px 12px",
						borderBottom: "1px solid var(--border)",
						display: "flex",
						alignItems: "center",
						gap: 8,
					}}
				>
					<span
						style={{
							fontSize: 14,
							fontWeight: 700,
							letterSpacing: "-0.02em",
							color: "var(--fg)",
						}}
					>
						<span style={{ color: "var(--primary)" }}>OSS</span>Play
					</span>
					<span
						style={{
							marginLeft: "auto",
							fontSize: 10,
							fontWeight: 600,
							letterSpacing: "0.06em",
							textTransform: "uppercase",
							color: "var(--fg-subtle)",
							background: "var(--surface-raised)",
							border: "1px solid var(--border)",
							borderRadius: "var(--radius)",
							padding: "2px 6px",
						}}
					>
						Email
					</span>
				</div>

				{/* Template list */}
				<div
					style={{
						flex: 1,
						overflowY: "auto",
						padding: "8px 8px",
					}}
				>
					<p
						style={{
							fontSize: 10,
							fontWeight: 600,
							letterSpacing: "0.08em",
							textTransform: "uppercase",
							color: "var(--fg-subtle)",
							padding: "6px 4px 4px",
						}}
					>
						Templates
					</p>
					{templates.length === 0 && (
						<p
							style={{
								fontSize: 12,
								color: "var(--fg-subtle)",
								padding: "8px 4px",
							}}
						>
							No templates found
						</p>
					)}
					{templates.map((t) => (
						<SidebarItem
							key={t}
							name={t}
							active={t === selected}
							onClick={() => setSelected(t)}
						/>
					))}
				</div>
			</aside>

			{/* ── Main content ──────────────────────────────────────────────── */}
			<div
				style={{
					flex: 1,
					display: "flex",
					flexDirection: "column",
					overflow: "hidden",
				}}
			>
				{/* Toolbar */}
				<header
					style={{
						height: 48,
						padding: "0 16px",
						borderBottom: "1px solid var(--border)",
						display: "flex",
						alignItems: "center",
						gap: 12,
						background: "var(--surface)",
						flexShrink: 0,
					}}
				>
					<span
						style={{
							fontSize: 13,
							fontWeight: 600,
							color: "var(--fg)",
							flex: 1,
						}}
					>
						{selected ? templateLabel(selected) : "Select a template"}
					</span>

					{/* Fixture picker */}
					{numFixtures > 1 && (
						<div style={{ display: "flex", alignItems: "center", gap: 4 }}>
							<span style={{ fontSize: 11, color: "var(--fg-muted)" }}>
								Fixture
							</span>
							{Array.from({ length: numFixtures }, (_, i) => (
								<button
									// biome-ignore lint/suspicious/noArrayIndexKey: fixed-length, order-stable index range (0..numFixtures), not a reorderable list.
									key={i}
									type="button"
									onClick={() => setFixtureIdx(i)}
									style={{
										width: 24,
										height: 24,
										borderRadius: "var(--radius)",
										border: "1px solid var(--border)",
										cursor: "pointer",
										fontSize: 11,
										fontWeight: 600,
										color:
											fixtureIdx === i
												? "var(--primary-fg)"
												: "var(--fg-muted)",
										background:
											fixtureIdx === i
												? "var(--primary)"
												: "var(--surface-raised)",
									}}
								>
									{i + 1}
								</button>
							))}
						</div>
					)}

					<ViewToggle mode={viewMode} onChange={setViewMode} />
				</header>

				{/* Preview area */}
				<div
					style={{
						flex: 1,
						overflow: "auto",
						padding: 24,
						background: "#18181b",
						display: "flex",
						justifyContent: "center",
						alignItems: "flex-start",
					}}
				>
					{loading && (
						<div
							style={{
								marginTop: 60,
								fontSize: 13,
								color: "var(--fg-subtle)",
								display: "flex",
								alignItems: "center",
								gap: 8,
							}}
						>
							<span
								style={{
									width: 14,
									height: 14,
									border: "2px solid var(--border)",
									borderTopColor: "var(--primary)",
									borderRadius: "50%",
									display: "inline-block",
									animation: "spin 0.7s linear infinite",
								}}
							/>
							Rendering…
							<style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
						</div>
					)}

					{!loading && error && (
						<div
							style={{
								marginTop: 40,
								maxWidth: 500,
								padding: "16px 20px",
								background: "#1c1010",
								border: "1px solid #7f1d1d",
								borderRadius: "var(--radius-lg)",
								fontSize: 13,
								color: "#fca5a5",
								fontFamily: "var(--font-mono)",
								whiteSpace: "pre-wrap",
								wordBreak: "break-all",
							}}
						>
							{error}
						</div>
					)}

					{!loading && !error && html && (
						<>
							{/* Desktop iframe */}
							{viewMode === "desktop" && (
								<iframe
									ref={iframeRef}
									title="Email preview — desktop"
									style={{
										width: "100%",
										height: "100%",
										border: "1px solid var(--border)",
										borderRadius: "var(--radius-lg)",
										background: "#fff",
									}}
									srcDoc={html}
								/>
							)}

							{/* Mobile iframe */}
							{viewMode === "mobile" && (
								<div
									style={{
										background: "#27272a",
										borderRadius: 28,
										padding: 12,
										boxShadow: "0 0 0 1px #3f3f46, 0 24px 48px rgba(0,0,0,.6)",
										height: "100%",
									}}
								>
									<iframe
										ref={iframeRef}
										title="Email preview — mobile"
										style={{
											width: 375,
											height: "100%",
											border: "none",
											borderRadius: 18,
											background: "#fff",
										}}
										srcDoc={html}
									/>
								</div>
							)}

							{/* Source view */}
							{viewMode === "source" && (
								<div
									style={{
										width: "100%",
										height: "100%",
										background: "var(--surface)",
										borderRadius: "var(--radius-lg)",
										border: "1px solid var(--border)",
										overflow: "hidden",
									}}
								>
									<div
										style={{
											padding: "8px 16px",
											borderBottom: "1px solid var(--border)",
											display: "flex",
											alignItems: "center",
											gap: 8,
										}}
									>
										<span
											style={{
												fontSize: 11,
												color: "var(--fg-muted)",
												fontFamily: "var(--font-mono)",
											}}
										>
											{selected}.html
										</span>
										<button
											type="button"
											onClick={() => navigator.clipboard.writeText(html)}
											style={{
												marginLeft: "auto",
												padding: "3px 10px",
												background: "var(--surface-raised)",
												border: "1px solid var(--border)",
												borderRadius: "var(--radius)",
												cursor: "pointer",
												fontSize: 11,
												color: "var(--fg-muted)",
											}}
										>
											Copy
										</button>
									</div>
									<pre
										style={{
											padding: "16px",
											fontSize: 11.5,
											lineHeight: 1.7,
											fontFamily: "var(--font-mono)",
											color: "#a1a1aa",
											overflowX: "auto",
											height: "100%",
											overflowY: "auto",
											margin: 0,
										}}
									>
										<code>{html}</code>
									</pre>
								</div>
							)}
						</>
					)}
				</div>
			</div>
		</div>
	);
}
