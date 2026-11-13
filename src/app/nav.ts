import { CalendarDays, ChartNoAxesColumn, History, LayoutDashboard, Scissors, Settings, Store, Tag, UserRound, Users, Wallet, type LucideIcon } from 'lucide-react';
import type { MessageKey } from '@/i18n';

export interface NavItem {
	to: string;
	label: MessageKey;
	icon: LucideIcon;
	/** an exact match only (a parent of another page) */
	end?: boolean;
	/** other words the search finds this page by */
	keywords?: string;
}

export const NAV_MAIN: NavItem[] = [
	{ to: '/', label: 'nav.overview', icon: LayoutDashboard, end: true, keywords: 'accueil home dashboard' },
	{ to: '/reservations', label: 'nav.bookings', icon: CalendarDays, keywords: 'agenda bookings' },
	{ to: '/historique', label: 'nav.history', icon: History, keywords: 'history' },
	{ to: '/clients', label: 'nav.clients', icon: Users, keywords: 'customers' },
	{ to: '/barbiers', label: 'nav.barbers', icon: UserRound, keywords: 'équipe team barbers coiffeurs' },
	{ to: '/prestations', label: 'nav.services', icon: Scissors, keywords: 'menu services tarifs prix' },
	{ to: '/promotions', label: 'nav.promotions', icon: Tag, keywords: 'promo qr code' },
	{ to: '/paiements', label: 'nav.payments', icon: Wallet, keywords: 'facture invoice payments commission' },
	{ to: '/statistiques', label: 'nav.analytics', icon: ChartNoAxesColumn, keywords: 'analytics chiffres' }
];

export const NAV_SALON: NavItem[] = [
	{ to: '/salon', label: 'nav.salon', icon: Store, end: true, keywords: 'horaires hours adresse équipe shop' },
	{ to: '/parametres', label: 'nav.settings', icon: Settings, keywords: 'langue language compte account settings' }
];

export const NAV_ALL: NavItem[] = [...NAV_MAIN, ...NAV_SALON];

export function isActive(item: NavItem, pathname: string): boolean {
	if (item.end) return pathname === item.to;
	return pathname === item.to || pathname.startsWith(`${item.to}/`);
}

/** Pages that work with no salon selected. */
export const SALON_FREE = ['/parametres', '/salons', '/salon/nouveau'];
