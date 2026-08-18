"use client";

import { RotateCcwIcon, Trash2Icon } from "lucide-react";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Tippy } from "@/components/ui/tooltip";

export function TrashRowActions({
	onRestore,
	onDeleteForever,
	label,
}: {
	onRestore: () => void;
	onDeleteForever: () => void;
	label: string;
}) {
	return (
		<div className="flex justify-end gap-1">
			<Tippy content="Restore">
				<Button variant="ghost" size="icon-sm" onClick={onRestore}>
					<RotateCcwIcon className="size-3.5" />
				</Button>
			</Tippy>
			<AlertDialog>
				<Tippy content="Delete forever">
					<AlertDialogTrigger render={<Button variant="ghost" size="icon-sm" />}>
						<Trash2Icon className="size-3.5" />
					</AlertDialogTrigger>
				</Tippy>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete "{label}" forever?</AlertDialogTitle>
						<AlertDialogDescription>This can't be undone.</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction variant="destructive" onClick={onDeleteForever}>
							Delete forever
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
