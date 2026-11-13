import { mediaUrl } from '@/api/http';
import { useAgenda, useShop, useStaff, type ShopDetails } from '@/api/shops';
import { useCurrentShop } from '@/app/shop-context';
import { int, score } from '@/lib/format';
import { Button } from '@/ui/Button';
import { Failure } from '@/ui/controls';
import { PageHeader } from '@/ui/PageHeader';
import { useToast } from '@/ui/Toast';
import { AddressSection, HoursSection, ProfileSection, StatusSection, TeamSection } from './sections';
import { useShopForm } from './useShopForm';
import './Shop.css';

export function ShopPage() {
	const current = useCurrentShop();
	const shop = useShop(current.id);
	const agenda = useAgenda(current.id);
	const staff = useStaff(current.id);
	const form = useShopForm(shop.data, agenda.data);
	const toast = useToast();

	const failed = shop.error ?? agenda.error;
	if (failed) {
		return (
			<Failure
				error={failed}
				onRetry={() => {
					void shop.refetch();
					void agenda.refetch();
				}}
			/>
		);
	}
	if (!shop.data || !form.draft || !form.days) return <div className="shop-wait" aria-busy="true" aria-label="Chargement du salon" />;
	const f = { ...form, draft: form.draft, days: form.days };
	const s = shop.data;

	const onSave = async () => {
		try {
			const bad = await form.save();
			if (bad) {
				const el = document.querySelector<HTMLElement>(bad.startsWith('day') ? '#horaires' : `[data-field="${bad}"] .control`);
				el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
				if (el?.classList.contains('control')) el.focus({ preventScroll: true });
				return;
			}
			toast('Salon enregistré');
		} catch {
			/* the save bar says it failed */
		}
	};

	return (
		<>
			<PageHeader kicker="Votre salon" title={s.name} place={[s.address, s.neighborhood, s.city].filter(Boolean).join(', ')} />

			<Cover shop={s} />

			<ul className="facts shop-facts" aria-label="Le salon en bref">
				<li className={`fact ${s.status === 'inactive' ? '' : 'fact--good'}`}>
					<span className="dot" style={{ background: s.status === 'inactive' ? 'var(--faint)' : 'var(--st-done)' }} aria-hidden />
					{s.status === 'inactive' ? 'Désactivé' : 'Visible dans l’app'}
				</li>
				<li className="fact">
					Note <b className="num">{score(Number(s.rating))}</b> / 5
					{s.total_reviews > 0 && <span className="muted num">· {int(s.total_reviews)} avis</span>}
				</li>
				<li className="fact">
					<b className="num">{s.barber_count}</b> barbiers
				</li>
				<li className="fact">
					<b className="num">{int(s.total_appointments)}</b> réservations au total
				</li>
			</ul>

			<div className="shop-body">
				<ProfileSection id="infos" form={f} shop={s} />
				<AddressSection id="adresse" shop={s} />
				<HoursSection id="horaires" form={f} />
				<TeamSection id="equipe" staff={staff.data} loading={staff.isPending} />
				<StatusSection id="statut" shop={s} />
			</div>

			<SaveBar show={form.dirty} saving={form.saving} failed={form.failed} errorCount={Object.keys(form.errors).length} onCancel={form.reset} onSave={onSave} />
		</>
	);
}

/** The salon page's cover, still, its corners as the site's. */
function Cover({ shop }: { shop: ShopDetails }) {
	const coverUrl = mediaUrl(shop.cover_image);
	return (
		<div className="cover">
			{coverUrl ? <img src={coverUrl} alt={`Photo de ${shop.name}`} /> : <span className="cover-empty">Pas encore de photo</span>}
		</div>
	);
}

function SaveBar({ show, saving, failed, errorCount, onCancel, onSave }: { show: boolean; saving: boolean; failed: boolean; errorCount: number; onCancel: () => void; onSave: () => void }) {
	if (!show) return null;
	const text = errorCount ? `${errorCount} champ${errorCount > 1 ? 's' : ''} à corriger` : failed ? 'L’enregistrement n’a pas abouti' : 'Modifications non enregistrées';
	return (
		<div className="savebar" role="region" aria-label="Enregistrer les modifications">
			<p className="savebar-text" role={errorCount || failed ? 'alert' : undefined}>
				{text}
			</p>
			<button type="button" className="savebar-cancel" onClick={onCancel} disabled={saving}>
				Annuler
			</button>
			<Button variant="white" size="sm" loading={saving} onClick={onSave}>
				Enregistrer
			</Button>
		</div>
	);
}
