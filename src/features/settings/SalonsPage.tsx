import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { ApiError, errorText } from '@/api/http';
import { SHOP_TYPES, useCreateShop, type ShopType } from '@/api/shops';
import { ShopMark, shopKind } from '@/app/ShopSwitcher';
import { useShopContext } from '@/app/shop-context';
import { t } from '@/i18n';
import { NEIGHBORHOODS } from '@/lib/neighborhoods';
import { Button } from '@/ui/Button';
import { Field, Input, Select } from '@/ui/Field';
import { PageHeader } from '@/ui/PageHeader';
import { useToast } from '@/ui/Toast';
import './Settings.css';

/** The salons the user manages: pick the one to work on, or add one. */
export function SalonsPage() {
	const { shops, shop, select } = useShopContext();
	const navigate = useNavigate();
	return (
		<>
			<PageHeader
				title={t('salons.title')}
				kicker={t('salons.count', { count: shops.length })}
				actions={
					<Link to="/salon/nouveau" className="btn btn--ink btn--md">
						{t('shop.createShop')}
					</Link>
				}
			/>
			{shops.length === 0 ? (
				<p className="muted">{t('salons.emptyDescription')}</p>
			) : (
				<ul className="list">
					{shops.map((other) => (
						<li key={other.id} className="salons-row">
							<ShopMark shop={other} />
							<span className="row-text">
								<b>{other.name}</b>
								<small>{shopKind(other)}</small>
							</span>
							{other.id === shop?.id ? (
								<span className="muted">{t('salons.current')}</span>
							) : (
								<Button
									variant="outline"
									size="sm"
									onClick={() => {
										select(other.id);
										navigate('/');
									}}
								>
									{t('salons.open')}
								</Button>
							)}
						</li>
					))}
				</ul>
			)}
		</>
	);
}

export function NewSalonPage() {
	const { select } = useShopContext();
	const create = useCreateShop();
	const navigate = useNavigate();
	const toast = useToast();
	const [checked, setChecked] = useState(false);
	const [form, setForm] = useState({ name: '', shop_type: 'mid_range' as ShopType, address: '', neighborhood: '', phone: '' });
	const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((current) => ({ ...current, [key]: value }));
	const refused = create.error instanceof ApiError ? create.error : null;

	function submit(event: FormEvent) {
		event.preventDefault();
		setChecked(true);
		if (!form.name.trim()) return;
		create.mutate(
			{ ...form, name: form.name.trim(), city: 'Casablanca' },
			{
				onSuccess: (salon) => {
					select(salon.id);
					toast(t('common.notifications.shopCreated', { name: salon.name }));
					navigate('/salon');
				}
			}
		);
	}

	return (
		<>
			<Link to="/salons" className="back-link">
				{t('salons.title')}
			</Link>
			<PageHeader title={t('shop.createShop')} />
			<form onSubmit={submit} className="salon-new" noValidate>
				<Field label={t('serviceForm.name')} error={checked && !form.name.trim() ? t('promoForm.errName') : (refused?.field('name') ?? null)}>
					{({ id, describedBy, invalid }) => <Input id={id} value={form.name} maxLength={80} autoComplete="organization" onChange={(event) => set('name', event.target.value)} aria-describedby={describedBy} aria-invalid={invalid} />}
				</Field>
				<Field label={t('salons.type')}>
					{({ id }) => (
						<Select id={id} value={form.shop_type} onChange={(event) => set('shop_type', event.target.value as ShopType)}>
							{SHOP_TYPES.map((type) => (
								<option key={type} value={type}>
									{t(`salonType.${type}`)}
								</option>
							))}
						</Select>
					)}
				</Field>
				<Field label={t('salon.address')}>{({ id }) => <Input id={id} value={form.address} autoComplete="street-address" onChange={(event) => set('address', event.target.value)} />}</Field>
				<Field label={t('common.labels.location')}>
					{({ id }) => (
						<Select id={id} value={form.neighborhood} onChange={(event) => set('neighborhood', event.target.value)}>
							<option value="">{t('salon.notSet')}</option>
							{NEIGHBORHOODS.map(([key, label]) => (
								<option key={key} value={key}>
									{label}
								</option>
							))}
						</Select>
					)}
				</Field>
				<Field label={t('salon.phone')}>{({ id }) => <Input id={id} type="tel" inputMode="tel" autoComplete="tel" value={form.phone} onChange={(event) => set('phone', event.target.value)} />}</Field>
				{create.isError && (
					<p className="notice notice--bad" role="alert">
						{errorText(create.error)}
					</p>
				)}
				<div className="salon-new-foot">
					<Button type="submit" dot={false} loading={create.isPending}>
						{t('common.buttons.create')}
					</Button>
					<Link to="/salons" className="btn btn--outline btn--md">
						{t('common.buttons.cancel')}
					</Link>
				</div>
			</form>
		</>
	);
}
