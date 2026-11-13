import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router';
import { Eye, EyeOff } from 'lucide-react';
import { ApiError } from '@/api/http';
import { useSession, useSignIn } from '@/api/session';
import logo from '@/design/logo-black.svg';
import { t, type MessageKey } from '@/i18n';
import { Button } from '@/ui/Button';
import { Dialog } from '@/ui/Dialog';
import { Field, Input } from '@/ui/Field';
import { LanguageSelect } from '@/ui/LanguageSelect';
import './SignIn.css';

/** Where to go after signing in: a page of the app, never another site. */
function safeReturn(target: string | null) {
	if (!target || !target.startsWith('/') || target.startsWith('//') || target.startsWith('/\\')) return '/';
	return target.startsWith('/connexion') ? '/' : target;
}

function failure(error: unknown): MessageKey {
	if (error instanceof ApiError) {
		if (error.code === 'wrong_credentials') return 'serverErrors.auth.wrongCredentials';
		if (error.code === 'not_authorized') return 'serverErrors.auth.notAuthorized';
		if (error.status === 503) return 'serverErrors.unreachable';
		return 'serverErrors.server';
	}
	return 'serverErrors.unreachable';
}

export function SignInPage() {
	const [params] = useSearchParams();
	const back = safeReturn(params.get('retour'));
	const navigate = useNavigate();
	const { data: session } = useSession();
	const signIn = useSignIn();

	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [shown, setShown] = useState(false);
	const [checked, setChecked] = useState(false);
	const [forgot, setForgot] = useState(false);

	if (session) return <Navigate to={back} replace />;

	const emailError = checked && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? t('auth.errors.email') : null;
	const passwordError = checked && !password ? t('auth.errors.password') : null;

	function submit(event: FormEvent) {
		event.preventDefault();
		setChecked(true);
		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || !password) return;
		signIn.mutate({ email: email.trim(), password }, { onSuccess: () => navigate(back, { replace: true }) });
	}

	return (
		<main className="signin">
			<div className="signin-box">
				<img src={logo} alt="BarberChat" className="signin-logo" />
				<h1>{t('auth.login.title')}</h1>
				<p className="signin-lead">{t('auth.login.description')}</p>

				<form onSubmit={submit} noValidate>
					{signIn.isError && (
						<p className="notice notice--bad" role="alert">
							{t(failure(signIn.error))}
						</p>
					)}
					<Field label={t('auth.login.emailLabel')} error={emailError}>
						{({ id, describedBy, invalid }) => (
							<Input
								id={id}
								type="email"
								name="email"
								autoComplete="username"
								inputMode="email"
								spellCheck={false}
								required
								value={email}
								onChange={(e) => setEmail(e.target.value)}
								aria-describedby={describedBy}
								aria-invalid={invalid}
							/>
						)}
					</Field>
					<Field label={t('auth.login.passwordLabel')} error={passwordError}>
						{({ id, describedBy, invalid }) => (
							<span className="signin-password">
								<Input
									id={id}
									type={shown ? 'text' : 'password'}
									name="password"
									autoComplete="current-password"
									required
									value={password}
									onChange={(e) => setPassword(e.target.value)}
									aria-describedby={describedBy}
									aria-invalid={invalid}
								/>
								<button type="button" aria-pressed={shown} aria-label={t(shown ? 'auth.login.hidePassword' : 'auth.login.showPassword')} onClick={() => setShown((v) => !v)}>
									{shown ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
								</button>
							</span>
						)}
					</Field>
					<Button type="submit" dot={false} loading={signIn.isPending}>
						{t(signIn.isPending ? 'auth.login.signingIn' : 'auth.login.loginButton')}
					</Button>
				</form>

				<div className="signin-foot">
					<button type="button" className="text-btn" onClick={() => setForgot(true)}>
						{t('auth.login.forgotPassword')}
					</button>
					<LanguageSelect />
				</div>
			</div>

			<Dialog
				open={forgot}
				onClose={() => setForgot(false)}
				title={t('auth.login.forgotPassword')}
				description={t('auth.login.forgotPasswordDialogDescription')}
				footer={
					<Button variant="outline" onClick={() => setForgot(false)}>
						{t('common.buttons.close')}
					</Button>
				}
			/>
		</main>
	);
}
