import { useEffect, useRef } from 'react';

/** Closes a menu on a click outside it or on Escape. Put the returned ref on the menu's wrapper. */
export function useDismiss<T extends HTMLElement>(open: boolean, close: () => void) {
	const ref = useRef<T>(null);
	useEffect(() => {
		if (!open) return;
		const onPointer = (event: PointerEvent) => {
			if (!ref.current?.contains(event.target as Node)) close();
		};
		const onKey = (event: KeyboardEvent) => {
			if (event.key === 'Escape') close();
		};
		document.addEventListener('pointerdown', onPointer);
		document.addEventListener('keydown', onKey);
		return () => {
			document.removeEventListener('pointerdown', onPointer);
			document.removeEventListener('keydown', onKey);
		};
	}, [open, close]);
	return ref;
}
