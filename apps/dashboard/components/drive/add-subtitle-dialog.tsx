"use client";

import { useRef, useState } from "react";
import { FormField } from "@/components/auth/form-field";
import { FormError } from "@/components/form-error";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { LoadingButton } from "@/components/ui/loading-button";
import { useAction } from "@/hooks/use-action";
import { apiFetch, errorMessage } from "@/lib/api";
import type { DriveAsset } from "@/types/drive";

// Attaches a subtitle file (SRT or VTT) to a video asset — stored as its
// own `assets` row (parentAssetId set, metadata.variant: "subtitle"), same
// convention every other derived/attached file already follows. Format is
// inferred from the picked file's extension; the actual SRT->VTT
// conversion happens server-side (apps/api/src/routes/assets.ts's POST
// .../subtitles).
export function AddSubtitleDialog({
	orgId,
	projectId,
	asset,
	open,
	onOpenChange,
	onAdded,
}: {
	orgId: string;
	projectId: string;
	asset: DriveAsset;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onAdded: () => void;
}) {
	const [language, setLanguage] = useState("en");
	const [label, setLabel] = useState("English");
	const [file, setFile] = useState<File | null>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);

	const create = useAction(
		() => {
			if (!file) throw new Error("Choose a subtitle file first");
			const format = file.name.toLowerCase().endsWith(".vtt") ? "vtt" : "srt";
			return file.text().then((content) =>
				apiFetch(`/organizations/${orgId}/projects/${projectId}/assets/${asset.id}/subtitles`, {
					method: "POST",
					body: JSON.stringify({ language, label, format, content }),
				}),
			);
		},
		{ success: "Subtitle added", error: "Could not add subtitle" },
	);

	function handleOpenChange(next: boolean) {
		if (!next) {
			create.reset();
			setLanguage("en");
			setLabel("English");
			setFile(null);
			if (fileInputRef.current) fileInputRef.current.value = "";
		}
		onOpenChange(next);
	}

	function handleCreate() {
		return create
			.trigger()
			.then(() => {
				handleOpenChange(false);
				onAdded();
			})
			.catch(() => {});
	}

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Add subtitle</DialogTitle>
				</DialogHeader>
				<div className="flex flex-col gap-4">
					<div className="flex gap-4">
						<FormField
							id="subtitleLanguage"
							label="Language code"
							value={language}
							onChange={setLanguage}
							placeholder="en"
							disabled={create.isLoading}
						/>
						<FormField
							id="subtitleLabel"
							label="Label"
							value={label}
							onChange={setLabel}
							placeholder="English"
							disabled={create.isLoading}
						/>
					</div>
					<div className="flex flex-col gap-1.5">
						<Button
							type="button"
							variant="outline"
							disabled={create.isLoading}
							onClick={() => fileInputRef.current?.click()}
							className="w-fit"
						>
							{file ? file.name : "Choose .srt or .vtt file…"}
						</Button>
						<input
							ref={fileInputRef}
							type="file"
							accept=".srt,.vtt"
							className="hidden"
							onChange={(e) => setFile(e.target.files?.[0] ?? null)}
						/>
					</div>
					<FormError
						message={create.error ? errorMessage(create.error, "Could not add subtitle") : null}
					/>
				</div>
				<DialogFooter>
					<LoadingButton
						loading={create.isLoading}
						onClick={handleCreate}
						disabled={!file || !language.trim() || !label.trim()}
					>
						Add subtitle
					</LoadingButton>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
