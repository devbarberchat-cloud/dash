import { LOCALES, LOCALE_NAMES, isLocale, t, useLocale } from '@/i18n';
import { Select } from './Field';

/** The interface language, each one named in its own language. */
export function LanguageSelect({ id }: { id?: string }) {
	const { locale, setLocale } = useLocale();
	return (
		<Select
			id={id}
			className="control--sm"
			aria-label={id ? undefined : t('shell.language')}
			value={locale}
			onChange={(e) => {
				if (isLocale(e.target.value)) void setLocale(e.target.value);
			}}
		>
			{LOCALES.map((code) => (
				<option key={code} value={code} lang={code}>
					{LOCALE_NAMES[code]}
				</option>
			))}
		</Select>
	);
}
