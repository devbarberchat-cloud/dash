import { int } from '@/lib/format';
import './BarberScore.css';

/** BarberScore's own mark: the red flame. */
export function Flame({ className = '' }: { className?: string }) {
	return (
		<svg className={`flame ${className}`} viewBox="0 0 22 31" aria-hidden="true">
			<path
				d="M11 30.25C4.92486 30.25 0 25.5255 0 19.6977C0 16.6673 1.33153 13.9354 3.46396 12.0108C5.43258 10.234 10.2667 7.03419 9.53333 0C18.3333 5.62791 22.7333 11.2558 13.9333 19.6977C15.4 19.6977 17.6 19.6977 21.2667 16.2219C21.6622 17.3103 22 18.4799 22 19.6977C22 25.5255 17.0751 30.25 11 30.25Z"
				fill="#FF0101"
			/>
		</svg>
	);
}

/**
 * A barber's BarberScore: points clients gift at the end of a finished
 * service, as many as they choose. Points, with no money value, never stars.
 */
export function BarberScore({ value, signed = false }: { value: number | string | null | undefined; signed?: boolean }) {
	const n = Number(value ?? 0);
	return (
		<span className="bscore">
			<Flame />
			<span className="num">
				{signed && n > 0 ? '+' : ''}
				{int(n)}
			</span>
		</span>
	);
}
