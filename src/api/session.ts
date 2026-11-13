// Who is signed in. The tokens stay in httpOnly cookies on the server side;
// the browser only knows the profile shown in the account menu.
import { useMutation, useQuery } from '@tanstack/react-query';
import { ApiError, request, whenSessionEnds } from './http';
import { queryClient } from './query-client';

export interface SessionUser {
	email: string;
	firstName: string;
	lastName: string;
	username: string;
}

/** null once we know nobody is signed in. */
export type Session = { user: SessionUser | null } | null;

const sessionKey = ['session'] as const;

async function fetchSession(): Promise<Session> {
	try {
		return await request<{ user: SessionUser | null }>('/session');
	} catch (error) {
		if (error instanceof ApiError && error.status === 401) return null;
		throw error;
	}
}

// any request that comes back 401 ends the session on screen too
whenSessionEnds(() => queryClient.setQueryData<Session>(sessionKey, null));

export const useSession = () => useQuery({ queryKey: sessionKey, queryFn: fetchSession, staleTime: Infinity });

export function useSignIn() {
	return useMutation({
		mutationFn: (credentials: { email: string; password: string }) =>
			request<{ user: SessionUser | null }>('/session/login', { method: 'POST', body: credentials }),
		onSuccess: (session) => {
			queryClient.clear();
			queryClient.setQueryData<Session>(sessionKey, session);
		}
	});
}

export function useSignOut() {
	return useMutation({
		mutationFn: () => request<void>('/session/logout', { method: 'POST' }),
		onSuccess: () => {
			queryClient.clear();
			queryClient.setQueryData<Session>(sessionKey, null);
		}
	});
}

export const displayName = (user: SessionUser | null | undefined) =>
	user ? `${user.firstName} ${user.lastName}`.trim() || user.username || user.email : '';
