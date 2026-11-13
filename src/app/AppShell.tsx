import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, ScrollRestoration, useLocation } from 'react-router';
import { Menu, PanelLeftClose, PanelLeftOpen, Search } from 'lucide-react';
import logo from '@/design/logo-black.svg';
import { t } from '@/i18n';
import { Empty, Failure, Loading } from '@/ui/controls';
import { AccountMenu } from './AccountMenu';
import { CommandPalette } from './CommandPalette';
import { NAV_MAIN, NAV_SALON, SALON_FREE, isActive, type NavItem } from './nav';
import { ShopSwitcher } from './ShopSwitcher';
import { useShopContext } from './shop-context';
import './AppShell.css';

const COLLAPSED_KEY = 'bc_sidebar_collapsed';
const readCollapsed = () => {
	try {
		return localStorage.getItem(COLLAPSED_KEY) === 'true';
	} catch {
		return false;
	}
};

/** The frame around every page: the sidebar (a drawer on phones) and the page itself. */
export function AppShell() {
	const { shop, isPending, error, retry } = useShopContext();
	const { pathname } = useLocation();
	const [drawer, setDrawer] = useState(false);
	const [collapsed, setCollapsed] = useState(readCollapsed);
	const [searching, setSearching] = useState(false);

	useEffect(() => setDrawer(false), [pathname]);
	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			if (event.key === 'Escape') setDrawer(false);
			if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
				event.preventDefault();
				setSearching((shown) => !shown);
			}
		};
		document.addEventListener('keydown', onKey);
		return () => document.removeEventListener('keydown', onKey);
	}, []);

	function toggleCollapsed() {
		setCollapsed((was) => {
			try {
				localStorage.setItem(COLLAPSED_KEY, String(!was));
			} catch {
				// private mode: the choice lasts for this visit
			}
			return !was;
		});
	}

	const needsSalon = !SALON_FREE.some((path) => pathname === path || pathname.startsWith(`${path}/`));

	return (
		<div className={`shell${collapsed ? ' is-collapsed' : ''}${drawer ? ' is-drawer' : ''}`}>
			<a href="#main" className="skip">
				{t('shell.skipToContent')}
			</a>

			<header className="mbar">
				<button type="button" className="mbar-btn" aria-label={t('shell.menuTitle')} aria-expanded={drawer} aria-controls="sidebar" onClick={() => setDrawer(true)}>
					<Menu aria-hidden />
				</button>
				<Link to="/" className="mbar-logo" aria-label={`BarberChat, ${t('nav.overview')}`}>
					<img src={logo} alt="" />
				</Link>
				<button type="button" className="mbar-btn" aria-label={t('shell.search')} onClick={() => setSearching(true)}>
					<Search aria-hidden />
				</button>
				<ShopSwitcher compact />
			</header>

			<div className="scrim" aria-hidden onClick={() => setDrawer(false)} />

			<aside id="sidebar" className="sidebar" aria-label={t('shell.navigation')}>
				<div className="sb-head">
					<div className="sb-brand">
						<Link to="/" className="sb-logo" aria-label={`BarberChat, ${t('nav.overview')}`}>
							<img src={logo} alt="" />
						</Link>
						<button type="button" className="sb-toggle" onClick={toggleCollapsed} aria-label={t('shell.toggleSidebar')} aria-expanded={!collapsed}>
							{collapsed ? <PanelLeftOpen aria-hidden /> : <PanelLeftClose aria-hidden />}
						</button>
					</div>
					<ShopSwitcher />
				</div>

				<nav className="sb-content">
					<button type="button" className="sb-link sb-search" title={t('shell.search')} onClick={() => setSearching(true)}>
						<Search aria-hidden />
						<span className="sb-label">{t('shell.search')}</span>
						<kbd className="sb-kbd" aria-hidden>
							Ctrl K
						</kbd>
					</button>
					<ul className="sb-list">
						{NAV_MAIN.map((item) => (
							<NavRow key={item.to} item={item} />
						))}
					</ul>
					<p className="sb-group">{t('nav.groupSalon')}</p>
					<ul className="sb-list">
						{NAV_SALON.map((item) => (
							<NavRow key={item.to} item={item} />
						))}
					</ul>
				</nav>

				<AccountMenu />
			</aside>

			<main id="main" className="page" tabIndex={-1}>
				{isPending ? (
					<Loading />
				) : error ? (
					<Failure error={error} onRetry={retry} />
				) : !shop && needsSalon ? (
					<Empty
						title={t('shell.noSalon')}
						action={
							<Link to="/salon/nouveau" className="btn btn--ink btn--md">
								{t('shop.createShop')}
							</Link>
						}
					>
						{t('salons.emptyDescription')}
					</Empty>
				) : (
					<Outlet />
				)}
			</main>

			<CommandPalette open={searching} onClose={() => setSearching(false)} />
			<ScrollRestoration />
		</div>
	);
}

function NavRow({ item }: { item: NavItem }) {
	const { pathname } = useLocation();
	const active = isActive(item, pathname);
	return (
		<li>
			<NavLink to={item.to} end={item.end} title={t(item.label)} aria-current={active ? 'page' : undefined} className={`sb-link${active ? ' is-active' : ''}`}>
				<item.icon aria-hidden />
				<span className="sb-label">{t(item.label)}</span>
			</NavLink>
		</li>
	);
}
