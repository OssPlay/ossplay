import {
	browserSupportsWebAuthn,
	type PublicKeyCredentialCreationOptionsJSON,
	type PublicKeyCredentialRequestOptionsJSON,
	startAuthentication,
	startRegistration,
} from "@simplewebauthn/browser";
import { apiFetch } from "./api";

export { browserSupportsWebAuthn };

type LoginUser = { id: string; email: string; name: string };

// Shared by the /login "continue with passkey" button and
// /forgot-password/passkey (a successful passkey login *is* full account
// recovery, sidestepping the password entirely) — both are the exact same
// ceremony against the same public endpoints.
export async function loginWithPasskey(): Promise<{ user: LoginUser }> {
	const options = await apiFetch<PublicKeyCredentialRequestOptionsJSON>(
		"/auth/passkey/login-options",
		{ method: "POST" },
	);
	const response = await startAuthentication({ optionsJSON: options });
	return apiFetch<{ user: LoginUser }>("/auth/passkey/login-verify", {
		method: "POST",
		body: JSON.stringify({ response }),
	});
}

// Used by the passkeys section in /settings/security — requires an existing
// session (register-options/register-verify are both requireAuth).
export async function registerPasskey(
	deviceName?: string,
): Promise<{ credential: { id: string; deviceName: string | null; createdAt: string } }> {
	const options = await apiFetch<PublicKeyCredentialCreationOptionsJSON>(
		"/auth/passkey/register-options",
		{ method: "POST" },
	);
	const response = await startRegistration({ optionsJSON: options });
	return apiFetch("/auth/passkey/register-verify", {
		method: "POST",
		body: JSON.stringify({ response, deviceName }),
	});
}
