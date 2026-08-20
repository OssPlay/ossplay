"use client";

import { CaptionsIcon, Trash2Icon } from "lucide-react";
import { useRef, useState } from "react";
import useSWR from "swr";
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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { useAction } from "@/hooks/use-action";
import { apiFetch, errorMessage } from "@/lib/api";
import type { DriveAsset } from "@/types/drive";

// A curated common-language list keeps the normal case to two clicks
// (pick language, pick a file) instead of typing a code by hand — "Other…"
// still allows a custom code for anything not listed.
const COMMON_LANGUAGES: { code: string; label: string }[] = [
	{ code: "en", label: "English" },
	{ code: "es", label: "Spanish" },
	{ code: "fr", label: "French" },
	{ code: "de", label: "German" },
	{ code: "it", label: "Italian" },
	{ code: "pt", label: "Portuguese" },
	{ code: "ja", label: "Japanese" },
	{ code: "ko", label: "Korean" },
	{ code: "zh", label: "Chinese" },
	{ code: "hi", label: "Hindi" },
	{ code: "ar", label: "Arabic" },
	{ code: "ru", label: "Russian" },
];
const OTHER_VALUE = "__other";

interface SubtitleVariant extends DriveAsset {
	metadata: { variant: string; language?: string; label?: string } | null;
}

// Manages every subtitle attached to a video in one place — the existing
// list (with delete) plus an add form that stays open after a successful
// add, so attaching several languages in a row doesn't mean reopening this
// dialog from the context menu each time. Stored as its own `assets` row
// per language (parentAssetId set, metadata.variant: "subtitle"), same
// convention every other derived/attached file already follows; the actual
// SRT->VTT conversion happens server-side (apps/api/src/routes/assets.ts's
// POST .../subtitles).
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
	const base = `/organizations/${orgId}/projects/${projectId}`;
	const { data, mutate } = useSWR<{ variants: SubtitleVariant[] }>(
		open ? `${base}/assets/${asset.id}/variants` : null,
	);
	const subtitles = (data?.variants ?? []).filter((v) => v.metadata?.variant === "subtitle");

	const [languageCode, setLanguageCode] = useState<string>("en");
	const [customCode, setCustomCode] = useState("");
	const [label, setLabel] = useState("English");
	const [file, setFile] = useState<File | null>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);

	const language = languageCode === OTHER_VALUE ? customCode.trim() : languageCode;
	const isDuplicate = subtitles.some((v) => v.metadata?.language === language);

	function handleLanguageChange(code: string | null) {
		if (!code) return;
		setLanguageCode(code);
		const known = COMMON_LANGUAGES.find((l) => l.code === code);
		if (known) setLabel(known.label);
	}

	const create = useAction(
		() => {
			if (!file) throw new Error("Choose a subtitle file first");
			const format = file.name.toLowerCase().endsWith(".vtt") ? "vtt" : "srt";
			return file.text().then((content) =>
				apiFetch(`${base}/assets/${asset.id}/subtitles`, {
					method: "POST",
					body: JSON.stringify({ language, label, format, content }),
				}),
			);
		},
		{ success: "Subtitle added", error: "Could not add subtitle" },
	);

	const remove = useAction(
		(subtitleId: string) =>
			apiFetch(`${base}/assets/${asset.id}/subtitles/${subtitleId}`, { method: "DELETE" }),
		{ success: "Subtitle removed", error: "Could not remove subtitle" },
	);

	function resetForm() {
		create.reset();
		setLanguageCode("en");
		setCustomCode("");
		setLabel("English");
		setFile(null);
		if (fileInputRef.current) fileInputRef.current.value = "";
	}

	function handleOpenChange(next: boolean) {
		if (!next) resetForm();
		onOpenChange(next);
	}

	function handleCreate() {
		return create
			.trigger()
			.then(() => {
				resetForm();
				mutate();
				onAdded();
			})
			.catch(() => {});
	}

	function handleRemove(subtitleId: string) {
		remove
			.trigger(subtitleId)
			.then(() => {
				mutate();
				onAdded();
			})
			.catch(() => {});
	}

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Subtitles</DialogTitle>
				</DialogHeader>
				<div className="flex flex-col gap-4">
					{subtitles.length > 0 && (
						<ul className="flex flex-col gap-1.5">
							{subtitles.map((subtitle) => (
								<li
									key={subtitle.id}
									className="flex items-center justify-between gap-2 rounded-md border p-2"
								>
									<div className="flex min-w-0 items-center gap-2 text-sm">
										<CaptionsIcon className="size-4 shrink-0 text-muted-foreground" />
										<span className="truncate">
											{subtitle.metadata?.label ?? subtitle.metadata?.language}
										</span>
										<span className="shrink-0 text-xs text-muted-foreground">
											{subtitle.metadata?.language}
										</span>
									</div>
									<Button
										variant="ghost"
										size="icon-sm"
										disabled={remove.isLoading}
										onClick={() => handleRemove(subtitle.id)}
										aria-label={`Remove ${subtitle.metadata?.label ?? "subtitle"}`}
									>
										<Trash2Icon />
									</Button>
								</li>
							))}
						</ul>
					)}

					<div className="flex flex-col gap-3 border-t pt-4">
						<div className="flex gap-4">
							<div className="flex flex-1 flex-col gap-1.5">
								<span className="text-sm font-medium">Language</span>
								<Select value={languageCode} onValueChange={handleLanguageChange}>
									<SelectTrigger disabled={create.isLoading}>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{COMMON_LANGUAGES.map((l) => (
											<SelectItem key={l.code} value={l.code}>
												{l.label} ({l.code})
											</SelectItem>
										))}
										<SelectItem value={OTHER_VALUE}>Other…</SelectItem>
									</SelectContent>
								</Select>
							</div>
							{languageCode === OTHER_VALUE ? (
								<FormField
									id="subtitleCustomCode"
									label="Language code"
									value={customCode}
									onChange={setCustomCode}
									placeholder="e.g. nl"
									disabled={create.isLoading}
								/>
							) : (
								<FormField
									id="subtitleLabel"
									label="Label"
									value={label}
									onChange={setLabel}
									disabled={create.isLoading}
								/>
							)}
						</div>
						{languageCode === OTHER_VALUE && (
							<FormField
								id="subtitleLabel"
								label="Label"
								value={label}
								onChange={setLabel}
								placeholder="Displayed in the captions menu"
								disabled={create.isLoading}
							/>
						)}
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
						{isDuplicate && (
							<p className="text-sm text-destructive">
								This video already has a "{language}" subtitle — remove it first to replace it.
							</p>
						)}
						<FormError
							message={create.error ? errorMessage(create.error, "Could not add subtitle") : null}
						/>
						<LoadingButton
							loading={create.isLoading}
							onClick={handleCreate}
							disabled={!file || !language || !label.trim() || isDuplicate}
							className="w-fit"
						>
							Add subtitle
						</LoadingButton>
					</div>
				</div>
				<DialogFooter>
					<Button variant="outline" onClick={() => handleOpenChange(false)}>
						Done
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
