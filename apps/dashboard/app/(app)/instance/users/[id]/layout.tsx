"use client";

import type React from "react";
import { Fragment } from "react";
import { Section } from "@/components/layout/section";
import { useUserDetail } from "./hooks/use-user-detail";

export default function InstanceUserDetailLayout({
	children,
	security,
	memberships,
	danger,
}: {
	children: React.ReactNode;
	security: React.ReactNode;
	memberships: React.ReactNode;
	danger: React.ReactNode;
}) {
	const { id, data } = useUserDetail();
	const breadcrumbTitle = data ? `${data.user.name} (${data.user.email})` : "User";

	return (
		<Section breadcrumb={[{ title: breadcrumbTitle, href: `/instance/users/${id}` }]}>
			<div className="flex flex-col gap-6">
				<Fragment key="children">{children}</Fragment>
				<Fragment key="security">{security}</Fragment>
				<Fragment key="memberships">{memberships}</Fragment>
				<Fragment key="danger">{danger}</Fragment>
			</div>
		</Section>
	);
}
