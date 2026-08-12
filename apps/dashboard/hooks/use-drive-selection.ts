"use client";

import { type MouseEvent, type PointerEvent, useCallback, useRef, useState } from "react";

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
	};
}

// Exported so DriveView can hold the single selection instance shared by
// whichever of DriveGrid/DriveList is currently rendered (view-mode toggle
// shouldn't reset what's selected), and pass it down as a prop rather than
// each view creating its own.
export type DriveSelection = ReturnType<typeof useDriveSelection>;
