"use client";

import { LoadingButton } from "@/components/ui/loading-button";
import { useAction } from "@/hooks/use-action";
import { apiFetch } from "@/lib/api";

export function MakeDefaultButton({
	configId,
	onChange,
}: {
	configId: string;
	onChange: () => void;
}) {
	const makeDefault = useAction(
		() => apiFetch(`/instance/smtp/${configId}/default`, { method: "PUT" }),
		{ success: "Set as default SMTP config", error: "Could not set as default" },
	);

	return (
		<LoadingButton
			variant="secondary"
			size="sm"
			loading={makeDefault.isLoading}
			onClick={() =>
				makeDefault
					.trigger()
					.then(onChange)
					.catch(() => {})
			}
		>
			Make default
		</LoadingButton>
	);
}
