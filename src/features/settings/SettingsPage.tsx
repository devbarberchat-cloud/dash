import { useId } from 'react';
import { useNavigate } from 'react-router';
import { useSession, useSignOut } from '@/api/session';
import { t } from '@/i18n';
import { Button } from '@/ui/Button';
import { LanguageSelect } from '@/ui/LanguageSelect';
import { PageHeader } from '@/ui/PageHeader';
import { useToast } from '@/ui/Toast';
import './Settings.css';

export function SettingsPage() {
	const { data: session } = useSession();
	const signOut = useSignOut();
	const navigate = useNavigate();
	const toast = useToast();
	const languageId = useId();
	const email = session?.user?.email;

	return (
		<>
			<PageHeader title={t('settings.title')} />
			<div className="settings">
				<section className="settings-row">
					<div>
						<label htmlFor={languageId} className="settings-name">
							{t('settings.language')}
						</label>
						<p className="muted">{t('settings.languageDescription')}</p>
					</div>
					<LanguageSelect id={languageId} />
				</section>
				<section className="settings-row">
					<div>
						<h2 className="settings-name">{t('settings.account')}</h2>
						<p className="muted">{email ? t('settings.signedInAs', { email }) : t('settings.signedIn')}</p>
					</div>
					<Button
						variant="outline"
						size="sm"
						loading={signOut.isPending}
						onClick={() => signOut.mutate(undefined, { onSuccess: () => navigate('/connexion', { replace: true }), onError: () => toast(t('common.messages.signedOutError')) })}
					>
						{t('shell.signOut')}
					</Button>
				</section>
			</div>
		</>
	);
}
