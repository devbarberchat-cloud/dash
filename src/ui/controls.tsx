import type { ReactNode } from 'react';
import { errorText } from '@/api/http';
import { t } from '@/i18n';
import { Button } from './Button';
import './controls.css';

/** The site's chips, as a single-choice group. */
export function ChipGroup<T extends string>({
	label,
	options,
	value,
	onChange
}: {
	label: string;
	options: readonly { value: T; label: ReactNode; count?: number }[];
	value: T;
	onChange: (v: T) => void;
}) {
	return (
		<div className="chips" role="group" aria-label={label}>
			{options.map((o) => (
				<button
					key={o.value}
					type="button"
					aria-pressed={value === o.value}
					className={`chip${value === o.value ? ' is-on' : ''}`}
					onClick={() => onChange(o.value)}
				>
					{o.label}
					{o.count !== undefined && <b className="num">{o.count}</b>}
				</button>
			))}
		</div>
	);
}

export function Switch({ checked, onChange, label, id, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; id?: string; disabled?: boolean }) {
	return (
		<button
			id={id}
			type="button"
			role="switch"
			aria-checked={checked}
			aria-label={label}
			disabled={disabled}
			className="switch"
			onClick={() => onChange(!checked)}
		/>
	);
}

type Tone = 'good' | 'warn' | 'bad' | 'neutral';
/** State: always an icon or dot plus words, never color alone. */
export function Badge({ tone = 'neutral', icon, children }: { tone?: Tone; icon?: ReactNode; children: ReactNode }) {
	return (
		<span className={`badge badge--${tone}`}>
			{icon ?? <i aria-hidden />}
			{children}
		</span>
	);
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
	return (
		<div className="empty">
			<p className="empty-title">{title}</p>
			{children && <p>{children}</p>}
			{action}
		</div>
	);
}

/** A request that failed: what happened, and a way to ask again. */
export function Failure({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
	return (
		<div className="empty" role="alert">
			<p className="empty-title">{errorText(error)}</p>
			{onRetry && (
				<Button variant="outline" size="sm" onClick={onRetry}>
					{t('common.buttons.retry')}
				</Button>
			)}
		</div>
	);
}

/** Holds the place of a page or a list while its first data loads. */
export function Loading({ label }: { label?: string }) {
	return <div className="loading" aria-busy="true" aria-label={label ?? t('common.messages.loading')} />;
}
