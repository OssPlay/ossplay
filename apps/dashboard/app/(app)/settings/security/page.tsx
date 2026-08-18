// All real content lives in this segment's @password/@passkeys/@twofactor/@sessions
// slots (see layout.tsx) — each independently fetches its own data and mutates
// independently, rather than one page owning all of it. Nothing unique to render here.
export default function SecurityPage() {
	return null;
}
