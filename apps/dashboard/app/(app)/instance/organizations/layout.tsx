import type React from "react";
import { Section } from "@/components/layout/section";

export default function Layout({ children }: React.PropsWithChildren) {
	return (
		<Section breadcrumb={[{ title: "Organizations", href: "/instance/organizations" }]}>
			{children}
		</Section>
	);
}
