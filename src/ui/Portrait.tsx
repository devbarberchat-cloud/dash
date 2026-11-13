import { initials } from '@/lib/format';
import './Portrait.css';

/** The app's barber frame (61 × 108). Without a photo: initials on the site's grey. */
export function Portrait({ name, src, size = 76, className = '' }: { name: string; src?: string | null; size?: number; className?: string }) {
	return (
		<span className={`portrait ${className}`} style={{ width: size }} aria-hidden>
			{src ? <img src={src} alt="" loading="lazy" decoding="async" /> : <span className="portrait-mono">{initials(name)}</span>}
		</span>
	);
}

/**
 * A profile photo in a line of a list: the same 61 × 108 frame as every
 * profile photo in the app, a little taller than `size` so it reads beside text.
 */
export function Avatar({ name, src, size = 36, round = false }: { name: string; src?: string | null; size?: number; /** a small round face, for tags */ round?: boolean }) {
	const width = round ? size : Math.round(size * 1.25 * (61 / 108));
	return (
		<span className={round ? 'avatar avatar--round' : 'portrait avatar'} style={round ? { width: size, height: size, fontSize: size * 0.36 } : { width, fontSize: Math.max(9, width * 0.4) }} aria-hidden>
			{src ? <img src={src} alt="" loading="lazy" decoding="async" /> : initials(name)}
		</span>
	);
}
