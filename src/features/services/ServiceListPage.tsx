import { useState, type FormEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { ChevronLeft } from 'lucide-react';
import { ApiError, errorText } from '@/api/http';
import { useDeleteService, useMenu, useSaveService, useServices, type Service, type ServiceInput } from '@/api/services';
import { useCurrentShop } from '@/app/shop-context';
import { t } from '@/i18n';
import { duration, mad } from '@/lib/format';
import { Button } from '@/ui/Button';
import { ChipGroup, Failure, Loading, Switch } from '@/ui/controls';
import { Dialog } from '@/ui/Dialog';
import { Field, Input, Select, Textarea } from '@/ui/Field';
import { SearchInput } from '@/ui/lists';
import { MoreMenu } from '@/ui/MoreMenu';
import { PageHeader } from '@/ui/PageHeader';
import { useToast } from '@/ui/Toast';
import './Services.css';

type Shown = 'all' | 'active' | 'inactive';

const toInput = (service: Service): ServiceInput => ({
	id: service.id,
	title: service.title,
	description: service.description,
	price: Number(service.price),
	duration_minutes: service.duration_minutes,
	group: service.group ? String(service.group.id) : '',
	is_active: service.is_active
});

/** The services of one category (or of none): price, duration, availability. */
export function ServiceListPage() {
	const shop = useCurrentShop();
	const { categoryId } = useParams();
	const category = categoryId ? Number(categoryId) : 'none';
	const [params] = useSearchParams();
	const [text, setText] = useState(params.get('recherche') ?? '');
	const [shown, setShown] = useState<Shown>('all');
	const [editing, setEditing] = useState<Service | 'new' | null>(null);
	const [deleting, setDeleting] = useState<Service | null>(null);
	const { data, isPending, error, refetch } = useServices(shop.id, category);
	const save = useSaveService(shop.id);
	const toast = useToast();

	const title = category === 'none' ? t('servicesList.uncategorized') : (data?.category?.name ?? t('menu.title'));
	const term = text.trim().toLowerCase();
	const rows = (data?.services ?? []).filter(
		(service) => (shown === 'all' || service.is_active === (shown === 'active')) && (!term || service.title.toLowerCase().includes(term))
	);

	const setAvailable = (service: Service, available: boolean) =>
		save.mutate(
			{ ...toInput(service), is_active: available },
			{ onSuccess: () => toast(t(available ? 'servicesList.activated' : 'servicesList.deactivated', { name: service.title })), onError: (failure) => toast(errorText(failure)) }
		);

	return (
		<>
			<Link to="/prestations" className="back-link">
				<ChevronLeft aria-hidden />
				{t('servicesList.back')}
			</Link>
			<PageHeader
				title={title}
				actions={
					<Button dot={false} onClick={() => setEditing('new')}>
						{t('servicesList.add')}
					</Button>
				}
			/>

			<div className="services">
				<div className="toolbar">
					<SearchInput value={text} onChange={setText} label={t('servicesList.search')} />
					<ChipGroup
						label={t('servicesList.allStatuses')}
						value={shown}
						onChange={setShown}
						options={[
							{ value: 'all', label: t('common.buttons.all') },
							{ value: 'active', label: t('servicesList.activeOnly') },
							{ value: 'inactive', label: t('servicesList.inactiveOnly') }
						]}
					/>
				</div>

				{error && !data ? (
					<Failure error={error} onRetry={() => void refetch()} />
				) : isPending || !data ? (
					<Loading />
				) : rows.length === 0 ? (
					<p className="muted">{t(term || shown !== 'all' ? 'servicesList.noMatch' : 'servicesList.empty')}</p>
				) : (
					<ul className="svc-grid">
						{rows.map((service) => (
							<li key={service.id} className={`svc${service.is_active ? '' : ' is-off'}`}>
								<div className="svc-top">
									<b className="svc-name">{service.title}</b>
									{!service.is_active && <span className="svc-off">{t('servicesList.inactive')}</span>}
								</div>
								{service.description && <p className="svc-desc">{service.description}</p>}
								<p className="svc-price num">
									{service.discounted_price && service.best_promo ? (
										<>
											<b>{mad(service.discounted_price)}</b>
											<s>{mad(service.price)}</s>
										</>
									) : (
										<b>{mad(service.price)}</b>
									)}
								</p>
								{service.discounted_price && service.best_promo && <p className="svc-promo">{service.best_promo.name}</p>}
								<p className="svc-meta num">
									<span>{duration(service.duration_minutes)}</span>
									<span>{t('servicesList.bookings', { count: service.bookings_count })}</span>
								</p>
								<MoreMenu
									label={`${t('common.labels.actions')} : ${service.title}`}
									items={[
										{ label: t('servicesList.edit'), run: () => setEditing(service) },
										{ label: t(service.is_active ? 'servicesList.deactivate' : 'servicesList.activate'), run: () => setAvailable(service, !service.is_active) },
										{ label: t('servicesList.delete'), run: () => setDeleting(service) }
									]}
								/>
							</li>
						))}
					</ul>
				)}
			</div>

			{editing && <ServiceDialog service={editing === 'new' ? null : editing} category={category} onClose={() => setEditing(null)} />}
			<DeleteServiceDialog service={deleting} onClose={() => setDeleting(null)} />
		</>
	);
}

function ServiceDialog({ service, category, onClose }: { service: Service | null; category: number | 'none'; onClose: () => void }) {
	const shop = useCurrentShop();
	const menu = useMenu(shop.id);
	const save = useSaveService(shop.id);
	const toast = useToast();
	const [checked, setChecked] = useState(false);
	const [form, setForm] = useState(() =>
		service
			? { ...toInput(service), price: String(Number(service.price)), duration_minutes: String(service.duration_minutes) }
			: { title: '', description: '', price: '', duration_minutes: '30', group: category === 'none' ? '' : String(category), is_active: true }
	);
	const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((current) => ({ ...current, [key]: value }));

	const price = Number(form.price);
	const minutes = Number(form.duration_minutes);
	const errors = {
		title: form.title.trim() ? null : t('serviceForm.errName'),
		price: form.price.trim() !== '' && price >= 0 ? null : t('serviceForm.errPrice'),
		duration: Number.isInteger(minutes) && minutes > 0 ? null : t('serviceForm.errDuration')
	};

	function submit(event: FormEvent) {
		event.preventDefault();
		setChecked(true);
		if (errors.title || errors.price || errors.duration) return;
		const name = form.title.trim();
		save.mutate(
			{ ...form, id: service?.id, title: name, description: form.description.trim(), price, duration_minutes: minutes },
			{
				onSuccess: () => {
					toast(t(service ? 'serviceForm.saved' : 'serviceForm.created', { name }));
					onClose();
				}
			}
		);
	}

	return (
		<Dialog open onClose={onClose} placement="side" title={service ? t('serviceForm.editTitle', { name: service.title }) : t('serviceForm.createTitle')}>
			<form onSubmit={submit} className="svc-form" noValidate>
				<Field label={t('serviceForm.name')} error={checked ? ((save.error instanceof ApiError && save.error.field('title')) || errors.title) : null}>
					{({ id, describedBy, invalid }) => <Input id={id} value={form.title} maxLength={80} onChange={(event) => set('title', event.target.value)} aria-describedby={describedBy} aria-invalid={invalid} />}
				</Field>
				<Field label={t('serviceForm.description')}>{({ id }) => <Textarea id={id} value={form.description} maxLength={300} onChange={(event) => set('description', event.target.value)} />}</Field>
				<div className="svc-form-two">
					<Field label={t('serviceForm.price')} error={checked ? errors.price : null}>
						{({ id, describedBy, invalid }) => (
							<Input id={id} type="number" min={0} step="any" inputMode="decimal" value={form.price} onChange={(event) => set('price', event.target.value)} aria-describedby={describedBy} aria-invalid={invalid} />
						)}
					</Field>
					<Field label={t('serviceForm.duration')} error={checked ? errors.duration : null}>
						{({ id, describedBy, invalid }) => (
							<Input id={id} type="number" min={1} step={5} inputMode="numeric" value={form.duration_minutes} onChange={(event) => set('duration_minutes', event.target.value)} aria-describedby={describedBy} aria-invalid={invalid} />
						)}
					</Field>
				</div>
				<Field label={t('serviceForm.category')}>
					{({ id }) => (
						<Select id={id} value={form.group} onChange={(event) => set('group', event.target.value)}>
							<option value="">{t('serviceForm.noCategory')}</option>
							{(menu.data?.orders ?? []).map((order) => (
								<option key={order.category_id} value={order.category_id}>
									{order.category.name}
								</option>
							))}
						</Select>
					)}
				</Field>
				<label className="svc-switch">
					<span>{t('serviceForm.active')}</span>
					<Switch checked={form.is_active} onChange={(value) => set('is_active', value)} label={t('serviceForm.active')} />
				</label>
				{save.isError && (
					<p className="notice notice--bad" role="alert">
						{errorText(save.error)}
					</p>
				)}
				<div className="svc-form-foot">
					<Button variant="outline" onClick={onClose}>
						{t('common.buttons.cancel')}
					</Button>
					<Button type="submit" dot={false} loading={save.isPending}>
						{t('serviceForm.save')}
					</Button>
				</div>
			</form>
		</Dialog>
	);
}

function DeleteServiceDialog({ service, onClose }: { service: Service | null; onClose: () => void }) {
	const shop = useCurrentShop();
	const remove = useDeleteService(shop.id);
	const toast = useToast();
	const name = service?.title ?? '';
	const close = () => {
		remove.reset();
		onClose();
	};
	return (
		<Dialog
			open={Boolean(service)}
			onClose={close}
			title={t('servicesList.deleteTitle', { name })}
			description={t('servicesList.deleteBody')}
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
							service &&
							remove.mutate(service.id, {
								onSuccess: () => {
									toast(t('servicesList.deleted', { name }));
									close();
								}
							})
						}
					>
						{t('servicesList.delete')}
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
