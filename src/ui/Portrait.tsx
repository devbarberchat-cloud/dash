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

/** A round face, for short lists. */
export function Avatar({ name, src, size = 36 }: { name: string; src?: string | null; size?: number }) {
	return (
		<span className="avatar" style={{ width: size, height: size, fontSize: size * 0.36 }} aria-hidden>
			{src ? <img src={src} alt="" loading="lazy" decoding="async" /> : initials(name)}
		</span>
	);
}
