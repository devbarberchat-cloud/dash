import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router';
import { Search } from 'lucide-react';
import { useSignOut } from '@/api/session';
import { LOCALES, LOCALE_NAMES, t, useLocale, type MessageKey } from '@/i18n';
import { NAV_ALL } from './nav';
import { useShopContext } from './shop-context';

interface Command {
	id: string;
	group: MessageKey;
	label: string;
	keywords?: string;
	run: () => void;
}

const plain = (text: string) =>
	text
		.normalize('NFD')
		.replace(/\p{M}/gu, '')
		.toLowerCase();

/** Ctrl+K: go to a page, change salon or language, sign out. */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
	const dialog = useRef<HTMLDialogElement>(null);
	const navigate = useNavigate();
	const { shops, shop, select } = useShopContext();
	const { locale, setLocale } = useLocale();
	const signOut = useSignOut();
	const [text, setText] = useState('');
	const [active, setActive] = useState(0);
	const listId = useId();

	useEffect(() => {
		const el = dialog.current;
		if (!el) return;
		if (open && !el.open) {
			setText('');
			setActive(0);
			el.showModal();
		}
		if (!open && el.open) el.close();
	}, [open]);

	const commands = useMemo<Command[]>(
		() => [
			...NAV_ALL.map((item) => ({ id: item.to, group: 'shell.commandPages' as const, label: t(item.label), keywords: item.keywords, run: () => navigate(item.to) })),
			{ id: '/salons', group: 'shell.commandPages', label: t('nav.salons'), run: () => navigate('/salons') },
			...shops
				.filter((other) => other.id !== shop?.id)
				.map((other) => ({ id: `salon-${other.id}`, group: 'shell.commandSalons' as const, label: other.name, run: () => select(other.id) })),
			...LOCALES.filter((code) => code !== locale).map((code) => ({
				id: `locale-${code}`,
				group: 'shell.commandPreferences' as const,
				label: LOCALE_NAMES[code],
				keywords: 'langue language لغة',
				run: () => void setLocale(code)
			})),
			{
				id: 'sign-out',
				group: 'shell.commandPreferences',
				label: t('shell.signOut'),
				keywords: 'logout déconnexion',
				run: () => signOut.mutate(undefined, { onSuccess: () => navigate('/connexion', { replace: true }) })
			}
		],
		[navigate, shops, shop?.id, select, locale, setLocale, signOut]
	);

	const term = plain(text.trim());
	const found = term ? commands.filter((command) => plain(`${command.label} ${command.keywords ?? ''}`).includes(term)) : commands;
	const current = found[Math.min(active, found.length - 1)];

	function run(command: Command) {
		onClose();
		command.run();
	}

	function onKey(event: KeyboardEvent) {
		if (event.key === 'ArrowDown') setActive((i) => Math.min(found.length - 1, i + 1));
		else if (event.key === 'ArrowUp') setActive((i) => Math.max(0, i - 1));
		else if (event.key === 'Enter' && current) run(current);
		else return;
		event.preventDefault();
	}

	const groups = [...new Set(found.map((command) => command.group))];

	return (
		<dialog ref={dialog} className="palette" aria-label={t('shell.commandTitle')} onClose={onClose} onClick={(event) => event.target === dialog.current && onClose()}>
			{open && (
				<div className="palette-panel">
					<label className="palette-search">
						<Search aria-hidden />
						<input
							type="text"
							role="combobox"
							aria-expanded="true"
							aria-controls={listId}
							aria-activedescendant={current ? `${listId}-${current.id}` : undefined}
							aria-label={t('shell.search')}
							placeholder={t('shell.searchPlaceholder')}
							autoComplete="off"
							spellCheck={false}
							value={text}
							onChange={(event) => {
								setText(event.target.value);
								setActive(0);
							}}
							onKeyDown={onKey}
						/>
					</label>
					<div className="palette-list" id={listId} role="listbox" aria-label={t('shell.commandTitle')}>
						{groups.map((group) => (
							<div key={group} role="group" aria-label={t(group)}>
								<p className="menu-label" aria-hidden>
									{t(group)}
								</p>
								{found
									.filter((command) => command.group === group)
									.map((command) => (
										<div
											key={command.id}
											id={`${listId}-${command.id}`}
											role="option"
											aria-selected={command === current}
											className="menu-item"
											onPointerMove={() => setActive(found.indexOf(command))}
											onClick={() => run(command)}
										>
											{command.label}
										</div>
									))}
							</div>
						))}
						{found.length === 0 && <p className="palette-empty">{t('shell.commandEmpty')}</p>}
					</div>
				</div>
			)}
		</dialog>
	);
}
