"use client";

import {
	type KeyboardEvent,
	type MouseEvent,
	type PointerEvent,
	useCallback,
	useRef,
	useState,
} from "react";

export interface DriveSelectableItem {
	id: string;
}

export interface MarqueeRect {
	left: number;
	top: number;
	width: number;
	height: number;
}

// Click-to-select / double-click-to-open / shift-range / cmd-additive /
// drag-marquee selection, shared by DriveGrid and DriveList so both views
// speak identical selection semantics. `items` must be in the same order
// they're rendered — shift-range selects the contiguous slice between the
// last plain selection and the shift-clicked item.
export function useDriveSelection(items: DriveSelectableItem[]) {
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [focusedId, setFocusedId] = useState<string | null>(null);
	const lastIndexRef = useRef<number | null>(null);
	const containerRef = useRef<HTMLDivElement | null>(null);
	const itemElements = useRef(new Map<string, HTMLElement>());
	const [marqueeRect, setMarqueeRect] = useState<MarqueeRect | null>(null);
	const marqueeOrigin = useRef<{ x: number; y: number } | null>(null);
	const marqueeBaseline = useRef<Set<string>>(new Set());

	const registerItemRef = useCallback(
		(id: string) => (el: HTMLElement | null) => {
			if (el) itemElements.current.set(id, el);
			else itemElements.current.delete(id);
		},
		[],
	);

	const isSelected = useCallback((id: string) => selected.has(id), [selected]);
	const clear = useCallback(() => setSelected(new Set()), []);

	function indexOf(id: string) {
		return items.findIndex((item) => item.id === id);
	}

	function selectRange(id: string) {
		const index = indexOf(id);
		if (lastIndexRef.current === null || index === -1) {
			setSelected(new Set([id]));
			lastIndexRef.current = index;
			return;
		}
		const [start, end] = [lastIndexRef.current, index].sort((a, b) => a - b);
		setSelected(new Set(items.slice(start, end + 1).map((item) => item.id)));
	}

	function toggleItem(id: string) {
		setSelected((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
		lastIndexRef.current = indexOf(id);
	}

	// Plain mousedown on an item that's ALREADY selected deliberately does
	// nothing — collapsing immediately would make it impossible to
	// drag-move a multi-selection (mousedown would shrink it to one item
	// before the drag even starts). It only collapses on a plain click
	// (below), which never fires if a native HTML5 drag intervened.
	function handleItemPointerDown(id: string, e: PointerEvent) {
		if (e.button !== 0) return;
		setFocusedId(id);
		if (e.shiftKey) {
			selectRange(id);
			return;
		}
		if (e.metaKey || e.ctrlKey) {
			toggleItem(id);
			return;
		}
		if (!selected.has(id)) {
			setSelected(new Set([id]));
			lastIndexRef.current = indexOf(id);
		}
	}

	function handleItemClick(id: string, e: MouseEvent) {
		if (e.shiftKey || e.metaKey || e.ctrlKey) return;
		setSelected(new Set([id]));
		lastIndexRef.current = indexOf(id);
		setFocusedId(id);
	}

	// Geometry-based (not column-count-based) so it stays correct across the
	// grid's responsive breakpoints without hardcoding them — reuses the same
	// `itemElements` ref map the marquee hit-testing already populates. Finds
	// the closest row in the given direction, then the closest item within
	// that row by horizontal center — works for the single-column list too
	// (every "row" is one item).
	function nearestInDirection(fromId: string, direction: "up" | "down") {
		const fromEl = itemElements.current.get(fromId);
		if (!fromEl) return null;
		const fromRect = fromEl.getBoundingClientRect();
		const fromCenterX = fromRect.left + fromRect.width / 2;
		const candidates: { id: string; top: number; dx: number }[] = [];
		for (const [id, el] of itemElements.current) {
			if (id === fromId) continue;
			const rect = el.getBoundingClientRect();
			const isPast =
				direction === "down" ? rect.top > fromRect.top + 1 : rect.top < fromRect.top - 1;
			if (!isPast) continue;
			candidates.push({
				id,
				top: rect.top,
				dx: Math.abs(rect.left + rect.width / 2 - fromCenterX),
			});
		}
		if (candidates.length === 0) return null;
		const targetTop =
			direction === "down"
				? Math.min(...candidates.map((c) => c.top))
				: Math.max(...candidates.map((c) => c.top));
		const sameRow = candidates.filter((c) => Math.abs(c.top - targetTop) < 2);
		sameRow.sort((a, b) => a.dx - b.dx);
		return sameRow[0]?.id ?? null;
	}

	function adjacentInOrder(fromId: string, step: 1 | -1) {
		const idx = indexOf(fromId);
		if (idx === -1) return null;
		return items[idx + step]?.id ?? null;
	}

	function focusItem(id: string) {
		setFocusedId(id);
		itemElements.current.get(id)?.focus();
	}

	// Attached to the whole Container (not just the grid/list wrapper) so
	// Escape/Cmd+A work no matter where focus landed inside it — Container
	// already forwards arbitrary props to its root element, so no shared
	// component change was needed for this to reach the whole card.
	function handleContainerKeyDown(e: KeyboardEvent) {
		if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "a") {
			e.preventDefault();
			setSelected(new Set(items.map((item) => item.id)));
			return;
		}
		if (e.key === "Escape") {
			if (selected.size === 0) return;
			e.preventDefault();
			setSelected(new Set());
			return;
		}
		const isArrow =
			e.key === "ArrowUp" ||
			e.key === "ArrowDown" ||
			e.key === "ArrowLeft" ||
			e.key === "ArrowRight";
		if (!isArrow) return;
		const currentId = focusedId ?? [...selected][0] ?? items[0]?.id ?? null;
		if (!currentId || !itemElements.current.has(currentId)) return;
		let targetId: string | null = null;
		if (e.key === "ArrowDown") targetId = nearestInDirection(currentId, "down");
		else if (e.key === "ArrowUp") targetId = nearestInDirection(currentId, "up");
		else if (e.key === "ArrowRight") targetId = adjacentInOrder(currentId, 1);
		else targetId = adjacentInOrder(currentId, -1);
		if (!targetId) return;
		e.preventDefault();
		if (e.shiftKey) {
			selectRange(targetId);
		} else {
			setSelected(new Set([targetId]));
			lastIndexRef.current = indexOf(targetId);
		}
		focusItem(targetId);
	}

	// Right-clicking an item that's part of the current multi-selection
	// keeps the whole selection (so "Move to trash" from that item's menu
	// acts on all of them); right-clicking outside it selects just that item.
	function ensureSelectedForContextMenu(id: string) {
		setSelected((prev) => (prev.has(id) ? prev : new Set([id])));
	}

	function handleContainerPointerDown(e: PointerEvent) {
		if (e.button !== 0 || e.target !== e.currentTarget) return;
		const rect = containerRef.current?.getBoundingClientRect();
		if (!rect) return;
		const additive = e.shiftKey || e.metaKey || e.ctrlKey;
		marqueeBaseline.current = additive ? new Set(selected) : new Set();
		if (!additive) setSelected(new Set());
		marqueeOrigin.current = { x: e.clientX, y: e.clientY };
		setMarqueeRect({ left: e.clientX - rect.left, top: e.clientY - rect.top, width: 0, height: 0 });
		containerRef.current?.setPointerCapture(e.pointerId);
	}

	function handleContainerPointerMove(e: PointerEvent) {
		const origin = marqueeOrigin.current;
		const rect = containerRef.current?.getBoundingClientRect();
		if (!origin || !rect) return;
		const left = Math.min(origin.x, e.clientX);
		const top = Math.min(origin.y, e.clientY);
		const right = Math.max(origin.x, e.clientX);
		const bottom = Math.max(origin.y, e.clientY);
		setMarqueeRect({
			left: left - rect.left,
			top: top - rect.top,
			width: right - left,
			height: bottom - top,
		});

		const hits = new Set<string>();
		for (const [id, el] of itemElements.current) {
			const r = el.getBoundingClientRect();
			if (r.left < right && r.right > left && r.top < bottom && r.bottom > top) hits.add(id);
		}
		setSelected(new Set([...marqueeBaseline.current, ...hits]));
	}

	function handleContainerPointerUp(e: PointerEvent) {
		if (!marqueeOrigin.current) return;
		marqueeOrigin.current = null;
		setMarqueeRect(null);
		containerRef.current?.releasePointerCapture(e.pointerId);
	}

	return {
		selected,
		isSelected,
		setSelected,
		clear,
		registerItemRef,
		handleItemPointerDown,
		handleItemClick,
		ensureSelectedForContextMenu,
		marqueeRect,
		containerRef,
		containerHandlers: {
			onPointerDown: handleContainerPointerDown,
			onPointerMove: handleContainerPointerMove,
			onPointerUp: handleContainerPointerUp,
		},
		focusedId,
		handleContainerKeyDown,
	};
}

// Exported so DriveView can hold the single selection instance shared by
// whichever of DriveGrid/DriveList is currently rendered (view-mode toggle
// shouldn't reset what's selected), and pass it down as a prop rather than
// each view creating its own.
export type DriveSelection = ReturnType<typeof useDriveSelection>;
