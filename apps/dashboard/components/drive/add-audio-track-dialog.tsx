"use client";

import { Loader2Icon, MusicIcon, Trash2Icon, TriangleAlertIcon } from "lucide-react";
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
import { apiFetch, apiFetchForm, errorMessage } from "@/lib/api";
import type { DriveAsset } from "@/types/drive";
import { COMMON_LANGUAGES, OTHER_VALUE } from "./add-subtitle-dialog";

interface AudioTrackVariant extends DriveAsset {
	metadata: { variant: string; language?: string; label?: string } | null;
}

// Manages every manually-attached audio track (a dub/commentary track
// uploaded after the video already exists), mirroring
// AddSubtitleDialog's exact shape — the existing list (with delete) plus
// an add form that stays open after a successful add. The real difference
// from subtitles: this genuinely runs an ffmpeg encode server-side
// (apps/api/src/routes/assets.ts's POST .../audio-tracks), so a freshly
// added track starts "processing" instead of immediately "ready" — the
// variants list polls while any track is still in that state, same
// pattern asset-preview.tsx already uses for scrub-thumbnails/hls-package.
export function AddAudioTrackDialog({
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
	const { data, mutate } = useSWR<{ variants: AudioTrackVariant[] }>(
		open ? `${base}/assets/${asset.id}/variants` : null,
		{
			refreshInterval: (d) => {
				const tracks = (d?.variants ?? []).filter((v) => v.metadata?.variant === "audio-track");
				return tracks.some((v) => v.status === "processing") ? 1500 : 0;
			},
		},
	);
	const tracks = (data?.variants ?? []).filter((v) => v.metadata?.variant === "audio-track");

	const [languageCode, setLanguageCode] = useState<string>("en");
	const [customCode, setCustomCode] = useState("");
	const [label, setLabel] = useState("English");
	const [file, setFile] = useState<File | null>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [preparingNotice, setPreparingNotice] = useState(false);

	const language = languageCode === OTHER_VALUE ? customCode.trim() : languageCode;
	const isDuplicate = tracks.some((v) => v.metadata?.language === language);

	function handleLanguageChange(code: string | null) {
		if (!code) return;
		setLanguageCode(code);
		const known = COMMON_LANGUAGES.find((l) => l.code === code);
		if (known) setLabel(known.label);
	}

	const create = useAction(
		() => {
			if (!file) throw new Error("Choose an audio file first");
			const form = new FormData();
			form.set("file", file);
			form.set("language", language);
			form.set("label", label);
			return apiFetchForm<{ asset: AudioTrackVariant; processing?: boolean }>(
				`${base}/assets/${asset.id}/audio-tracks`,
				form,
			);
		},
		{ success: "Audio track added", error: "Could not add audio track" },
	);

	const remove = useAction(
		(trackId: string) =>
			apiFetch(`${base}/assets/${asset.id}/audio-tracks/${trackId}`, { method: "DELETE" }),
		{ success: "Audio track removed", error: "Could not remove audio track" },
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
		if (!next) {
			resetForm();
			setPreparingNotice(false);
		}
		onOpenChange(next);
	}

	function handleCreate() {
		return create
			.trigger()
			.then((result) => {
				// The video's own hls-package wasn't ready (or predates
				// audio-group support) — assets.ts already triggered a fresh
				// repackage; nothing was actually attached yet, so leave the
				// form filled in and let the viewer retry once it settles
				// instead of silently discarding what they picked.
				if (result.processing) {
					setPreparingNotice(true);
					mutate();
					return;
				}
				resetForm();
				setPreparingNotice(false);
				mutate();
				onAdded();
			})
			.catch(() => {});
	}

	function handleRemove(trackId: string) {
		remove
			.trigger(trackId)
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
					<DialogTitle>Audio tracks</DialogTitle>
				</DialogHeader>
				<div className="flex flex-col gap-4">
					{tracks.length > 0 && (
						<ul className="flex flex-col gap-1.5">
							{tracks.map((track) => {
								const isProcessing = track.status === "processing";
								const isFailed = track.status === "failed";
								return (
									<li
										key={track.id}
										className="flex items-center justify-between gap-2 rounded-md border p-2"
									>
										<div className="flex min-w-0 items-center gap-2 text-sm">
											{isProcessing ? (
												<Loader2Icon className="size-4 shrink-0 animate-spin text-muted-foreground" />
											) : isFailed ? (
												<TriangleAlertIcon className="size-4 shrink-0 text-destructive" />
											) : (
												<MusicIcon className="size-4 shrink-0 text-muted-foreground" />
											)}
											<span className="truncate">
												{track.metadata?.label ?? track.metadata?.language}
											</span>
											<span className="shrink-0 text-xs text-muted-foreground">
												{isProcessing
													? "Processing…"
													: isFailed
														? "Failed"
														: track.metadata?.language}
											</span>
										</div>
										<Button
											variant="ghost"
											size="icon-sm"
											disabled={remove.isLoading}
											onClick={() => handleRemove(track.id)}
											aria-label={`Remove ${track.metadata?.label ?? "audio track"}`}
										>
											<Trash2Icon />
										</Button>
									</li>
								);
							})}
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
									id="audioTrackCustomCode"
									label="Language code"
									value={customCode}
									onChange={setCustomCode}
									placeholder="e.g. commentary"
									disabled={create.isLoading}
								/>
							) : (
								<FormField
									id="audioTrackLabel"
									label="Label"
									value={label}
									onChange={setLabel}
									disabled={create.isLoading}
								/>
							)}
						</div>
						{languageCode === OTHER_VALUE && (
							<FormField
								id="audioTrackLabel"
								label="Label"
								value={label}
								onChange={setLabel}
								placeholder="Displayed in the audio menu"
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
								{file ? file.name : "Choose an audio file…"}
							</Button>
							<input
								ref={fileInputRef}
								type="file"
								accept="audio/*"
								className="hidden"
								onChange={(e) => setFile(e.target.files?.[0] ?? null)}
							/>
						</div>
						{isDuplicate && (
							<p className="text-sm text-destructive">
								This video already has a "{language}" audio track — remove it first to replace it.
							</p>
						)}
						{preparingNotice && (
							<p className="text-sm text-muted-foreground">
								This video is being prepared for audio tracks for the first time — try adding it
								again in a moment.
							</p>
						)}
						<FormError
							message={
								create.error ? errorMessage(create.error, "Could not add audio track") : null
							}
						/>
						<LoadingButton
							loading={create.isLoading}
							onClick={handleCreate}
							disabled={!file || !language || !label.trim() || isDuplicate}
							className="w-fit"
						>
							Add audio track
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
