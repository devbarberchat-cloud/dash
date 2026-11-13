// The dashboard's languages. French is bundled (it also gives every key its
// type); English and Arabic are fetched when chosen. `t` reads the active
// dictionary, and changing language remounts the app so every string and
// every formatted number follows.
import { createContext, Fragment, useCallback, useContext, useState, type ReactNode } from 'react';
import fr from './locales/fr.json';

export const LOCALES = ['fr', 'en', 'ar'] as const;
export type Locale = (typeof LOCALES)[number];

/** Each language's name, written in that language. */
export const LOCALE_NAMES: Record<Locale, string> = { fr: 'Français', en: 'English', ar: 'العربية' };

type Messages = typeof fr;
type Leaf<T, P extends string = ''> = {
	[K in keyof T & string]: T[K] extends string ? `${P}${K}` : Leaf<T[K], `${P}${K}.`>;
}[keyof T & string];
export type MessageKey = Leaf<Messages>;
export type MessageValues = Record<string, string | number>;

const STORAGE_KEY = 'bc_locale';
const INTL: Record<Locale, string> = { fr: 'fr-FR', en: 'en-GB', ar: 'ar-MA' };

const loaders: Record<Locale, () => Promise<Messages>> = {
	fr: async () => fr,
	// a key missing in one language falls back to the key itself (see `t`)
	en: async () => (await import('./locales/en.json')).default as unknown as Messages,
	ar: async () => (await import('./locales/ar.json')).default as unknown as Messages
};

let active: Locale = 'fr';
let messages: Messages = fr;

export const isLocale = (value: unknown): value is Locale => typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
export const currentLocale = () => active;
/** The Intl tag for numbers and dates in the active language. */
export const intlLocale = () => INTL[active];
export const textDirection = (locale: Locale = active) => (locale === 'ar' ? 'rtl' : 'ltr');

function preferredLocale(): Locale {
	try {
		const saved = localStorage.getItem(STORAGE_KEY);
		if (isLocale(saved)) return saved;
	} catch {
		// private mode: fall through to the browser's languages
	}
	for (const tag of navigator.languages ?? []) {
		const base = tag.toLowerCase().split('-')[0];
		if (isLocale(base)) return base;
	}
	return 'fr';
}

async function activate(locale: Locale) {
	messages = await loaders[locale]();
	active = locale;
	document.documentElement.lang = locale;
	document.documentElement.dir = textDirection(locale);
}

/** Loads the language to start in. Await it before the first render. */
export const initLocale = () => activate(preferredLocale());

function lookup(key: string): string | undefined {
	let node: unknown = messages;
	for (const part of key.split('.')) {
		if (node === null || typeof node !== 'object') return undefined;
		node = (node as Record<string, unknown>)[part];
	}
	return typeof node === 'string' ? node : undefined;
}

/** The end of the `{...}` block that opens at `start`. */
function closing(text: string, start: number) {
	let depth = 0;
	for (let i = start; i < text.length; i++) {
		if (text[i] === '{') depth++;
		else if (text[i] === '}' && --depth === 0) return i;
	}
	return -1;
}

/** `=0 {none} one {# item} other {# items}` as a map. */
function branches(text: string) {
	const out: Record<string, string> = {};
	let i = 0;
	while (i < text.length) {
		const open = text.indexOf('{', i);
		if (open === -1) break;
		const close = closing(text, open);
		if (close === -1) break;
		out[text.slice(i, open).trim()] = text.slice(open + 1, close);
		i = close + 1;
	}
	return out;
}

// ICU messages, as far as the dictionaries use them: {name} and {count, plural, ...}.
function format(text: string, values: MessageValues): string {
	let out = '';
	let i = 0;
	while (i < text.length) {
		const open = text.indexOf('{', i);
		if (open === -1) return out + text.slice(i);
		const close = closing(text, open);
		if (close === -1) return out + text.slice(i);
		out += text.slice(i, open);
		const [name = '', kind, ...rest] = text.slice(open + 1, close).split(',');
		const value = values[name.trim()];
		if (!kind) out += value ?? '';
		else if (kind.trim() === 'plural') {
			const n = Number(value);
			const options = branches(rest.join(','));
			const branch = options[`=${n}`] ?? options[new Intl.PluralRules(INTL[active]).select(n)] ?? options.other ?? '';
			out += format(branch, values).replace(/#/g, new Intl.NumberFormat(INTL[active]).format(n));
		} else {
			const options = branches(rest.join(','));
			out += format(options[String(value)] ?? options.other ?? '', values);
		}
		i = close + 1;
	}
	return out;
}

/** The message for a key, in the active language. */
export function t(key: MessageKey, values?: MessageValues): string {
	const text = lookup(key);
	if (text === undefined) return key;
	return values || text.includes('{') ? format(text, values ?? {}) : text;
}

/** For keys built at run time (a status, a weekday): the message, or the fallback when there is none. */
export function tMaybe(key: string, fallback: string, values?: MessageValues): string {
	return lookup(key) === undefined ? fallback : t(key as MessageKey, values);
}

const LocaleContext = createContext<{ locale: Locale; setLocale: (next: Locale) => Promise<void> }>({
	locale: 'fr',
	setLocale: async () => {}
});

export const useLocale = () => useContext(LocaleContext);

export function LocaleProvider({ children }: { children: ReactNode }) {
	const [locale, setState] = useState<Locale>(active);
	const setLocale = useCallback(async (next: Locale) => {
		await activate(next);
		try {
			localStorage.setItem(STORAGE_KEY, next);
		} catch {
			// private mode: the choice lasts for this visit
		}
		setState(next);
	}, []);
	return (
		<LocaleContext.Provider value={{ locale, setLocale }}>
			<Fragment key={locale}>{children}</Fragment>
		</LocaleContext.Provider>
	);
}
