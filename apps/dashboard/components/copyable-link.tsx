"use client";

import { CheckIcon, CopyIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tippy } from "@/components/ui/tooltip";

// `min-w-0` is load-bearing: without it, a flex child's default min-width
// is its content size, so `truncate`'s `overflow-hidden` never actually
// kicks in inside a flex row — the link just overflows its container
// instead of ellipsis-truncating.
export function CopyableLink({ url }: { url: string }) {
	const [copied, setCopied] = useState(false);

	async function handleCopy() {
		await navigator.clipboard.writeText(url);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	}

	return (
		<div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2">
			<span className="min-w-0 flex-1 truncate font-mono text-xs">{url}</span>
			<Tippy content={copied ? "Copied!" : "Copy"}>
				<Button type="button" variant="secondary" size="icon-sm" onClick={handleCopy}>
					{copied ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
				</Button>
			</Tippy>
		</div>
	);
}
