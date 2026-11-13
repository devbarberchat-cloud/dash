import { useState, type ReactNode } from 'react';
import { Lock, Plus } from 'lucide-react';
import { mediaUrl } from '@/api/http';
import { useToggleShopStatus, type ShopDetails, type StaffMember } from '@/api/shops';
import { useCurrentShop } from '@/app/shop-context';
import { hhmm, monthYearShort, toMinutes } from '@/lib/format';
import { neighborhoodCode, neighborhoodLabel, SHOP_TYPES } from '@/lib/neighborhoods';
import { Button } from '@/ui/Button';
import { Dialog } from '@/ui/Dialog';
import { Field, Input, Textarea } from '@/ui/Field';
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

/* informations */

/** What only BarberChat changes: shown as it is, with the way to ask for a change. */
const LOCKED = 'Pour modifier ces informations, contactez l’équipe BarberChat.';

function Locked({ rows }: { rows: [string, ReactNode][] }) {
	return (
		<>
			<dl className='pairs locked'>
				{rows.map(([name, value]) => (
					<div key={name}>
						<dt>{name}</dt>
						<dd>{value || <span className='muted'>—</span>}</dd>
					</div>
				))}
			</dl>
			<p className='locked-note'>
				<Lock aria-hidden />
				{LOCKED}
			</p>
		</>
	);
}

export function ProfileSection({ id, form, shop }: { id: string; form: Form; shop: ShopDetails }) {
	const left = DESCRIPTION_MAX - form.draft.description.length;
	return (
		<Section id={id} title='Informations' text='Ce que les clients voient sur la page du salon, dans l’app'>
			<div className='sgrid'>
				<div className='span-2' data-field='description'>
					<Field
						label='Présentation'
						error={form.errors.description}
						hint={left >= 0 ? `${form.draft.description.length} / ${DESCRIPTION_MAX}` : `${-left} caractères de trop`}
					>
						{({ id, describedBy, invalid }) => (
							<Textarea
								id={id}
								value={form.draft.description}
								placeholder='Ce qui fait votre salon, en deux ou trois phrases.'
								onChange={(e) => form.set('description', e.target.value)}
								aria-describedby={describedBy}
								aria-invalid={invalid}
							/>
						)}
					</Field>
				</div>
			</div>
			<Locked
				rows={[
					['Nom du salon', shop.name],
					['Gamme de prix', SHOP_TYPES.find((type) => type.value === form.draft.shop_type)?.label ?? form.draft.shop_type],
					['E-mail', shop.email]
				]}
			/>
		</Section>
	);
}

/* adresse */

export function AddressSection({ id, shop }: { id: string; shop: ShopDetails }) {
	const maps = shop.google_maps_url || (shop.latitude && shop.longitude ? `https://www.google.com/maps/search/?api=1&query=${shop.latitude},${shop.longitude}` : null);
	return (
		<Section
			id={id}
			title='Adresse'
			text='Pour l’itinéraire et la recherche par quartier'
			action={
				maps && (
					<a href={maps} target='_blank' rel='noreferrer' className='text-btn'>
						Voir sur la carte
					</a>
				)
			}
		>
			<Locked
				rows={[
					['Rue et numéro', shop.address],
					['Quartier', neighborhoodLabel(neighborhoodCode(shop.neighborhood)) || shop.neighborhood],
					['Code postal', shop.postal_code],
					['Ville', shop.city]
				]}
			/>
		</Section>
	);
}

/* horaires */

const DAY = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

export function HoursSection({ id, form }: { id: string; form: Form }) {
	const today = (new Date().getDay() + 6) % 7;
	const open = form.days.filter((d) => !d.is_closed);
	const total = open.reduce((s, d) => s + Math.max(0, toMinutes(d.closing_time) - toMinutes(d.opening_time)), 0) / 60;
	return (
		<Section id={id} title='Horaires' text={`${open.length} jours sur 7, ${String(Number(total.toFixed(1))).replace('.', ',')} h par semaine`}>
			<Locked
				rows={form.days.map((d) => [
					d.weekday === today ? `${DAY[d.weekday]} (aujourd’hui)` : (DAY[d.weekday] ?? ''),
					d.is_closed ? 'Fermé' : <span className='num'>{hhmm(d.opening_time)} – {hhmm(d.closing_time)}</span>
				])}
			/>
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
