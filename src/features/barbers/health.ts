import type { Barber } from '@/api/barbers';

export type HealthKey = 'new' | 'cancellations' | 'noshows' | 'excellent' | 'good' | 'coach';
export interface Health {
	key: HealthKey;
	tone: 'bad' | 'warn' | 'good' | 'neutral';
	label: string;
	why?: string;
}

// Same thresholds as barber-management-overview.svelte, so both dashboards agree.
export function health(b: Barber): Health {
	if (b.total_bookings === 0) return { key: 'new', tone: 'neutral', label: 'Pas encore de réservation' };
	if (b.cancellation_rate > 10)
		return { key: 'cancellations', tone: 'bad', label: `${String(b.cancellation_rate).replace('.', ',')} % d’annulations`, why: 'Plus de 10 % de ses réservations ont été annulées.' };
	if (b.no_show_rate > 5)
		return { key: 'noshows', tone: 'warn', label: `${String(b.no_show_rate).replace('.', ',')} % de clients absents`, why: 'Plus de 5 % de ses clients ne sont pas venus.' };
	if (b.completion_rate >= 90) return { key: 'excellent', tone: 'good', label: 'Excellent' };
	if (b.completion_rate >= 75) return { key: 'good', tone: 'neutral', label: 'Bon' };
	return { key: 'coach', tone: 'warn', label: 'À accompagner', why: 'Moins de 75 % de ses réservations sont allées jusqu’au bout.' };
}

export const needsAttention = (b: Barber) => ['cancellations', 'noshows', 'coach'].includes(health(b).key);
