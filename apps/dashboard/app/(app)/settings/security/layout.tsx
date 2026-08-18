import type React from "react";
import { Fragment } from "react";

// Each slot is its own route segment with its own data-fetching/mutations
// and its own error.tsx blast radius — a crash in one card (e.g. Passkeys)
// no longer takes the whole page down with it. `children` (this segment's
// own page.tsx) renders nothing; every real section lives in a slot.
export default function SecurityLayout({
	password,
	passkeys,
	twofactor,
	sessions,
}: {
	children: React.ReactNode;
	password: React.ReactNode;
	passkeys: React.ReactNode;
	twofactor: React.ReactNode;
	sessions: React.ReactNode;
}) {
	return (
		<div className="flex flex-col gap-6">
			<Fragment key="password">{password}</Fragment>
			<Fragment key="passkeys">{passkeys}</Fragment>
			<Fragment key="twofactor">{twofactor}</Fragment>
			<Fragment key="sessions">{sessions}</Fragment>
		</div>
	);
}
