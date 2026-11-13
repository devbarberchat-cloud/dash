import { useMemo } from 'react';
import { scaleBand, scaleLinear } from 'd3-scale';
import { t } from '@/i18n';
import { capitalize, dateFull, dateWeek, decimal, int, mad, today, weekdayShort } from '@/lib/format';
import { useWidth } from './useSize';
import './charts.css';

export interface DayPoint {
	date: string;
	value: number;
	/** bookings completed that day, when they are known */
	count?: number;
}

const dayOfMonth = (date: string) => String(Number(date.slice(8, 10)));

/**
 * A week of revenue, one bar a day, every bar numbered: its amount above it,
 * its weekday and date under it, then the bookings completed that day. There
 * is nothing to hover or to tap, all of it is printed. A dashed line marks the
 * average of the days with sales; a day without sales is a dot on the baseline.
 */
export function DayBars({ points, average, height = 264 }: { points: DayPoint[]; average: number; height?: number }) {
	const [ref, width] = useWidth<HTMLDivElement>();
	const n = points.length;
	// seven slots whatever the number of days, so a short week keeps the same bars
	const slots = Math.max(7, n);
	const band = width / slots;
	const tight = band < 46;
	const withCounts = !tight && points.some((point) => point.count !== undefined);
	const pad = { t: 26, b: tight || withCounts ? 44 : 26 };
	const base = height - pad.b;

	const { x, y } = useMemo(() => {
		const max = Math.max(1, ...points.map((point) => point.value));
		return {
			x: scaleBand<number>()
				.domain(Array.from({ length: slots }, (_, i) => i))
				.range([0, width])
				.paddingInner(0.3)
				.paddingOuter(0.15),
			y: scaleLinear().domain([0, max]).range([base, pad.t])
		};
	}, [points, slots, width, base, pad.t]);

	const bw = Math.min(56, x.bandwidth());
	// a short week sits at the right, against today
	const cx = (i: number) => (x(i + slots - n) ?? 0) + x.bandwidth() / 2;
	// the amount in full when it fits its slot, in thousands when it does not
	const amount = (value: number) => (int(value).length * 7.4 > band - 2 ? `${decimal(value / 1000, 1)} k` : int(value));
	const labelWidth = (value: number) => amount(value).length * 7.4 + 6;

	const bar = (i: number, value: number) => {
		const top = y(value);
		const h = base - top;
		const r = Math.min(6, h, bw / 2);
		const left = cx(i) - bw / 2;
		return `M${left},${base}V${top + r}Q${left},${top} ${left + r},${top}H${left + bw - r}Q${left + bw},${top} ${left + bw},${top + r}V${base}Z`;
	};

	const summary = points.map((point) => `${dateFull(point.date)} : ${point.value ? mad(point.value) : t('charts.noSales')}`).join('. ');
	const now = today();

	return (
		<div ref={ref} className="dbars">
			<svg width={width} height={height} role="img" aria-label={t('home.chartLabel', { summary })}>
				<line x1={0} x2={width} y1={base + 0.5} y2={base + 0.5} className="rc-grid" />
				{average > 0 && <line x1={0} x2={width} y1={y(average)} y2={y(average)} className="db-average" />}
				{points.map((point, i) => (
					<g key={point.date} className={point.date === now ? 'is-today' : undefined}>
						{point.value > 0 ? <path d={bar(i, point.value)} className="db-bar" /> : <circle cx={cx(i)} cy={base - 3} r={2} className="rc-closed" />}
						{point.value > 0 && <rect x={cx(i) - labelWidth(point.value) / 2} y={y(point.value) - 21} width={labelWidth(point.value)} height={16} className="db-back" />}
						<text x={cx(i)} y={(point.value > 0 ? y(point.value) : base - 6) - 8} textAnchor="middle" className={`db-amount${point.value > 0 ? '' : ' is-none'}`}>
							{point.value > 0 ? amount(point.value) : '—'}
						</text>
						{tight ? (
							<>
								<text x={cx(i)} y={base + 18} textAnchor="middle" className="db-day">
									{capitalize(weekdayShort(point.date))}
								</text>
								<text x={cx(i)} y={base + 35} textAnchor="middle" className="db-day">
									{dayOfMonth(point.date)}
								</text>
							</>
						) : (
							<>
								<text x={cx(i)} y={base + 18} textAnchor="middle" className="db-day">
									{capitalize(dateWeek(point.date))}
								</text>
								{withCounts && (
									<text x={cx(i)} y={base + 35} textAnchor="middle" className="db-count">
										{t('home.doneShort', { count: point.count ?? 0 })}
									</text>
								)}
							</>
						)}
					</g>
				))}
			</svg>
		</div>
	);
}
