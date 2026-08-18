"use client";

import { FolderUpIcon, UploadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function UploadMenuButton({
	onUploadFiles,
	onUploadFolder,
}: {
	onUploadFiles: () => void;
	onUploadFolder: () => void;
}) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<Button variant="outline" size="sm">
						<UploadIcon /> Upload
					</Button>
				}
			/>
			<DropdownMenuContent align="end">
				<DropdownMenuItem onClick={onUploadFiles}>
					<UploadIcon /> Upload files
				</DropdownMenuItem>
				<DropdownMenuItem onClick={onUploadFolder}>
					<FolderUpIcon /> Upload folder
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
