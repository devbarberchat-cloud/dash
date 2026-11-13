import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router';
import './design/tokens.css';
import './design/base.css';
import './ui/Button.css';
import './ui/lists.css';
import { queryClient } from './api/query-client';
import { router } from './app/routes';
import { LocaleProvider, initLocale } from './i18n';
import { ToastProvider } from './ui/Toast';

// the language is known before anything is drawn: no flash of another one
void initLocale().then(() => {
	createRoot(document.getElementById('root')!).render(
		<StrictMode>
			<QueryClientProvider client={queryClient}>
				<LocaleProvider>
					<ToastProvider>
						<RouterProvider router={router} />
					</ToastProvider>
				</LocaleProvider>
			</QueryClientProvider>
		</StrictMode>
	);
});
