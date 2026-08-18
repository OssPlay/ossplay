import { ApiError } from "@/lib/api";

// Every instance-root-only page (users, servers, SMTP, SSH keys, error logs,
// user detail) hits the same 403 from the API when a non-root instance user
// loads it, and all of them fell back to the same plain message — this is
// that one check, reused instead of re-deriving `instanceof ApiError &&
// status === 403` per page. Deliberately narrower than a generic
// "isForbidden" check: a 404 (e.g. organization/members, organization/projects)
// means something different and is not this hook's concern.
export function useInstanceRoleGate(error: unknown): boolean {
	return error instanceof ApiError && error.status === 403;
}
