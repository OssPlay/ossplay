"use client";

// This page reads search params at runtime (useServerTable / useSearchParams) —
// opt out of static prerendering so Next.js does not attempt it at build time.
export const dynamic = "force-dynamic";

import { MailIcon, PlusIcon } from "lucide-react";
import { useState } from "react";
import { DataTable, type DataTableColumn } from "@/components/layout/data-table";
import { InstanceForbidden } from "@/components/layout/instance-forbidden";
import { useAuth } from "@/components/providers/auth-provider";
import { Badge } from "@/components/ui/badge";
import Container from "@/components/ui/container";
import { useInstanceRoleGate } from "@/hooks/use-instance-role-gate";
import { useServerTable } from "@/hooks/use-server-table";
import type { SmtpConfigRow } from "@/types/instance";
import { MakeDefaultButton } from "./components/make-default-button";
import { SmtpConfigDialog } from "./components/smtp-config-dialog";
import { SmtpConfigManageButton } from "./components/smtp-config-manage-button";
import { TestSmtpConfigButton } from "./components/test-smtp-config-button";

interface SmtpConfigsResponse {
	configs: SmtpConfigRow[];
	total: number;
	page: number;
	pageSize: number;
}

export default function InstanceSmtpPage() {
	const { instance } = useAuth();
	const table = useServerTable<SmtpConfigsResponse, SmtpConfigRow>({
		endpoint: "/instance/smtp",
		items: (response) => response.configs,
	});
	const [dialogOpen, setDialogOpen] = useState(false);
	const forbidden = useInstanceRoleGate(table.error);

	if (forbidden) {
		return <InstanceForbidden />;
	}

	const columns: DataTableColumn<SmtpConfigRow>[] = [
		{ key: "name", title: "Name" },
		{ key: "host", title: "Host" },
		{
			key: "fromAddress",
			title: "From",
			cell: (row) => (row.fromName ? `${row.fromName} <${row.fromAddress}>` : row.fromAddress),
		},
		{
			key: "isDefault",
			title: "Default",
			cell: (row) =>
				row.isDefault ? (
					<Badge variant="secondary">Default</Badge>
				) : (
					<MakeDefaultButton configId={row.id} onChange={() => table.mutate()} />
				),
		},
	];

	return (
		<Container
			header={{
				icon: MailIcon,
				title: "Email & SMTP",
				description: "Used to send invitation and password-reset emails.",
				action: {
					icon: PlusIcon,
					title: "Add config",
					onClick: () => setDialogOpen(true),
				},
				learnMore: instance?.docsUrl
					? { href: `${instance.docsUrl}/guides/email-smtp` }
					: undefined,
			}}
			size="lg"
		>
			<DataTable
				table={table}
				rowId={(row) => row.id}
				columns={columns}
				searchPlaceholder="Search by name or host…"
				emptyTitle="No SMTP configs yet"
				emptyDescription="Add one to start sending invitation and password-reset emails."
				rowActions={(row) => (
					<div className="flex justify-end gap-2">
						<TestSmtpConfigButton configId={row.id} configName={row.name} />
						<SmtpConfigManageButton config={row} onChange={() => table.mutate()} />
					</div>
				)}
			/>

			<SmtpConfigDialog
				mode="create"
				open={dialogOpen}
				onOpenChange={setDialogOpen}
				onSaved={() => table.mutate()}
			/>
		</Container>
	);
}
