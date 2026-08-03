import type React from "react";
import { Section } from "@/components/layout/section";

export default function Layout({ children }: React.PropsWithChildren) {
	return <Section breadcrumb={[{ title: "Domain", href: "/instance/domain" }]}>{children}</Section>;
}
