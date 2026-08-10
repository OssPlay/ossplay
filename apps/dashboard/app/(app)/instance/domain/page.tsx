"use client";

import { GlobeIcon } from "lucide-react";
import { DomainForm } from "@/components/instance/domain-form";
import { useAuth } from "@/components/providers/auth-provider";
import Container from "@/components/ui/container";

export default function InstanceDomainPage() {
	const { instance } = useAuth();
	return (
		<Container
			header={{
				icon: GlobeIcon,
				title: "Domain",
				description: "Point a domain at this server for automatic HTTPS.",
				learnMore: instance?.docsUrl
					? { href: `${instance.docsUrl}/guides/custom-domains` }
					: undefined,
			}}
			size="sm"
		>
			<DomainForm />
		</Container>
	);
}
