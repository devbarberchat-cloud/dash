import { useState } from 'react';
import { int, pct } from '@/lib/format';
import './charts.css';

export interface Part {
	key: string;
	label: string;
	value: number;
	/** a token, e.g. var(--st-done) */
	color: string;
}

/**
 * One whole split into parts: a thin segmented bar with no text inside. The
 * legend under it carries every name, count and share, so nothing depends on
 * hover or on color.
 */
export function StatusBar({ parts, label }: { parts: Part[]; label: string }) {
	const [hot, setHot] = useState<string | null>(null);
	const total = parts.reduce((sum, p) => sum + p.value, 0);
	const share = (value: number) => (total ? (value / total) * 100 : 0);
	const summary = parts.map((p) => `${p.label} ${int(p.value)} (${pct(share(p.value))})`).join(', ');

	return (
		<div className="sbar">
			<div className="sbar-track" role="img" aria-label={`${label}: ${summary}`}>
				{parts
					.filter((p) => p.value > 0)
					.map((p) => (
						<span
							key={p.key}
							className={`sbar-part${hot && hot !== p.key ? ' is-dim' : ''}`}
							style={{ flexGrow: p.value, background: p.color }}
							onPointerEnter={() => setHot(p.key)}
							onPointerLeave={() => setHot(null)}
						/>
					))}
			</div>
			<ul className="sbar-legend">
				{parts.map((p) => (
					<li key={p.key} onPointerEnter={() => setHot(p.key)} onPointerLeave={() => setHot(null)}>
						<span className="sbar-key" style={{ background: p.color }} aria-hidden />
						<span className="sbar-name">{p.label}</span>
						<b className="num">{int(p.value)}</b>
						<span className="num sbar-share">{pct(share(p.value))}</span>
					</li>
				))}
			</ul>
		</div>
	);
}
