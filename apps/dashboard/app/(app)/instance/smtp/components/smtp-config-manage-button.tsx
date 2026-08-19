"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useAction } from "@/hooks/use-action";
import { apiFetch } from "@/lib/api";
import type { SmtpConfigRow } from "@/types/instance";
import { SmtpConfigDialog } from "./smtp-config-dialog";

export function SmtpConfigManageButton({
	config,
	onChange,
}: {
	config: SmtpConfigRow;
	onChange: () => void;
}) {
	const [editOpen, setEditOpen] = useState(false);

	const remove = useAction(() => apiFetch(`/instance/smtp/${config.id}`, { method: "DELETE" }), {
		success: `"${config.name}" deleted`,
		error: "Could not delete config",
	});

	return (
		<>
			<Button variant="secondary" size="sm" onClick={() => setEditOpen(true)}>
				Manage
			</Button>
			<SmtpConfigDialog
				mode="edit"
				config={config}
				open={editOpen}
				onOpenChange={setEditOpen}
				onSaved={onChange}
			/>

			<ConfirmDialog
				trigger={
					<Button variant="destructive" size="sm">
						Delete
					</Button>
				}
				title={`Delete "${config.name}"?`}
				description="This SMTP config will stop being usable immediately. This can't be undone."
				confirmLabel="Delete"
				loading={remove.isLoading}
				onConfirm={() => remove.trigger().then(onChange)}
			/>
		</>
	);
}
