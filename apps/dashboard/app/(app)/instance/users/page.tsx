"use client";

import { SearchIcon, UsersIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import Container from "@/components/ui/container";
import { Input } from "@/components/ui/input";
import { LoadingButton } from "@/components/ui/loading-button";
import { PaginationBar } from "@/components/ui/pagination-bar";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { useAction } from "@/hooks/use-action";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { ApiError, apiFetch } from "@/lib/api";

type InstanceUser = {
	id: string;
	email: string;
	name: string;
	instanceRole: string | null;
	totpEnabled: boolean;
	disabledAt: string | null;
	passkeyCount: number;
	createdAt: string;
	lastSignInAt: string | null;
};
type UsersResponse = {
	users: InstanceUser[];
	total: number;
	page: number;
	pageSize: number;
};

const DEBOUNCE_MS = 300;

// Root-only: manage identity/security for every account on this instance —
// force-reset a password or 2FA, block/delete, edit org roles. Distinct
// from (and more powerful than) anything an org-level Members page does —
// see ARCHITECTURE.md's Authorization Model section.
export default function InstanceUsersPage() {
	const [searchInput, setSearchInput] = useState("");
	const search = useDebouncedValue(searchInput, DEBOUNCE_MS);
	const [page, setPage] = useState(0);
	const [pageSize, setPageSize] = useState(10);
	const [selected, setSelected] = useState<Set<string>>(new Set());

	// A stale page index (e.g. page 3 of what's now a 1-page result) must not
	// stick once the debounced search value actually changes the result set.
	// biome-ignore lint/correctness/useExhaustiveDependencies: intentionally excludes `page` — this only resets page in response to `search` changing, not on every page change.
	useEffect(() => {
		setPage(0);
	}, [search]);

	const query = new URLSearchParams({
		page: String(page),
		pageSize: String(pageSize),
	});
	if (search) query.set("search", search);

	const { data, error, mutate } = useSWR<UsersResponse>(`/instance/users?${query.toString()}`);
	const forbidden = error instanceof ApiError && error.status === 403;

	// Reuses the same per-user PUT endpoint SecurityActions calls on the
	// detail page — no bulk endpoint exists (or is needed) for this.
	const bulkUpdateBlock = useAction(
		(ids: string[], action: "block" | "unblock") =>
			Promise.all(ids.map((id) => apiFetch(`/instance/users/${id}/${action}`, { method: "PUT" }))),
		{ error: "Could not update the selected users" },
	);

	if (forbidden) {
		return (
			<p className="text-sm text-muted-foreground">Only the instance root can view this page.</p>
		);
	}

	const users = data?.users ?? [];
	const total = data?.total ?? 0;
	const totalPages = Math.max(1, Math.ceil(total / pageSize));
	const pageIds = users.map((user) => user.id);
	const allOnPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));

	function toggleAllOnPage(checked: boolean) {
		setSelected((prev) => {
			const next = new Set(prev);
			for (const id of pageIds) {
				if (checked) next.add(id);
				else next.delete(id);
			}
			return next;
		});
	}

	function toggleOne(id: string, checked: boolean) {
		setSelected((prev) => {
			const next = new Set(prev);
			if (checked) next.add(id);
			else next.delete(id);
			return next;
		});
	}

	function handlePageSizeChange(size: number) {
		setPageSize(size);
		setPage(0);
	}

	async function handleBulk(action: "block" | "unblock") {
		await bulkUpdateBlock
			.trigger(Array.from(selected), action)
			.then(() => {
				setSelected(new Set());
				mutate();
			})
			.catch(() => {});
	}

	return (
		<Container
			header={{
				icon: UsersIcon,
				title: "Users",
				description: "Every account on this instance.",
			}}
			size="lg"
		>
			<div className="flex flex-col gap-4">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<div className="relative w-full max-w-xs">
						<SearchIcon className="absolute -translate-y-1/2 pointer-events-none top-1/2 left-3 size-4 text-muted-foreground" />
						<Input
							placeholder="Search name or email…"
							value={searchInput}
							onChange={(e) => setSearchInput(e.target.value)}
							className="pl-9"
						/>
					</div>
					{selected.size > 0 && (
						<div className="flex items-center gap-2">
							<span className="text-sm text-muted-foreground">{selected.size} selected</span>
							<LoadingButton
								variant="secondary"
								size="sm"
								loading={bulkUpdateBlock.isLoading}
								onClick={() => handleBulk("block")}
							>
								Block selected
							</LoadingButton>
							<LoadingButton
								variant="secondary"
								size="sm"
								loading={bulkUpdateBlock.isLoading}
								onClick={() => handleBulk("unblock")}
							>
								Unblock selected
							</LoadingButton>
						</div>
					)}
				</div>

				{!data ? null : total === 0 ? (
					<p className="text-sm text-muted-foreground">
						{search ? `No users match "${search}".` : "No users yet."}
					</p>
				) : (
					<>
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead className="w-10">
										<Checkbox
											checked={allOnPageSelected}
											onCheckedChange={(checked) => toggleAllOnPage(Boolean(checked))}
											aria-label="Select all users on this page"
										/>
									</TableHead>
									<TableHead>Name</TableHead>
									<TableHead>Email</TableHead>
									<TableHead>2FA / Passkeys</TableHead>
									<TableHead>Status</TableHead>
									<TableHead>Last sign-in</TableHead>
									<TableHead />
								</TableRow>
							</TableHeader>
							<TableBody>
								{users.map((user) => (
									<TableRow key={user.id}>
										<TableCell>
											<Checkbox
												checked={selected.has(user.id)}
												onCheckedChange={(checked) => toggleOne(user.id, Boolean(checked))}
												aria-label={`Select ${user.name}`}
											/>
										</TableCell>
										<TableCell>
											{user.name}
											{user.instanceRole === "root" && (
												<Badge variant="secondary" className="ml-2">
													root
												</Badge>
											)}
										</TableCell>
										<TableCell>{user.email}</TableCell>
										<TableCell className="text-muted-foreground">
											{user.totpEnabled ? "2FA" : "No 2FA"} · {user.passkeyCount} passkey
											{user.passkeyCount === 1 ? "" : "s"}
										</TableCell>
										<TableCell>
											{user.disabledAt ? (
												<Badge variant="destructive">Blocked</Badge>
											) : (
												<Badge variant="secondary">Active</Badge>
											)}
										</TableCell>
										<TableCell className="text-muted-foreground">
											{user.lastSignInAt ? new Date(user.lastSignInAt).toLocaleString() : "Never"}
										</TableCell>
										<TableCell className="text-right">
											<Link
												href={`/instance/users/${user.id}`}
												className={buttonVariants({
													variant: "secondary",
													size: "sm",
												})}
											>
												Manage
											</Link>
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
						<PaginationBar
							page={page}
							totalPages={totalPages}
							pageSize={pageSize}
							totalCount={total}
							onPageChange={setPage}
							onPageSizeChange={handlePageSizeChange}
						/>
					</>
				)}
			</div>
		</Container>
	);
}
