import { useRef, useState, type FormEvent, type KeyboardEvent, type PointerEvent } from 'react';
import { Link } from 'react-router';
import { GripVertical } from 'lucide-react';
import { errorText } from '@/api/http';
import { useAddCategory, useCreateCategory, useMenu, useRemoveCategory, useReorderMenu, type Category, type CategoryOrder } from '@/api/services';
import { useCurrentShop } from '@/app/shop-context';
import { t } from '@/i18n';
import { Button } from '@/ui/Button';
import { Failure, Loading } from '@/ui/controls';
import { Dialog } from '@/ui/Dialog';
import { Field, Input } from '@/ui/Field';
import { SearchInput } from '@/ui/lists';
import { PageHeader } from '@/ui/PageHeader';
import { useToast } from '@/ui/Toast';
import './Services.css';

/** The menu as clients see it in the app: categories in the salon's order. */
export function ServicesMenuPage() {
	const shop = useCurrentShop();
	const { data, isPending, error, refetch } = useMenu(shop.id);
	const reorder = useReorderMenu(shop.id);
	const [adding, setAdding] = useState(false);
	const [removing, setRemoving] = useState<CategoryOrder | null>(null);
	const toast = useToast();
	const [draft, setDraft] = useState<number[] | null>(null);
	const [dragging, setDragging] = useState<number | null>(null);
	const list = useRef<HTMLOListElement>(null);

	if (error && !data) return <Failure error={error} onRetry={() => void refetch()} />;
	if (isPending || !data) return <Loading />;

	const details = new Map(data.categories.map((category) => [category.id, category]));
	const ids = data.orders.map((order) => order.category_id);
	const byId = new Map(data.orders.map((order) => [order.category_id, order]));
	const shown = (draft ?? ids).flatMap((id) => byId.get(id) ?? []);

	/** Saves the new order: only the categories whose place changed. */
	const commit = (next: number[]) => {
		const moves = next.map((id, order) => ({ category_id: id, order })).filter((move) => ids[move.order] !== move.category_id);
		if (!moves.length) return setDraft(null);
		reorder.mutate(moves, {
			onSuccess: () => toast(t('menu.reordered')),
			onError: () => toast(t('menu.reorderError')),
			onSettled: () => setDraft(null)
		});
	};
	const moved = (from: number[], index: number, to: number) => {
		const next = [...from];
		const [id] = next.splice(index, 1);
		if (id !== undefined) next.splice(to, 0, id);
		return next;
	};

	/** Drag by the grip: the others make room as the pointer passes them. */
	const grab = (event: PointerEvent<HTMLButtonElement>, id: number) => {
		if (reorder.isPending) return;
		event.preventDefault();
		event.currentTarget.setPointerCapture(event.pointerId);
		setDragging(id);
		setDraft(ids);
	};
	const drag = (event: PointerEvent<HTMLButtonElement>, id: number) => {
		if (dragging !== id || !draft || !list.current) return;
		const rows = [...list.current.querySelectorAll<HTMLElement>('[data-category]')];
		const over = rows.findIndex((row) => {
			const box = row.getBoundingClientRect();
			return event.clientY < box.top + box.height / 2;
		});
		const to = over === -1 ? rows.length - 1 : over;
		const from = draft.indexOf(id);
		if (to !== from) setDraft(moved(draft, from, to));
	};
	const drop = () => {
		if (dragging === null) return;
		setDragging(null);
		if (draft) commit(draft);
	};
	/** The same with the keyboard: the arrows move the focused category. */
	const nudge = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
		const by = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0;
		if (!by || reorder.isPending) return;
		event.preventDefault();
		const to = index + by;
		if (to < 0 || to >= ids.length) return;
		const next = moved(ids, index, to);
		setDraft(next);
		commit(next);
		requestAnimationFrame(() => list.current?.querySelectorAll<HTMLButtonElement>('.menu-grip')[to]?.focus());
	};

	return (
		<>
			<PageHeader
				title={t('menu.title')}
				actions={
					<Button dot={false} onClick={() => setAdding(true)}>
						{t('menu.addCategory')}
					</Button>
				}
			/>

			{data.orders.length === 0 && <p className="muted">{t('menu.empty')}</p>}
			{data.orders.length > 1 && <p className="menu-hint">{t('menu.dragHint')}</p>}
			<ol ref={list} className={`menu-list${reorder.isPending ? ' is-refreshing' : ''}`}>
				{shown.map((order, index) => {
					const category = details.get(order.category_id);
					const names = category?.popular_services ?? [];
					const rest = category?.remaining_services_count ?? 0;
					return (
						<li key={order.category_id} data-category={order.category_id} className={`menu-row${dragging === order.category_id ? ' is-dragging' : ''}`}>
							<button
								type="button"
								className="menu-grip"
								aria-label={t('menu.dragLabel', { name: order.category.name })}
								onPointerDown={(event) => grab(event, order.category_id)}
								onPointerMove={(event) => drag(event, order.category_id)}
								onPointerUp={drop}
								onPointerCancel={drop}
								onKeyDown={(event) => nudge(event, index)}
							>
								<GripVertical aria-hidden="true" />
							</button>
							<span className="menu-pos num">{index + 1}</span>
							<Link to={`/prestations/categorie/${order.category_id}`} className="menu-text">
								<b>{order.category.name}</b>
								<small>{names.length ? `${names.join(', ')}${rest ? ` ${t('menu.moreServices', { count: rest })}` : ''}` : t('menu.noServicesYet')}</small>
							</Link>
							<button type="button" className="text-btn menu-remove" onClick={() => setRemoving(order)}>
								{t('menu.remove')}
							</button>
						</li>
					);
				})}
			</ol>
			<Link to="/prestations/sans-categorie" className="menu-row menu-row--loose">
				<span className="menu-text">
					<b>{t('menu.withoutCategory')}</b>
					<small>{t('menu.withoutCategoryHint')}</small>
				</span>
			</Link>

			<AddCategoryDialog open={adding} onClose={() => setAdding(false)} categories={data.categories} onMenu={new Set(data.orders.map((order) => order.category_id))} />
			<RemoveCategoryDialog order={removing} onClose={() => setRemoving(null)} />
		</>
	);
}

function AddCategoryDialog({ open, onClose, categories, onMenu }: { open: boolean; onClose: () => void; categories: Category[]; onMenu: Set<number> }) {
	const shop = useCurrentShop();
	const add = useAddCategory(shop.id);
	const create = useCreateCategory(shop.id);
	const toast = useToast();
	const [filter, setFilter] = useState('');
	const [name, setName] = useState('');
	const [description, setDescription] = useState('');

	const term = filter.trim().toLowerCase();
	const shown = categories.filter((category) => !term || category.name.toLowerCase().includes(term));
	const close = () => {
		add.reset();
		create.reset();
		setFilter('');
		setName('');
		setDescription('');
		onClose();
	};
	const done = (label: string) => {
		toast(t('menu.added', { name: label }));
		close();
	};
	const submit = (event: FormEvent) => {
		event.preventDefault();
		if (name.trim()) create.mutate({ name: name.trim(), description: description.trim(), order: onMenu.size }, { onSuccess: () => done(name.trim()) });
	};
	const failed = add.error ?? create.error;

	return (
		<Dialog open={open} onClose={close} title={t('menu.addTitle')} description={t('menu.addBody')}>
			<section aria-label={t('menu.existing')} className="cat-pick">
				<SearchInput value={filter} onChange={setFilter} label={t('menu.filterCategories')} block />
				<ul className="cat-list">
					{shown.map((category) => (
						<li key={category.id}>
							<span>{category.name}</span>
							{onMenu.has(category.id) ? (
								<small className="muted">{t('menu.inMenu')}</small>
							) : (
								<Button
									size="sm"
									variant="outline"
									dot={false}
									loading={add.isPending && add.variables?.category_id === category.id}
									onClick={() => add.mutate({ category_id: category.id, order: onMenu.size }, { onSuccess: () => done(category.name) })}
								>
									{t('menu.add')}
								</Button>
							)}
						</li>
					))}
				</ul>
			</section>
			<form onSubmit={submit} className="cat-new">
				<h3>{t('menu.newCategory')}</h3>
				<Field label={t('menu.categoryName')}>{({ id }) => <Input id={id} value={name} maxLength={60} onChange={(event) => setName(event.target.value)} />}</Field>
				<Field label={t('menu.categoryDescription')}>{({ id }) => <Input id={id} value={description} maxLength={160} onChange={(event) => setDescription(event.target.value)} />}</Field>
				<Button type="submit" variant="outline" dot={false} disabled={!name.trim()} loading={create.isPending}>
					{t('menu.add')}
				</Button>
			</form>
			{failed && (
				<p className="notice notice--bad" role="alert">
					{errorText(failed)}
				</p>
			)}
		</Dialog>
	);
}

function RemoveCategoryDialog({ order, onClose }: { order: CategoryOrder | null; onClose: () => void }) {
	const shop = useCurrentShop();
	const remove = useRemoveCategory(shop.id);
	const toast = useToast();
	const name = order?.category.name ?? '';
	const close = () => {
		remove.reset();
		onClose();
	};
	return (
		<Dialog
			open={Boolean(order)}
			onClose={close}
			title={t('menu.removeTitle', { name })}
			description={t('menu.removeBody')}
			footer={
				<>
					<Button variant="outline" onClick={close}>
						{t('common.buttons.cancel')}
					</Button>
					<Button
						variant="danger"
						dot={false}
						loading={remove.isPending}
						onClick={() =>
							order &&
							remove.mutate(order.category_id, {
								onSuccess: () => {
									toast(t('menu.removed', { name }));
									close();
								}
							})
						}
					>
						{t('menu.remove')}
					</Button>
				</>
			}
		>
			{remove.isError && (
				<p className="notice notice--bad" role="alert">
					{errorText(remove.error)}
				</p>
			)}
		</Dialog>
	);
}
