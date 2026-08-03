import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

export function formatDatetime(value: Date | string | number): string {
	const d = new Date(value);

	const date = d.getDate().toString().padStart(2, "0");
	const month = (d.getMonth() + 1).toString().padStart(2, "0");
	const year = d.getFullYear();

	const amPm = d.getHours() >= 12 ? "PM" : "AM";
	const hours = (d.getHours() % 12 || 12).toString().padStart(2, "0");
	const minutes = d.getMinutes().toString().padStart(2, "0");
	const seconds = d.getSeconds().toString().padStart(2, "0");

	return `${date}-${month}-${year}, ${hours}:${minutes}:${seconds} ${amPm}`;
}
