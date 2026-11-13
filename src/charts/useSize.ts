import { useCallback, useRef, useState } from 'react';

/**
 * Width of a container, kept current with a ResizeObserver. A callback ref
 * attaches the observer whenever the element appears (an effect run once at
 * mount can miss it when the element comes later), so a chart always draws at
 * the width it has, never at the default.
 */
export function useWidth<T extends HTMLElement>(initial = 640) {
	const [width, setWidth] = useState(initial);
	const observer = useRef<ResizeObserver | null>(null);
	const ref = useCallback((el: T | null) => {
		observer.current?.disconnect();
		observer.current = null;
		if (!el) return;
		const measure = (w: number) => {
			if (w > 0) setWidth(Math.max(240, Math.floor(w)));
		};
		measure(el.getBoundingClientRect().width);
		observer.current = new ResizeObserver(([entry]) => entry && measure(entry.contentRect.width));
		observer.current.observe(el);
	}, []);
	return [ref, width] as const;
}
