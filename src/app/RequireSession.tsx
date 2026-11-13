import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useSession } from '@/api/session';
import { Failure, Loading } from '@/ui/controls';

/** Lets signed-in users through; sends everyone else to sign in, then back here. */
export function RequireSession({ children }: { children: ReactNode }) {
	const { data: session, isPending, error, refetch } = useSession();
	const location = useLocation();

	if (isPending) return <Loading />;
	if (error) return <Failure error={error} onRetry={() => void refetch()} />;
	if (!session) {
		const here = location.pathname + location.search;
		return <Navigate to={here === '/' ? '/connexion' : `/connexion?retour=${encodeURIComponent(here)}`} replace />;
	}
	return children;
}
