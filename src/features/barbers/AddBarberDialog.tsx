import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { mediaUrl } from '@/api/http';
import { useAddBarber, usePeopleSearch } from '@/api/shops';
import { useCurrentShop } from '@/app/shop-context';
import { Button } from '@/ui/Button';
import { Dialog } from '@/ui/Dialog';
import { Avatar } from '@/ui/Portrait';
import { useToast } from '@/ui/Toast';

/** Find a barber who already has a BarberChat account and bring them into the salon. */
export function AddBarberDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
	const shop = useCurrentShop();
	const toast = useToast();
	const [text, setText] = useState('');
	const [term, setTerm] = useState('');
	const add = useAddBarber(shop.id);
	const { data = [], isFetching } = usePeopleSearch(shop.id, term, true, open);

	useEffect(() => {
		const t = setTimeout(() => setTerm(text.trim()), 300);
		return () => clearTimeout(t);
	}, [text]);
	useEffect(() => {
		if (!open) setText('');
	}, [open]);

	return (
		<Dialog open={open} onClose={onClose} title="Ajouter un barbier" description={`Cherchez son nom d’utilisateur BarberChat. Il rejoint ${shop.name} tout de suite.`}>
			<label className="search search--block">
				<Search aria-hidden />
				<span className="sr-only">Nom d’utilisateur</span>
				<input type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder="ex. nassim.cuts" autoComplete="off" />
			</label>
			<ul className={`finds${isFetching ? ' is-refreshing' : ''}`} aria-live="polite">
				{data.length === 0 && !isFetching && (
					<li className="finds-none">
						{term ? `Personne ne s’appelle « ${term} ». Le barbier doit d’abord créer son compte dans l’app.` : 'Aucun barbier disponible pour le moment.'}
					</li>
				)}
				{data.map((r) => (
					<li key={r.id}>
						<Avatar name={r.username} src={mediaUrl(r.profile_picture)} size={40} />
						<span className="finds-name">
							<b>{r.username}</b>
							<span className="muted">Barbier sur BarberChat</span>
						</span>
						<Button
							size="sm"
							variant="outline"
							dot={false}
							loading={add.isPending && add.variables === r.id}
							onClick={() =>
								add.mutate(r.id, {
									onSuccess: () => {
										toast(`${r.username} fait maintenant partie de l’équipe`);
										onClose();
									}
								})
							}
						>
							Ajouter
						</Button>
					</li>
				))}
			</ul>
			{add.isError && <p className="field-error">L’ajout n’a pas abouti. Réessayez dans un instant.</p>}
		</Dialog>
	);
}
