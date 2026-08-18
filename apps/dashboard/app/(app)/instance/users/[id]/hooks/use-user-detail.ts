"use client";

import { useParams } from "next/navigation";
import useSWR from "swr";
import { useInstanceRoleGate } from "@/hooks/use-instance-role-gate";
import { ApiError } from "@/lib/api";
import type { InstanceUser, OrgMembership } from "@/types/instance";

export type UserDetailResponse = { user: InstanceUser; organizations: OrgMembership[] };

// Shared by the layout (breadcrumb) and every slot (children header,
// @security, @memberships, @danger) — all need the same resource. SWR
// dedupes identical keys across components into one request, so each slot
// calling this independently isn't a real extra fetch, just independently
// owned loading/error handling per the parallel-routes convention.
export function useUserDetail() {
	const params = useParams<{ id: string }>();
	const { data, error, mutate, isLoading } = useSWR<UserDetailResponse>(
		`/instance/users/${params.id}`,
	);
	const forbidden = useInstanceRoleGate(error);
	const notFound = error instanceof ApiError && error.status === 404;

	return { id: params.id, data, mutate, isLoading, forbidden, notFound };
}
