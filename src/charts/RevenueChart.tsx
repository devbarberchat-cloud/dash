import { useMemo, useState, type KeyboardEvent } from 'react';
import { scaleBand, scaleLinear } from 'd3-scale';
import { t } from '@/i18n';
import { capitalize, dateShort, dateWeek, mad, tickMad, weekdayDate } from '@/lib/format';
import { useWidth } from './useSize';
import './charts.css';

type Point = { date: string; value: number };

/**
 * Revenue per day. Days are discrete and a closed day is a real zero, so bars:
 * black, at most 24px wide, 4px rounded tops, square at the baseline; a closed
 * day is a dot on the baseline. Hairline grid. Hover, tap or the arrow keys
 * read one day.
 */
export function RevenueChart({ points, height = 260 }: { points: Point[]; height?: number }) {
	const [ref, width] = useWidth<HTMLDivElement>();
	const [active, setActive] = useState<number | null>(null);
	const pad = { t: 16, r: 4, b: 30, l: 50 };
	const n = points.length;

	const { x, y, ticks } = useMemo(() => {
		const max = Math.max(1, ...points.map((p) => p.value));
		const y = scaleLinear().domain([0, max]).nice(4).range([height - pad.b, pad.t]);
		const x = scaleBand<number>()
			.domain(points.map((_, i) => i))
			.range([pad.l, width - pad.r])
			.paddingInner(0.28)
			.paddingOuter(0.1);
		return { x, y, ticks: y.ticks(4) };
	}, [points, width, height, pad.b, pad.t, pad.l, pad.r]);

	const bw = Math.min(24, x.bandwidth());
	const cx = (i: number) => (x(i) ?? 0) + x.bandwidth() / 2;
	const base = y(0);
	// about six date labels whatever the period, always including the last day
	const every = Math.max(1, Math.ceil(n / 6));
	const labelAt = (i: number) => (n - 1 - i) % every === 0;
	const fmtX = n <= 8 ? (d: string) => capitalize(dateWeek(d)) : dateShort;

	const pick = (clientX: number, rect: DOMRect) => {
		const px = ((clientX - rect.left) / rect.width) * width;
		const step = x.step();
		const i = Math.floor((px - pad.l - x.paddingOuter() * step) / step);
		setActive(Math.min(n - 1, Math.max(0, i)));
	};
	const onKey = (e: KeyboardEvent) => {
		if (e.key === 'ArrowRight') setActive((a) => Math.min(n - 1, (a ?? n - 1) + 1));
		else if (e.key === 'ArrowLeft') setActive((a) => Math.max(0, (a ?? n) - 1));
		else if (e.key === 'Home') setActive(0);
		else if (e.key === 'End') setActive(n - 1);
		else return;
		e.preventDefault();
	};

	// a bar: rounded at the data end only
	const bar = (i: number, v: number) => {
		const top = y(v);
		const h = base - top;
		const r = Math.min(4, h, bw / 2);
		const l = cx(i) - bw / 2;
		return `M${l},${base}V${top + r}Q${l},${top} ${l + r},${top}H${l + bw - r}Q${l + bw},${top} ${l + bw},${top + r}V${base}Z`;
	};

	const a = active != null ? points[active] : null;

	return (
		<div ref={ref} className="rchart">
			<svg
				width={width}
				height={height}
				role="img"
				tabIndex={0}
				aria-label={t('charts.revenueLabel', { count: n })}
				onPointerMove={(e) => pick(e.clientX, e.currentTarget.getBoundingClientRect())}
				onPointerDown={(e) => pick(e.clientX, e.currentTarget.getBoundingClientRect())}
				onPointerLeave={() => setActive(null)}
				onKeyDown={onKey}
				onBlur={() => setActive(null)}
			>
				{ticks.map((tick) => (
					<g key={tick}>
						<line x1={pad.l} x2={width - pad.r} y1={y(tick)} y2={y(tick)} className="rc-grid" />
						<text x={pad.l - 10} y={y(tick) + 4} textAnchor="end" className="rc-tick">
							{tickMad(tick)}
						</text>
					</g>
				))}
				{points.map((p, i) => {
					const state = active === i ? ' is-hot' : active != null ? ' is-dim' : i === n - 1 ? ' is-last' : '';
					return p.value > 0 ? (
						<path key={p.date} d={bar(i, p.value)} className={`rc-bar${state}`} />
					) : (
						<circle key={p.date} cx={cx(i)} cy={base - 3} r={2} className={`rc-closed${state}`} />
					);
				})}
				{points.map((p, i) =>
					labelAt(i) ? (
						<text key={`l${p.date}`} x={cx(i)} y={height - 8} textAnchor={i === n - 1 ? 'end' : 'middle'} className="rc-tick">
							{fmtX(p.date)}
						</text>
					) : null
				)}
			</svg>
			{a && active != null && (
				<div className="rc-tip" style={{ left: Math.min(Math.max(cx(active) - 80, 0), width - 160) }} aria-live="polite">
					<b className="num">{a.value ? mad(a.value) : t('charts.closed')}</b>
					<span>{capitalize(weekdayDate(a.date))}</span>
				</div>
			)}
		</div>
	);
}

/** The same numbers as a table, for readers who'd rather not use the chart. */
export function RevenueTable({ points }: { points: Point[] }) {
	return (
		<div className="rtable">
			<table>
				<caption className="sr-only">{t('overview.perDay')}</caption>
				<thead>
					<tr>
						<th scope="col">{t('charts.day')}</th>
						<th scope="col">{t('overview.revenue')}</th>
					</tr>
				</thead>
				<tbody>
					{[...points].reverse().map((p) => (
						<tr key={p.date}>
							<td>{capitalize(weekdayDate(p.date))}</td>
							<td className="num">{p.value ? mad(p.value) : t('charts.noSales')}</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}
