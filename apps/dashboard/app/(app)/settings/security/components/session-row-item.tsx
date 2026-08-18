"use client";

import { Badge } from "@/components/ui/badge";
import { LoadingButton } from "@/components/ui/loading-button";
import { TableCell, TableRow } from "@/components/ui/table";
import { useAction } from "@/hooks/use-action";
import { apiFetch } from "@/lib/api";

export interface SessionRow {
	id: string;
	ipAddress: string | null;
	userAgent: string | null;
	createdAt: string;
	expiresAt: string;
	isCurrent: boolean;
}

export function SessionRowItem({
	session,
	onRevoked,
}: {
	session: SessionRow;
	onRevoked: () => void;
}) {
	const revoke = useAction(() => apiFetch(`/auth/sessions/${session.id}`, { method: "DELETE" }), {
		success: "Session revoked",
		error: "Could not revoke session",
	});

	async function handleRevoke() {
		await revoke
			.trigger()
			.then(onRevoked)
			.catch(() => {});
	}

	return (
		<TableRow>
			<TableCell>{session.ipAddress ?? "unknown"}</TableCell>
			<TableCell className="max-w-[240px] truncate">{session.userAgent ?? "unknown"}</TableCell>
			<TableCell>{new Date(session.createdAt).toLocaleString()}</TableCell>
			<TableCell className="text-right">
				{session.isCurrent ? (
					<Badge variant="secondary">Current</Badge>
				) : (
					<LoadingButton
						variant="ghost"
						size="sm"
						loading={revoke.isLoading}
						onClick={handleRevoke}
					>
						Revoke
					</LoadingButton>
				)}
			</TableCell>
		</TableRow>
	);
}
