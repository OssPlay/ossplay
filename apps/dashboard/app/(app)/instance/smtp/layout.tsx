import type React from "react";
import { Section } from "@/components/layout/section";

export default function Layout({ children }: React.PropsWithChildren) {
	return (
		<Section breadcrumb={[{ title: "Email & SMTP", href: "/instance/smtp" }]}>{children}</Section>
	);
}
