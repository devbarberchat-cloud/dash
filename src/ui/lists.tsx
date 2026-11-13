import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Search, X } from 'lucide-react';
import { t } from '@/i18n';
import { statusColor, statusLabel, toBookingStatus } from '@/lib/booking-status';
import './lists.css';

/** The value, once it has stopped changing for a moment: for search-as-you-type. */
export function useDebounced<T>(value: T, ms = 300) {
	const [settled, setSettled] = useState(value);
	useEffect(() => {
		const timer = setTimeout(() => setSettled(value), ms);
		return () => clearTimeout(timer);
	}, [value, ms]);
	return settled;
}

export function SearchInput({ value, onChange, label, block }: { value: string; onChange: (value: string) => void; label: string; block?: boolean }) {
	return (
		<label className={`search${block ? ' search--block' : ''}`}>
			<Search aria-hidden />
			<span className="sr-only">{label}</span>
			<input type="search" value={value} onChange={(event) => onChange(event.target.value)} placeholder={label} autoComplete="off" />
			{value && (
				<button type="button" className="search-clear" aria-label={t('common.buttons.clear')} onClick={() => onChange('')}>
					<X aria-hidden />
				</button>
			)}
		</label>
	);
}

export function Pager({ page, totalPages, onPage }: { page: number; totalPages: number; onPage: (page: number) => void }) {
	if (totalPages <= 1) return null;
	return (
		<nav className="pager" aria-label={t('pagination.label')}>
			<button type="button" className="pager-btn" aria-label={t('pagination.previous')} disabled={page <= 1} onClick={() => onPage(page - 1)}>
				<ChevronLeft aria-hidden />
			</button>
			<span className="num">{t('pagination.page', { page, total: totalPages })}</span>
			<button type="button" className="pager-btn" aria-label={t('pagination.next')} disabled={page >= totalPages} onClick={() => onPage(page + 1)}>
				<ChevronRight aria-hidden />
			</button>
		</nav>
	);
}

/** A booking's state: a dot in its color, and its name. */
export function StatusBadge({ status }: { status: string }) {
	const known = toBookingStatus(status);
	return (
		<span className="badge">
			<i style={{ background: known ? statusColor(known) : 'var(--faint)' }} aria-hidden />
			{known ? statusLabel(known) : status}
		</span>
	);
}
