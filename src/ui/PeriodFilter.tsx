import { useState } from 'react';
import type { Period, PeriodQuery } from '@/api/dashboard';
import { t } from '@/i18n';
import { Button } from './Button';
import { ChipGroup } from './controls';
import { Field, Input } from './Field';
import './PeriodFilter.css';

const PERIODS: readonly Period[] = ['last_7_days', 'last_30_days', 'current_month', 'custom'];

/** The period a page reports on: three ready-made ones, or two dates. `sm` is the small one, beside the figures it filters. */
export function PeriodFilter({ value, onChange, size = 'md' }: { value: PeriodQuery; onChange: (next: PeriodQuery) => void; size?: 'md' | 'sm' }) {
	const [start, setStart] = useState(value.start_date ?? '');
	const [end, setEnd] = useState(value.end_date ?? '');
	const invalid = Boolean(start && end && start > end);

	return (
		<div className={`period${size === 'sm' ? ' period--sm' : ''}`}>
			<ChipGroup
				label={t('period.label')}
				options={PERIODS.map((period) => ({ value: period, label: t(`period.short.${period}`) }))}
				value={value.period}
				onChange={(period) => onChange(period === 'custom' ? { period, start_date: start, end_date: end } : { period })}
			/>
			{value.period === 'custom' && (
				<form
					className="period-range"
					onSubmit={(event) => {
						event.preventDefault();
						if (!invalid && start && end) onChange({ period: 'custom', start_date: start, end_date: end });
					}}
				>
					<Field label={t('period.from')}>{({ id }) => <Input id={id} type="date" value={start} max={end || undefined} onChange={(e) => setStart(e.target.value)} />}</Field>
					<Field label={t('period.to')} error={invalid ? t('period.invalidRange') : null}>
						{({ id, describedBy, invalid: bad }) => (
							<Input id={id} type="date" value={end} min={start || undefined} onChange={(e) => setEnd(e.target.value)} aria-describedby={describedBy} aria-invalid={bad} />
						)}
					</Field>
					<Button type="submit" size="sm" dot={false} disabled={!start || !end || invalid}>
						{t('period.apply')}
					</Button>
				</form>
			)}
		</div>
	);
}
