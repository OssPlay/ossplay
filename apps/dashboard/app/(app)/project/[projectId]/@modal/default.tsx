// Required for the @modal parallel-route slot to stay empty on every
// sibling route (Drive, Trash, Settings/*) except the one it intercepts
// (/open) — without this, Next.js has no fallback to render for the slot
// on routes that don't match it. See layout.tsx and @modal/(.)open/page.tsx.
export default function Default() {
	return null;
}
