import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './http';

export const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			refetchOnWindowFocus: false,
			// a 4xx is an answer, not a failure to reach the server: asking again changes nothing
			retry: (failures, error) => failures < 1 && !(error instanceof ApiError && error.status < 500)
		}
	}
});
