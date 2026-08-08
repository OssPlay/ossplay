import type { VariantProps } from "class-variance-authority";
import { type LucideIcon, TriangleAlertIcon } from "lucide-react";
import { Button, type buttonVariants } from "../ui/button";
import { CodeBlock } from "../ui/code-block";
import Container from "../ui/container";

export default function ErrorBoundary({
	error = new Error("Page not found"),
	description,
	actions,
}: {
	error?: Error;
	description?: string;
	actions?: Array<{
		text: string;
		icon?: LucideIcon;
		variant?: VariantProps<typeof buttonVariants>["variant"];
		type?: React.ButtonHTMLAttributes<HTMLButtonElement>["type"];
		onClick?: () => unknown;
	}>;
}) {
	return (
		<Container
			className="w-full max-w-3xl"
			header={{
				icon: TriangleAlertIcon,
				title: error.message,
				description,
			}}
		>
			<CodeBlock code={error.stack ?? ""} language="error-trace" />
			<div className="flex justify-end gap-4 mt-4 flex-nowrap">
				{(actions ?? []).map((action) => (
					<Button key={action.text} onClick={() => action.onClick?.()} variant={action.variant}>
						{action.icon && <action.icon className="mr-2" />}
						{action.text}
					</Button>
				))}
			</div>
		</Container>
	);
}
