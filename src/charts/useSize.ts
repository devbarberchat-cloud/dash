import { useEffect, useRef, useState } from 'react';

/** Width of a container, kept current with a ResizeObserver. */
export function useWidth<T extends HTMLElement>(initial = 640) {
	const ref = useRef<T>(null);
	const [width, setWidth] = useState(initial);
	useEffect(() => {
		const el = ref.current;
		if (!el) return;
		const ro = new ResizeObserver(([entry]) => entry && setWidth(Math.max(240, Math.floor(entry.contentRect.width))));
		ro.observe(el);
		return () => ro.disconnect();
	}, []);
	return [ref, width] as const;
}
