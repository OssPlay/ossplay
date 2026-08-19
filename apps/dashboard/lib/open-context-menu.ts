// A visible "..." button's onClick that opens the same menu a right-click
// would, anchored near the button instead of the cursor. Base UI's
// ContextMenuTrigger only reacts to a native `contextmenu` DOM event (see
// its source — there's no imperative "open at this position" API), so
// dispatching one on the trigger's own subtree is the supported way to
// open it programmatically. This also re-fires whatever `onContextMenu`
// selection logic the trigger element already has wired up (e.g. Drive's
// ensureSelectedForContextMenu), for free, since it's the same event.
export function openContextMenu(e: React.MouseEvent): void {
	e.stopPropagation();
	e.preventDefault();
	const rect = e.currentTarget.getBoundingClientRect();
	e.currentTarget.dispatchEvent(
		new MouseEvent("contextmenu", {
			bubbles: true,
			clientX: rect.left,
			clientY: rect.bottom,
		}),
	);
}
