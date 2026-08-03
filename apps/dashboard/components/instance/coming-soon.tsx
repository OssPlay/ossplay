import type { LucideIcon } from "lucide-react";
import Container from "@/components/ui/container";

// Honest "not built yet" state for instance sections whose backend doesn't
// exist yet — same graceful-degradation spirit as the Caddy-unreachable and
// updater-unavailable messages elsewhere in this app, not a fabricated
// empty state pretending the feature works.
export function ComingSoon({
	icon,
	title,
	description,
}: {
	icon?: LucideIcon;
	title: string;
	description: string;
}) {
	return (
		<Container header={{ icon, title, description }}>
			<p className="text-sm text-muted-foreground">
				This section is being built — check back soon.
			</p>
		</Container>
	);
}
