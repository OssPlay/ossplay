"use client";

import { GlobeIcon } from "lucide-react";
import { DomainForm } from "@/components/instance/domain-form";
import Container from "@/components/ui/container";

export default function InstanceDomainPage() {
	return (
		<Container
			header={{
				icon: GlobeIcon,
				title: "Domain",
				description: "Point a domain at this server for automatic HTTPS.",
			}}
			size="sm"
		>
			<DomainForm />
		</Container>
	);
}
