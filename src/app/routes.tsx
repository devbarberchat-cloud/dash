import { createBrowserRouter, type RouteObject } from 'react-router';
import { AnalyticsPage } from '@/features/analytics/AnalyticsPage';
import { SignInPage } from '@/features/auth/SignInPage';
import { BarberPage } from '@/features/barbers/BarberPage';
import { BarbersPage } from '@/features/barbers/BarbersPage';
import { BookingsPage } from '@/features/bookings/BookingsPage';
import { HistoryPage } from '@/features/bookings/HistoryPage';
import { ClientPage } from '@/features/clients/ClientPage';
import { ClientsPage } from '@/features/clients/ClientsPage';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { PaymentsPage } from '@/features/payments/PaymentsPage';
import { PromosPage } from '@/features/promos/PromosPage';
import { ServiceListPage } from '@/features/services/ServiceListPage';
import { ServicesMenuPage } from '@/features/services/ServicesMenuPage';
import { NewSalonPage, SalonsPage } from '@/features/settings/SalonsPage';
import { SettingsPage } from '@/features/settings/SettingsPage';
import { ShopPage } from '@/features/shop/ShopPage';
import { AppShell } from './AppShell';
import { NotFound } from './NotFound';
import { RequireSession } from './RequireSession';
import { ShopProvider } from './shop-context';

const routes: RouteObject[] = [
	{ path: '/connexion', element: <SignInPage /> },
	{
		element: (
			<RequireSession>
				<ShopProvider>
					<AppShell />
				</ShopProvider>
			</RequireSession>
		),
		children: [
			{ index: true, element: <DashboardPage /> },
			{ path: 'reservations', element: <BookingsPage /> },
			{ path: 'historique', element: <HistoryPage /> },
			{ path: 'clients', element: <ClientsPage /> },
			{ path: 'clients/:clientId', element: <ClientPage /> },
			{ path: 'barbiers', element: <BarbersPage /> },
			{ path: 'barbiers/:barberId', element: <BarberPage /> },
			{ path: 'prestations', element: <ServicesMenuPage /> },
			{ path: 'prestations/categorie/:categoryId', element: <ServiceListPage /> },
			{ path: 'prestations/sans-categorie', element: <ServiceListPage /> },
			{ path: 'promotions', element: <PromosPage /> },
			{ path: 'paiements', element: <PaymentsPage /> },
			{ path: 'statistiques', element: <AnalyticsPage /> },
			{ path: 'salon', element: <ShopPage /> },
			{ path: 'salon/nouveau', element: <NewSalonPage /> },
			{ path: 'salons', element: <SalonsPage /> },
			{ path: 'parametres', element: <SettingsPage /> },
			{ path: '*', element: <NotFound /> }
		]
	}
];

export const router = createBrowserRouter(routes);
