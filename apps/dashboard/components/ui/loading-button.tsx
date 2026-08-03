import { Loader2Icon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

import { Button } from "@/components/ui/button";

// Thin wrapper around Button — used at every mutation's submit button
// instead of hand-writing `disabled={submitting}` + a conditional label
// each time (that pattern repeated ~15 times before this existed).
function LoadingButton({
	loading = false,
	loadingText,
	disabled,
	children,
	...props
}: ComponentProps<typeof Button> & { loading?: boolean; loadingText?: ReactNode }) {
	return (
		<Button data-slot="loading-button" disabled={disabled || loading} {...props}>
			{loading && <Loader2Icon className="animate-spin" />}
			{loading && loadingText !== undefined ? loadingText : children}
		</Button>
	);
}

export { LoadingButton };
