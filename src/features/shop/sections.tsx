import { useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { Plus } from 'lucide-react';
import { mediaUrl } from '@/api/http';
import { useToggleShopStatus, type ShopDetails, type StaffMember } from '@/api/shops';
import { useCurrentShop } from '@/app/shop-context';
import { hhmm, monthYearShort, toMinutes } from '@/lib/format';
import { NEIGHBORHOODS, SHOP_TYPES } from '@/lib/neighborhoods';
import { Button } from '@/ui/Button';
import { ChipGroup, Switch } from '@/ui/controls';
import { Dialog } from '@/ui/Dialog';
import { Field, Input, Select, Textarea } from '@/ui/Field';
import { Portrait } from '@/ui/Portrait';
import { useToast } from '@/ui/Toast';
import { AddBarberDialog } from '../barbers/AddBarberDialog';
import { RemoveBarberDialog } from '../barbers/BarberSheet';
import { DESCRIPTION_MAX, type Draft, type useShopForm } from './useShopForm';

export type Form = Omit<ReturnType<typeof useShopForm>, 'draft' | 'days'> & { draft: Draft; days: NonNullable<ReturnType<typeof useShopForm>['days']> };

function Section({ id, title, text, action, children }: { id: string; title: string; text?: ReactNode; action?: ReactNode; children: ReactNode }) {
	return (
		<section id={id} className="ssec" aria-labelledby={`${id}-t`}>
			<div className="sec-head">
				<h2 id={`${id}-t`}>{title}</h2>
				{(text || action) && (
					<p>
						{text}
						{text && action && ' · '}
						{action}
					</p>
				)}
			</div>
			{children}
		</section>
	);
}

/** A text field bound to the draft, with its error. */
function TextField({ form, k, label, hint, ...rest }: { form: Form; k: keyof Draft; label: string; hint?: string } & Omit<InputHTMLAttributes<HTMLInputElement>, 'form'>) {
	return (
		<div data-field={k}>
			<Field label={label} hint={hint} error={form.errors[k]}>
				{({ id, describedBy, invalid }) => (
					<Input id={id} value={String(form.draft[k] ?? '')} onChange={(e) => form.set(k, e.target.value as never)} aria-describedby={describedBy} aria-invalid={invalid} {...rest} />
				)}
			</Field>
		</div>
	);
}

/* informations */

export function ProfileSection({ id, form }: { id: string; form: Form }) {
	const left = DESCRIPTION_MAX - form.draft.description.length;
	return (
		<Section id={id} title="Informations" text="Ce que les clients voient sur la page du salon, dans l’app">
			<div className="sgrid">
				<div className="span-2">
					<TextField form={form} k="name" label="Nom du salon" autoComplete="organization" />
				</div>
				<div className="span-2" data-field="description">
					<Field
						label="Présentation"
						error={form.errors.description}
						hint={left >= 0 ? `${form.draft.description.length} / ${DESCRIPTION_MAX}` : `${-left} caractères de trop`}
					>
						{({ id, describedBy, invalid }) => (
							<Textarea
								id={id}
								value={form.draft.description}
								placeholder="Ce qui fait votre salon, en deux ou trois phrases."
								onChange={(e) => form.set('description', e.target.value)}
								aria-describedby={describedBy}
								aria-invalid={invalid}
							/>
						)}
					</Field>
				</div>
				<div className="span-2 field">
					<span className="field-label" id="range-l">
						Gamme de prix
					</span>
					<ChipGroup label="Gamme de prix" options={SHOP_TYPES} value={form.draft.shop_type} onChange={(v) => form.set('shop_type', v)} />
				</div>
				<TextField form={form} k="phone" label="Téléphone" inputMode="tel" autoComplete="tel" placeholder="+212 6 12 34 56 78" />
				<TextField form={form} k="email" label="E-mail" type="email" autoComplete="email" placeholder="contact@monsalon.ma" />
			</div>
		</Section>
	);
}

/* adresse */

export function AddressSection({ id, form }: { id: string; form: Form }) {
	const { latitude: lat, longitude: lng, google_maps_url: url } = form.draft;
	const maps = url && !form.allErrors.google_maps_url ? url : lat && lng ? `https://www.google.com/maps/search/?api=1&query=${lat},${lng}` : null;
	return (
		<Section
			id={id}
			title="Adresse"
			text="Pour l’itinéraire et la recherche par quartier"
			action={
				maps && (
					<a href={maps} target="_blank" rel="noreferrer" className="text-btn">
						Voir sur la carte
					</a>
				)
			}
		>
			<div className="sgrid">
				<div className="span-2">
					<TextField form={form} k="address" label="Rue et numéro" autoComplete="street-address" />
				</div>
				<div data-field="neighborhood">
					<Field label="Quartier">
						{({ id }) => (
							<Select id={id} value={form.draft.neighborhood} onChange={(e) => form.set('neighborhood', e.target.value)}>
								{NEIGHBORHOODS.map(([k, l]) => (
									<option key={k} value={k}>
										{l}
									</option>
								))}
							</Select>
						)}
					</Field>
				</div>
				<TextField form={form} k="postal_code" label="Code postal" inputMode="numeric" autoComplete="postal-code" />
				<div className="span-2">
					<TextField form={form} k="city" label="Ville" autoComplete="address-level2" />
				</div>
				<div className="span-2">
					<TextField form={form} k="google_maps_url" label="Lien Google Maps" placeholder="https://maps.google.com/…" hint="Facultatif" />
				</div>
				<TextField form={form} k="latitude" label="Latitude" inputMode="decimal" />
				<TextField form={form} k="longitude" label="Longitude" inputMode="decimal" />
			</div>
		</Section>
	);
}

/* horaires */

const DAY = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
// on the quarter hour, 24-hour times, the same on every phone and browser
const QUARTERS = Array.from({ length: 4 * 18 }, (_, i) => 6 * 60 + i * 15).map((m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);

function TimeSelect({ label, value, invalid, describedBy, onChange }: { label: string; value: string; invalid: boolean; describedBy?: string; onChange: (v: string) => void }) {
	const v = hhmm(value);
	const options = QUARTERS.includes(v) ? QUARTERS : [v, ...QUARTERS];
	return (
		<Select aria-label={label} value={v} aria-invalid={invalid} aria-describedby={describedBy} onChange={(e) => onChange(`${e.target.value}:00`)} className="num">
			{options.map((t) => (
				<option key={t} value={t}>
					{t}
				</option>
			))}
		</Select>
	);
}

export function HoursSection({ id, form }: { id: string; form: Form }) {
	const toast = useToast();
	const today = (new Date().getDay() + 6) % 7;
	const open = form.days.filter((d) => !d.is_closed);
	const total = open.reduce((s, d) => s + Math.max(0, toMinutes(d.closing_time) - toMinutes(d.opening_time)), 0) / 60;
	const copyMonday = () => {
		const mon = form.days.find((d) => d.weekday === 0);
		if (!mon) return;
		form.setDays((ds) => ds && ds.map((d) => (d.weekday >= 1 && d.weekday <= 5 ? { ...d, opening_time: mon.opening_time, closing_time: mon.closing_time, is_closed: mon.is_closed } : d)));
		toast('Horaires du lundi copiés du mardi au samedi');
	};
	return (
		<Section
			id={id}
			title="Horaires"
			text={`${open.length} jours sur 7, ${String(Number(total.toFixed(1))).replace('.', ',')} h par semaine`}
			action={
				<button type="button" className="text-btn" onClick={copyMonday}>
					Copier le lundi sur la semaine
				</button>
			}
		>
			<ul className="list hours">
				{form.days.map((d) => {
					const err = form.errors[`day${d.weekday}`];
					return (
						<li key={d.weekday} className={d.is_closed ? 'is-closed' : ''}>
							<label className="hours-day" htmlFor={`day-${d.weekday}`}>
								{DAY[d.weekday]}
								{d.weekday === today && <small>aujourd’hui</small>}
							</label>
							<div className="hours-times">
								{d.is_closed ? (
									<span className="muted">Fermé</span>
								) : (
									<>
										<TimeSelect label={`${DAY[d.weekday]}, ouverture`} value={d.opening_time} invalid={Boolean(err)} describedBy={err ? `err-day-${d.weekday}` : undefined} onChange={(v) => form.setDay(d.weekday, { opening_time: v })} />
										<span aria-hidden>–</span>
										<TimeSelect label={`${DAY[d.weekday]}, fermeture`} value={d.closing_time} invalid={Boolean(err)} describedBy={err ? `err-day-${d.weekday}` : undefined} onChange={(v) => form.setDay(d.weekday, { closing_time: v })} />
									</>
								)}
							</div>
							<Switch id={`day-${d.weekday}`} checked={!d.is_closed} onChange={(v) => form.setDay(d.weekday, { is_closed: !v })} label={`Ouvert le ${DAY[d.weekday]?.toLowerCase()}`} />
							{err && (
								<p id={`err-day-${d.weekday}`} className="field-error hours-err" role="alert">
									{err}
								</p>
							)}
						</li>
					);
				})}
			</ul>
		</Section>
	);
}

/* équipe */

export function TeamSection({ id, staff, loading }: { id: string; staff?: StaffMember[]; loading: boolean }) {
	const shop = useCurrentShop();
	const [adding, setAdding] = useState(false);
	const [removing, setRemoving] = useState<StaffMember | null>(null);
	const barbers = (staff ?? []).filter((p) => p.staff_type === 'barber');
	const nameOf = (p: StaffMember) => `${p.user.first_name} ${p.user.last_name}`.trim() || p.user.username;
	return (
		<Section id={id} title="Équipe" text={loading ? undefined : `${barbers.length} barbiers`}>
			<ul className="crew">
				{barbers.map((p) => (
					<li key={p.user.id} className="crew-item">
						<Portrait name={nameOf(p)} src={mediaUrl(p.user.profile_picture)} size={88} />
						<b>{nameOf(p)}</b>
						<span>depuis {monthYearShort(p.hired_at)}</span>
						<button type="button" className="crew-remove" onClick={() => setRemoving(p)} aria-label={`Retirer ${nameOf(p)} du salon`}>
							Retirer
						</button>
					</li>
				))}
				<li className="crew-item">
					<button type="button" className="crew-add" onClick={() => setAdding(true)}>
						<Plus aria-hidden />
						<span className="sr-only">Ajouter un barbier</span>
					</button>
					<b aria-hidden>Ajouter</b>
				</li>
			</ul>
			<AddBarberDialog open={adding} onClose={() => setAdding(false)} />
			{removing && (
				<RemoveBarberDialog
					open
					barber={{ id: removing.user.id, name: nameOf(removing) }}
					shopName={shop.name}
					onDone={() => setRemoving(null)}
					onCancel={() => setRemoving(null)}
				/>
			)}
		</Section>
	);
}

/* statut */

export function StatusSection({ id, shop }: { id: string; shop: ShopDetails }) {
	const [open, setOpen] = useState(false);
	const [typed, setTyped] = useState('');
	const setActive = useToggleShopStatus(shop.id);
	const toast = useToast();
	const close = () => {
		setOpen(false);
		setTyped('');
	};

	if (shop.status === 'inactive') {
		return (
			<Section id={id} title="Salon désactivé" text="Il n’apparaît plus dans l’app">
				<p className="muted">Le service client BarberChat vous contacte pour finaliser. Pour remettre le salon en ligne, dites-le-lui à ce moment-là.</p>
			</Section>
		);
	}

	return (
		<Section id={id} title="Désactiver le salon">
			<p className="muted danger-text">
				Le salon n’apparaîtra plus dans l’app et ne recevra plus de nouvelles réservations. Les réservations déjà prises peuvent être touchées. Le service client
				BarberChat vous contacte ensuite pour finaliser.
			</p>
			<Button variant="outline" className="danger-btn" onClick={() => setOpen(true)}>
				Désactiver le salon
			</Button>
			<Dialog
				open={open}
				onClose={close}
				title={`Désactiver ${shop.name} ?`}
				description="Il n’apparaîtra plus dans l’app et ne recevra plus de nouvelles réservations."
				footer={
					<>
						<Button variant="outline" onClick={close}>
							Garder le salon actif
						</Button>
						<Button
							variant="danger"
							disabled={typed.trim() !== shop.name}
							loading={setActive.isPending}
							onClick={() =>
								setActive.mutate(undefined, {
									onSuccess: () => {
										close();
										toast(`${shop.name} est désactivé`);
									}
								})
							}
						>
							Désactiver
						</Button>
					</>
				}
			>
				<Field
					label={
						<>
							Pour confirmer, tapez <b>{shop.name}</b>
						</>
					}
					error={setActive.isError ? 'La désactivation n’a pas abouti. Réessayez dans un instant.' : null}
				>
					{({ id }) => <Input id={id} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />}
				</Field>
			</Dialog>
		</Section>
	);
}
