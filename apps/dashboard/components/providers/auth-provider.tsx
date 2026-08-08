"use client";

import { LoaderCircleIcon, LogOutIcon, RefreshCwIcon } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import React from "react";
import { toast } from "sonner";
import useSWR, { type KeyedMutator } from "swr";
import { useAction } from "@/hooks/use-action";
import { useActiveActionCount } from "@/lib/action-store";
import { apiFetch } from "@/lib/api";
import type { Auth, Me, MeUser } from "@/types/auth";
import type { InstanceRepo } from "@/types/instance";
import ErrorBoundary from "../layout/error-boundary";
import { UpdateApplyDialog } from "./update-apply-dialog";
import { UpdateRecallGuard } from "./update-recall-guard";

const defaultUser: MeUser = {
	id: "",
	email: "",
	name: "",
	instanceRole: null,
	totpEnabled: false,
	recoveryCodesRemaining: 0,
};

export const AuthContext = React.createContext<
	Auth & { instance?: InstanceRepo; mutateInstance: KeyedMutator<InstanceRepo> }
>({
	isLoading: true,
	user: defaultUser,
	organizations: [],
	handleLogout: async () => {},
	mutate: (() => Promise.resolve()) as unknown as KeyedMutator<Me>,
	mutateInstance: (() => Promise.resolve()) as unknown as KeyedMutator<InstanceRepo>,
});

export function useAuth() {
	return React.useContext(AuthContext);
}

export default function AuthProvider({ children }: React.PropsWithChildren) {
	const router = useRouter();
	const activeActionCount = useActiveActionCount();
	const pathname = usePathname();
	const { data: me, isLoading: aML, error: aME, mutate: aMM } = useSWR<Me>("/auth/me");
	const {
		data: instanceData,
		isLoading: iDL,
		error: iDE,
		mutate: iDM,
	} = useSWR<InstanceRepo>("/instance", {
		revalidateOnFocus: false,
		revalidateIfStale: false,
	});

	const logout = useAction(() => apiFetch("/auth/logout", { method: "POST" }), {
		error: null,
	});

	const isLoading = aML || iDL;
	const error = aME || iDE;

	async function handleLogout(): Promise<void> {
		if (activeActionCount > 0) {
			toast.info("Please wait for the current action to finish.");
			return;
		}
		try {
			await logout.trigger();
		} catch {
			toast.error("Failed to log out.");
		} finally {
			// Always navigate away, even if the server-side logout call failed —
			// clearing local state matters more than a clean server round-trip.
			router.replace(
				`/login?continue=${encodeURIComponent(
					pathname + (typeof window !== "undefined" ? window.location.search : ""),
				)}`,
			);
			router.refresh();
		}
	}

	if (isLoading) {
		return (
			<div className="flex items-center justify-center flex-1">
				<LoaderCircleIcon className="size-8 animate-spin" />
			</div>
		);
	}

	if (error) {
		return (
			<div className="flex flex-col items-center justify-center flex-1 p-8">
				<ErrorBoundary
					error={error}
					description="Failed to authenticate your session. Please try again."
					// action={handleLogin}
					actions={[
						{
							text: "Logout",
							icon: LogOutIcon,
							onClick: handleLogout,
							variant: "destructive",
						},
						{
							text: "Retry",
							icon: RefreshCwIcon,
							onClick: iDE ? iDM : aMM,
						},
					]}
				/>
			</div>
		);
	}

	return (
		<AuthContext
			value={{
				user: me?.user ?? defaultUser,
				organizations: me?.organizations ?? [],
				isLoading: isLoading || logout.isLoading,
				handleLogout,
				mutate: aMM,
				instance: instanceData,
				mutateInstance: iDM,
			}}
		>
			<UpdateRecallGuard />
			<UpdateApplyDialog />
			{children}
		</AuthContext>
	);
}
