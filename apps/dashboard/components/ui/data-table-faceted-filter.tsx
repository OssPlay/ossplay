import { Check, PlusCircle } from "lucide-react";
import type * as React from "react";
import { cn } from "@/lib/utils";
import { Badge } from "./badge";
import { Button } from "./button";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	CommandSeparator,
} from "./command";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { Separator } from "./separator";

export interface DataTableFacetedFilterOption {
	label: string;
	value: string;
	icon?: React.ComponentType<{ className?: string }>;
}

interface DataTableFacetedFilterProps {
	title?: string;
	options: DataTableFacetedFilterOption[];
	value: string[];
	onChange: (value: string[]) => void;
}

// Plain value/onChange, not a TanStack `Column` — this table's filter state
// lives in the URL (see hooks/use-server-table.ts), not in a client-side
// table instance, so this stays usable standalone.
export function DataTableFacetedFilter({
	title,
	options,
	value,
	onChange,
}: DataTableFacetedFilterProps) {
	const selectedValues = new Set(value);

	function toggle(optionValue: string) {
		const next = new Set(selectedValues);
		if (next.has(optionValue)) {
			next.delete(optionValue);
		} else {
			next.add(optionValue);
		}
		onChange(Array.from(next));
	}

	return (
		<Popover>
			<PopoverTrigger
				render={
					<Button variant="outline" size="sm" className="h-8 border-dashed">
						<PlusCircle />
						{title}
						{selectedValues.size > 0 && (
							<>
								<Separator orientation="vertical" className="h-4 mx-2" />
								<Badge variant="secondary" className="px-1 font-normal rounded-sm lg:hidden">
									{selectedValues.size}
								</Badge>
								<div className="hidden gap-1 lg:flex">
									{selectedValues.size > 2 ? (
										<Badge variant="secondary" className="px-1 font-normal rounded-sm">
											{selectedValues.size} selected
										</Badge>
									) : (
										options
											.filter((option) => selectedValues.has(option.value))
											.map((option) => (
												<Badge
													variant="secondary"
													key={option.value}
													className="px-1 font-normal rounded-sm"
												>
													{option.label}
												</Badge>
											))
									)}
								</div>
							</>
						)}
					</Button>
				}
			/>
			<PopoverContent className="p-0 w-50" align="start">
				<Command>
					<CommandInput placeholder={title} />
					<CommandList>
						<CommandEmpty>No results found.</CommandEmpty>
						<CommandGroup>
							{options.map((option) => {
								const isSelected = selectedValues.has(option.value);
								return (
									<CommandItem key={option.value} onSelect={() => toggle(option.value)}>
										<div
											className={cn(
												"flex size-4 items-center justify-center rounded-lg border",
												isSelected
													? "border-primary bg-primary text-primary-foreground"
													: "border-input [&_svg]:invisible",
											)}
										>
											<Check className="size-3.5 text-primary-foreground" />
										</div>
										{option.icon && <option.icon className="size-4 text-muted-foreground" />}
										<span>{option.label}</span>
									</CommandItem>
								);
							})}
						</CommandGroup>
						{selectedValues.size > 0 && (
							<>
								<CommandSeparator />
								<CommandGroup>
									<CommandItem onSelect={() => onChange([])} className="justify-center text-center">
										Clear filter
									</CommandItem>
								</CommandGroup>
							</>
						)}
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}
