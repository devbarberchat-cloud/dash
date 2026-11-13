import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { ArrowLeft, ArrowRight, Search, X } from 'lucide-react';
import { useBarbers, type Barber } from '@/api/barbers';
import { mediaUrl } from '@/api/http';
import { useStaff } from '@/api/shops';
import { useCurrentShop } from '@/app/shop-context';
import { mad, minutes, pct, score } from '@/lib/format';
import { Button, IconButton } from '@/ui/Button';
import { ChipGroup, Empty, Failure } from '@/ui/controls';
import { Select } from '@/ui/Field';
import { PageHeader } from '@/ui/PageHeader';
import { Portrait } from '@/ui/Portrait';
import { AddBarberDialog } from './AddBarberDialog';
import { BarberSheet } from './BarberSheet';
import { health, needsAttention } from './health';
import './Barbers.css';

type Filter = 'all' | 'attention';
type Sort = 'revenue' | 'bookings' | 'score';

const SORTS: Record<Sort, { label: string; key: (b: Barber) => number }> = {
	revenue: { label: 'Chiffre d’affaires', key: (b) => Number(b.total_revenue ?? 0) },
	bookings: { label: 'Réservations', key: (b) => b.total_bookings },
	score: { label: 'Score', key: (b) => b.barber_score }
};

/** The name the app shows: the staff first name when there is one, else the username. */
export function useBarberNames() {
	const shop = useCurrentShop();
	const { data: staff = [] } = useStaff(shop.id);
	return useMemo(() => {
		const names = new Map(staff.map((s) => [s.user.id, s.user.first_name || s.user.username]));
		return (b: Barber) => names.get(b.id) ?? b.username;
	}, [staff]);
}

export function BarbersPage() {
	const shop = useCurrentShop();
	const [params, setParams] = useSearchParams();
	const [text, setText] = useState('');
	const [search, setSearch] = useState('');
	const [page, setPage] = useState(1);
	const [filter, setFilter] = useState<Filter>('all');
	const [sort, setSort] = useState<Sort>('revenue');
	const [adding, setAdding] = useState(false);
	const nameOf = useBarberNames();

	useEffect(() => {
		const t = setTimeout(() => {
			setSearch(text.trim());
			setPage(1);
		}, 300);
		return () => clearTimeout(t);
	}, [text]);

	const { data, isPending, isFetching, error, refetch } = useBarbers(shop.id, { search, page, page_size: 20 });
	const all = data?.results ?? [];
	const watch = all.filter(needsAttention).length;
	const rows = useMemo(
		() => all.filter((b) => filter === 'all' || needsAttention(b)).sort((a, b) => SORTS[sort].key(b) - SORTS[sort].key(a)),
		[all, filter, sort]
	);

	const openId = Number(params.get('barbier')) || null;
	const open = all.find((b) => b.id === openId) ?? null;
	const setOpen = (id: number | null) =>
		setParams(
			(p) => {
				if (id) p.set('barbier', String(id));
				else p.delete('barbier');
				return p;
			},
			{ replace: true }
		);

	return (
		<>
			<PageHeader kicker={shop.name} title="Coiffeurs" actions={<Button onClick={() => setAdding(true)}>Ajouter un barbier</Button>} />

			<div className="toolbar">
				<label className="search">
					<Search aria-hidden />
					<span className="sr-only">Chercher un barbier</span>
					<input type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder="Chercher un barbier" />
					{text && (
						<IconButton label="Effacer la recherche" onClick={() => setText('')} className="search-clear">
							<X />
						</IconButton>
					)}
				</label>
				<ChipGroup
					label="Filtrer"
					value={filter}
					onChange={setFilter}
					options={[
						{ value: 'all', label: 'Tous', count: all.length },
						{ value: 'attention', label: 'À surveiller', count: watch }
					]}
				/>
				<label className="sort">
					<span>Trier par</span>
					<Select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
						{Object.entries(SORTS).map(([k, s]) => (
							<option key={k} value={k}>
								{s.label}
							</option>
						))}
					</Select>
				</label>
			</div>

			<div className={`team${isFetching && !isPending ? ' is-refreshing' : ''}`} aria-busy={isFetching}>
				{error && !data ? (
					<Failure error={error} onRetry={() => void refetch()} />
				) : isPending ? (
					<div className="team-wait" />
				) : rows.length === 0 ? (
					<Empty
						title={search ? `Aucun barbier ne s’appelle « ${search} »` : 'Personne à surveiller'}
						action={
							<Button
								variant="outline"
								onClick={() => {
									setText('');
									setFilter('all');
								}}
							>
								Voir toute l’équipe
							</Button>
						}
					>
						{search ? 'Vérifiez l’orthographe du nom.' : 'Aucun barbier ne dépasse les seuils d’annulations ou d’absences.'}
					</Empty>
				) : (
					<>
						<ul className="tiles" aria-label="L’équipe">
							{rows.map((b) => {
								const h = health(b);
								return (
									<li key={b.id}>
										<button type="button" className="tile" onClick={() => setOpen(b.id)}>
											<Portrait name={nameOf(b)} src={mediaUrl(b.profile_picture)} className="tile-photo" />
											<span className="tile-name">{nameOf(b)}</span>
											<span className="tile-line num">
												{b.total_bookings ? `${b.total_bookings} réservations · ${mad(b.total_revenue)}` : 'Pas encore de réservation'}
											</span>
											{needsAttention(b) && <span className={`tile-alert tile-alert--${h.tone}`}>{h.label}</span>}
										</button>
									</li>
								);
							})}
						</ul>

						<section aria-labelledby="all-t">
							<div className="sec-head">
								<h2 id="all-t">Tous les chiffres</h2>
								<p>Depuis l’arrivée de chaque barbier au salon</p>
							</div>
							<div className="table-scroll">
								<table className="btable">
									<thead>
										<tr>
											<th scope="col">Barbier</th>
											<th scope="col" className="r">Réservations</th>
											<th scope="col" className="r">Terminées</th>
											<th scope="col" className="r">Annulées</th>
											<th scope="col" className="r">Absents</th>
											<th scope="col" className="r">Chiffre d’affaires</th>
											<th scope="col" className="r">Panier moyen</th>
											<th scope="col" className="r">Durée moyenne</th>
											<th scope="col" className="r">Score</th>
										</tr>
									</thead>
									<tbody>
										{rows.map((b) => {
											const has = b.total_bookings > 0;
											return (
												<tr key={b.id}>
													<th scope="row">
														<button type="button" className="btable-who" onClick={() => setOpen(b.id)}>
															{nameOf(b)}
														</button>
													</th>
													<td className="r">{b.total_bookings}</td>
													<td className="r">{has ? pct(b.completion_rate) : '—'}</td>
													<td className={`r${b.cancellation_rate > 10 ? ' is-bad' : ''}`}>{has ? pct(b.cancellation_rate) : '—'}</td>
													<td className={`r${b.no_show_rate > 5 ? ' is-warn' : ''}`}>{has ? pct(b.no_show_rate) : '—'}</td>
													<td className="r">{mad(b.total_revenue)}</td>
													<td className="r">{mad(b.average_revenue_per_booking)}</td>
													<td className="r">{minutes(b.average_service_time)}</td>
													<td className="r">{has ? score(b.barber_score) : '—'}</td>
												</tr>
											);
										})}
									</tbody>
								</table>
							</div>
						</section>
					</>
				)}

				{data && data.total_pages > 1 && (
					<nav className="pager" aria-label="Pages">
						<Button variant="outline" size="sm" icon={<ArrowLeft />} disabled={!data.has_previous} onClick={() => setPage((p) => p - 1)}>
							Précédente
						</Button>
						<span className="num">
							Page {data.page} sur {data.total_pages}
						</span>
						<Button variant="outline" size="sm" iconAfter={<ArrowRight />} disabled={!data.has_next} onClick={() => setPage((p) => p + 1)}>
							Suivante
						</Button>
					</nav>
				)}
			</div>

			<BarberSheet barber={open} name={open ? nameOf(open) : ''} shopName={shop.name} onClose={() => setOpen(null)} />
			<AddBarberDialog open={adding} onClose={() => setAdding(false)} />
		</>
	);
}
