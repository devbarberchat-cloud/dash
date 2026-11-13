import { useState } from 'react';
import { Link } from 'react-router';
import type { Barber } from '@/api/barbers';
import { mediaUrl } from '@/api/http';
import { useRemoveBarber } from '@/api/shops';
import { useCurrentShop } from '@/app/shop-context';
import { StatusBar } from '@/charts/StatusBar';
import { statusColor, statusLabel } from '@/lib/booking-status';
import { mad, minutes, monthYear, pct } from '@/lib/format';
import { BarberScore } from '@/ui/BarberScore';
import { Button } from '@/ui/Button';
import { Dialog } from '@/ui/Dialog';
import { Portrait } from '@/ui/Portrait';
import { useToast } from '@/ui/Toast';

export function BarberSheet({ barber, name, shopName, onClose }: { barber: Barber | null; name: string; shopName: string; onClose: () => void }) {
	const [confirm, setConfirm] = useState(false);
	const b = barber;
	const has = Boolean(b && b.total_bookings > 0);
	return (
		<>
			<Dialog
				open={Boolean(b) && !confirm}
				onClose={onClose}
				placement="side"
				title={name}
				description={b?.first_booking_date ? `Au salon depuis ${monthYear(b.first_booking_date)}` : 'Pas encore de réservation dans ce salon'}
				header={b && <Portrait name={name} src={mediaUrl(b.profile_picture)} size={104} className="bsheet-photo" />}
				footer={
					b && (
						<>
							<Button variant="quiet" onClick={() => setConfirm(true)} className="bsheet-remove">
								Retirer du salon
							</Button>
							<Link to={`/barbiers/${b.id}`} className="btn btn--ink btn--md btn--dot">
								Voir ses statistiques
							</Link>
						</>
					)
				}
			>
				{b && has && (
					<>
						<dl className="kpis kpis--lead">
							<div>
								<dt>Chiffre d’affaires</dt>
								<dd className="num">{mad(b.total_revenue)}</dd>
								<dd className="kpi-note num">Panier moyen {mad(b.average_revenue_per_booking)}</dd>
							</div>
							<div>
								<dt>Réservations</dt>
								<dd className="num">{b.total_bookings}</dd>
								<dd className="kpi-note num">Durée moyenne {minutes(b.average_service_time)}</dd>
							</div>
							<div>
								<dt>BarberScore</dt>
								<dd>
									<BarberScore value={b.barber_score} />
								</dd>
								<dd className="kpi-note">Offert par les clients après chaque prestation</dd>
							</div>
						</dl>
						<section aria-labelledby="outcome-t">
							<h3 id="outcome-t" className="bsheet-h">
								Issue de ses réservations
							</h3>
							<StatusBar
								label="Issue des réservations"
								parts={[
									{ key: 'done', value: b.completed_bookings, color: statusColor('completed'), label: `${statusLabel('completed')} (${pct(b.completion_rate)})` },
									{ key: 'cancelled', value: b.cancelled_bookings, color: statusColor('cancelled'), label: statusLabel('cancelled') },
									{ key: 'noshow', value: b.no_show_bookings, color: statusColor('no_show'), label: statusLabel('no_show') },
									{ key: 'other', value: Math.max(0, b.total_bookings - b.completed_bookings - b.cancelled_bookings - b.no_show_bookings), color: statusColor('pending'), label: statusLabel('pending') }
								]}
							/>
						</section>
					</>
				)}
				{b && !has && <p className="muted">Ses chiffres apparaîtront ici après sa première réservation dans ce salon.</p>}
			</Dialog>
			{b && (
				<RemoveBarberDialog
					open={confirm}
					barber={{ id: b.id, name }}
					shopName={shopName}
					onDone={() => {
						setConfirm(false);
						onClose();
					}}
					onCancel={() => setConfirm(false)}
				/>
			)}
		</>
	);
}

/** A decision, so a centred dialog that names the action and its result. */
export function RemoveBarberDialog({
	open,
	barber,
	shopName,
	onDone,
	onCancel
}: {
	open: boolean;
	barber: { id: number; name: string };
	shopName: string;
	onDone: () => void;
	onCancel: () => void;
}) {
	const shop = useCurrentShop();
	const remove = useRemoveBarber(shop.id);
	const toast = useToast();
	return (
		<Dialog
			open={open}
			onClose={onCancel}
			title={`Retirer ${barber.name} de ${shopName} ?`}
			description="Il ne pourra plus recevoir de réservations pour ce salon. Vous pourrez l’ajouter de nouveau plus tard."
			footer={
				<>
					<Button variant="outline" onClick={onCancel}>
						Garder {barber.name}
					</Button>
					<Button
						variant="danger"
						loading={remove.isPending}
						onClick={async () => {
							// awaited here, not in mutate callbacks: the list refreshes and this
							// dialog's parent may unmount before those callbacks would run
							try {
								await remove.mutateAsync(barber.id);
								toast(`${barber.name} ne fait plus partie de l’équipe`);
								onDone();
							} catch {
								/* shown below */
							}
						}}
					>
						Retirer du salon
					</Button>
				</>
			}
		>
			{remove.isError && <p className="field-error">Le retrait n’a pas abouti. Réessayez dans un instant.</p>}
		</Dialog>
	);
}
