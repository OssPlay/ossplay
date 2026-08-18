"use client";

import { useState } from "react";
import { FormField } from "@/components/auth/form-field";
import { FormError } from "@/components/form-error";
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
import type { SshKeyOption } from "@/types/instance";

type WorkerType = "ssh" | "lambda";

const TYPE_OPTIONS = [
	{ value: "ssh", label: "SSH VPS" },
	{ value: "lambda", label: "AWS Lambda (serverless)" },
];

// One dialog for both remote-worker kinds (SSH VPS / AWS Lambda) — picking
// the Type swaps which fields show and which endpoint the submit goes to
// (POST /instance/servers vs POST /instance/compute-destinations). Kept as
// one component rather than two dialogs so "what kind of remote worker do
// you want to add" is a single, obvious first step.
export function AddRemoteWorkerDialog({
	open,
	onOpenChange,
	sshKeys,
	onAdded,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	sshKeys: SshKeyOption[];
	onAdded: () => void;
}) {
	const [type, setType] = useState<WorkerType>("ssh");

	const [label, setLabel] = useState("");
	const [host, setHost] = useState("");
	const [port, setPort] = useState("22");
	const [sshUsername, setSshUsername] = useState("root");
	const [sshKeyId, setSshKeyId] = useState("");

	const [region, setRegion] = useState("");
	const [functionArn, setFunctionArn] = useState("");
	const [accessKeyId, setAccessKeyId] = useState("");
	const [secretAccessKey, setSecretAccessKey] = useState("");

	const createServer = useAction(
		() =>
			apiFetch("/instance/servers", {
				method: "POST",
				body: JSON.stringify({ label, host, port: Number(port), sshUsername, sshKeyId }),
			}),
		{ success: "Server added", error: "Could not add server" },
	);
	const createCompute = useAction(
		() =>
			apiFetch("/instance/compute-destinations", {
				method: "POST",
				body: JSON.stringify({
					provider: "lambda",
					label,
					region,
					functionArn,
					accessKeyId,
					secretAccessKey,
				}),
			}),
		{ success: "Compute destination added", error: "Could not add compute destination" },
	);

	const create = type === "ssh" ? createServer : createCompute;

	// Reset on close, not open: the header's "Add remote worker" button sets
	// `open` directly (bypassing this handler), so a reset-on-open branch
	// would never actually run on that path.
	function handleOpenChange(next: boolean) {
		if (!next) {
			setType("ssh");
			setLabel("");
			setHost("");
			setPort("22");
			setSshUsername("root");
			setSshKeyId(sshKeys[0]?.id ?? "");
			setRegion("");
			setFunctionArn("");
			setAccessKeyId("");
			setSecretAccessKey("");
			createServer.reset();
			createCompute.reset();
		}
		onOpenChange(next);
	}

	async function handleCreate() {
		await create
			.trigger()
			.then(() => {
				handleOpenChange(false);
				onAdded();
			})
			.catch(() => {});
	}

	const canSubmit =
		type === "ssh"
			? Boolean(label && host && port && sshUsername && sshKeyId)
			: Boolean(label && region && functionArn && accessKeyId && secretAccessKey);

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent className="sm:max-w-xl">
				<DialogHeader>
					<DialogTitle>Add remote worker</DialogTitle>
				</DialogHeader>
				<div className="flex flex-col gap-4">
					<div className="flex flex-col gap-1.5 w-full">
						<span className="text-base font-medium text-foreground">Type</span>
						<Select
							value={type}
							onValueChange={(value) => setType((value as WorkerType) ?? "ssh")}
							disabled={create.isLoading}
						>
							<SelectTrigger className="w-full">
								<SelectValue items={TYPE_OPTIONS} />
							</SelectTrigger>
							<SelectContent>
								{TYPE_OPTIONS.map((option) => (
									<SelectItem key={option.value} value={option.value}>
										{option.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					<FormField
						id="workerLabel"
						label="Label"
						value={label}
						onChange={setLabel}
						autoComplete="off"
						autoFocus
						disabled={create.isLoading}
					/>

					{type === "ssh" ? (
						sshKeys.length === 0 ? (
							<p className="text-sm text-muted-foreground">
								Add an SSH key first — a remote server needs one to connect with.
							</p>
						) : (
							<>
								<div className="flex gap-4 flex-nowrap">
									<FormField
										id="serverHost"
										label="Host"
										value={host}
										onChange={setHost}
										autoComplete="off"
										disabled={create.isLoading}
									/>
									<FormField
										id="serverPort"
										label="Port"
										value={port}
										onChange={setPort}
										autoComplete="off"
										type="number"
										disabled={create.isLoading}
									/>
								</div>
								<FormField
									id="serverSshUsername"
									label="SSH username"
									value={sshUsername}
									onChange={setSshUsername}
									autoComplete="off"
									disabled={create.isLoading}
								/>
								<div className="flex flex-col gap-1.5 w-full">
									<span className="text-base font-medium text-foreground">SSH key</span>
									<Select
										value={sshKeyId}
										onValueChange={(value) => setSshKeyId(value ?? "")}
										disabled={create.isLoading}
									>
										<SelectTrigger className="w-full">
											<SelectValue
												items={sshKeys.map((key) => ({ value: key.id, label: key.label }))}
											/>
										</SelectTrigger>
										<SelectContent>
											{sshKeys.map((key) => (
												<SelectItem key={key.id} value={key.id}>
													{key.label}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>
							</>
						)
					) : (
						<>
							<FormField
								id="computeRegion"
								label="Region"
								value={region}
								onChange={setRegion}
								placeholder="us-east-1"
								autoComplete="off"
								disabled={create.isLoading}
							/>
							<FormField
								id="computeFunctionArn"
								label="Function ARN"
								value={functionArn}
								onChange={setFunctionArn}
								placeholder="arn:aws:lambda:us-east-1:123456789012:function:ossplay-worker"
								autoComplete="off"
								disabled={create.isLoading}
							/>
							<FormField
								id="computeAccessKeyId"
								label="Access key ID"
								value={accessKeyId}
								onChange={setAccessKeyId}
								autoComplete="off"
								disabled={create.isLoading}
							/>
							<FormField
								id="computeSecretAccessKey"
								label="Secret access key"
								value={secretAccessKey}
								onChange={setSecretAccessKey}
								type="password"
								autoComplete="off"
								disabled={create.isLoading}
							/>
						</>
					)}

					<FormError
						message={
							create.error ? errorMessage(create.error, "Could not add remote worker") : null
						}
					/>
				</div>
				<DialogFooter>
					<LoadingButton
						loading={create.isLoading}
						onClick={handleCreate}
						disabled={!canSubmit || (type === "ssh" && sshKeys.length === 0)}
					>
						Add {type === "ssh" ? "server" : "compute destination"}
					</LoadingButton>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
