import { useCallback, useId, useState } from 'react';
import { useNavigate } from 'react-router';
import { ChevronsUpDown, LogOut } from 'lucide-react';
import { displayName, useSession, useSignOut } from '@/api/session';
import { LOCALES, LOCALE_NAMES, t, useLocale } from '@/i18n';
import { initials } from '@/lib/format';
import { useToast } from '@/ui/Toast';
import { useDismiss } from '@/ui/useDismiss';

/** Who is signed in, with the language and the way out. */
export function AccountMenu() {
	const { data: session } = useSession();
	const { locale, setLocale } = useLocale();
	const signOut = useSignOut();
	const navigate = useNavigate();
	const toast = useToast();
	const [open, setOpen] = useState(false);
	const close = useCallback(() => setOpen(false), []);
	const ref = useDismiss<HTMLDivElement>(open, close);
	const menuId = useId();

	const user = session?.user ?? null;
	const name = displayName(user) || t('shell.account');

	return (
		<div className="account" ref={ref}>
			<button type="button" className="account-btn" aria-expanded={open} aria-controls={menuId} aria-label={t('shell.account')} onClick={() => setOpen((shown) => !shown)}>
				<span className="account-mark" aria-hidden>
					{initials(name)}
				</span>
				<span className="account-name">
					<b>{name}</b>
					{user?.email && <span>{user.email}</span>}
				</span>
				<ChevronsUpDown aria-hidden className="shop-chev" />
			</button>
			{open && (
				<div className="menu account-menu" id={menuId}>
					<p className="menu-label">{t('shell.language')}</p>
					{LOCALES.map((code) => (
						<button
							key={code}
							type="button"
							className="menu-item"
							lang={code}
							aria-current={code === locale ? 'true' : undefined}
							onClick={() => {
								close();
								if (code !== locale) void setLocale(code);
							}}
						>
							{LOCALE_NAMES[code]}
							{code === locale && <span className="menu-dot" aria-hidden />}
						</button>
					))}
					<div className="menu-foot">
						<button
							type="button"
							className="menu-item"
							disabled={signOut.isPending}
							onClick={() =>
								signOut.mutate(undefined, {
									onSuccess: () => navigate('/connexion', { replace: true }),
									onError: () => toast(t('common.messages.signedOutError'))
								})
							}
						>
							<LogOut aria-hidden />
							{t(signOut.isPending ? 'shell.signingOut' : 'shell.signOut')}
						</button>
					</div>
				</div>
			)}
		</div>
	);
}
