import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router';
import { errorText } from '@/api/http';
import { useCreatePromo, useDeletePromo, usePromos, useTogglePromo, useUpdatePromo, type Promo, type PromoNature, type PromoSchedule } from '@/api/promos';
import { useAllServices } from '@/api/services';
import { useCurrentShop } from '@/app/shop-context';
import { t, tMaybe } from '@/i18n';
import { date, hhmm, mad } from '@/lib/format';
import { Button } from '@/ui/Button';
import { ChipGroup, Failure, Loading } from '@/ui/controls';
import { Dialog } from '@/ui/Dialog';
import { Field, Input, Select } from '@/ui/Field';
import { SearchInput } from '@/ui/lists';
import { MoreMenu } from '@/ui/MoreMenu';
import { PageHeader } from '@/ui/PageHeader';
import { useToast } from '@/ui/Toast';
import { Copy } from 'lucide-react';
import './Promos.css';

type Shown = 'all' | 'active' | 'inactive';
const NATURES: PromoNature[] = ['code', 'constant', 'schedule'];
const discount = (promo: Promo) => (promo.discount_type === 'percentage' ? `${Number(promo.discount_value)} %` : mad(promo.discount_value));

export function PromosPage() {
	const shop = useCurrentShop();
	const [params] = useSearchParams();
	const [text, setText] = useState(params.get('recherche') ?? '');
	const [shown, setShown] = useState<Shown>('all');
	const [editing, setEditing] = useState<Promo | 'new' | null>(null);
	const [deleting, setDeleting] = useState<Promo | null>(null);
	const { data, isPending, error, refetch } = usePromos(shop.id);
	const toggle = useTogglePromo(shop.id);
	const toast = useToast();

	const term = text.trim().toLowerCase();
	const rows = (data ?? []).filter(
		(promo) => (shown === 'all' || promo.is_active === (shown === 'active')) && (!term || `${promo.name} ${promo.code ?? ''}`.toLowerCase().includes(term))
	);

	return (
		<>
			<PageHeader
				kicker={shop.name}
				title={t('promos.title')}
				actions={
					<Button dot={false} onClick={() => setEditing('new')}>
						{t('promos.create')}
					</Button>
				}
			/>
			<div className="promos">
				<div className="toolbar">
					<SearchInput value={text} onChange={setText} label={t('promos.search')} />
					<ChipGroup
						label={t('promos.title')}
						value={shown}
						onChange={setShown}
						options={[
							{ value: 'all', label: t('promos.all') },
							{ value: 'active', label: t('promos.active') },
							{ value: 'inactive', label: t('promos.inactive') }
						]}
					/>
				</div>
				{error && !data ? (
					<Failure error={error} onRetry={() => void refetch()} />
				) : isPending || !data ? (
					<Loading />
				) : rows.length === 0 ? (
					<p className="muted">{t(term || shown !== 'all' ? 'promos.noMatch' : 'promos.empty')}</p>
				) : (
					<ul className="promo-grid">
						{rows.map((promo) => (
							<li key={promo.id} className={`promo${promo.is_active ? '' : ' is-off'}`}>
								<div className="promo-top">
									<b className="promo-name">{promo.name}</b>
									<span className={`promo-state${promo.is_active ? '' : ' is-off'}`}>{promo.is_active ? tMaybe('promos.isActive', 'Active') : t('promos.inactive')}</span>
								</div>
								<p className="promo-value num">
									{t('promos.off', { value: discount(promo) })}
									<small>{tMaybe(`promos.kind.${promo.promo_nature}`, promo.promo_nature)}</small>
								</p>
								{promo.code && (
									<button type="button" className="promo-code" aria-label={t('promos.copy', { code: promo.code })} onClick={() => navigator.clipboard?.writeText(promo.code ?? '').then(() => toast(tMaybe('promos.copied', 'Code copié')), () => toast(t('promos.copyFailed')))}>
										{promo.code}
										<Copy size={14} aria-hidden="true" />
									</button>
								)}
								<div className="promo-usage">
									<p className="num">
										{t('promos.used', { count: promo.usage_stats.total_uses })}
										{promo.total_usage_limit ? ` ${t('promos.limit', { limit: promo.total_usage_limit })}` : ''}
									</p>
									{promo.total_usage_limit ? (
										<span className="promo-meter" aria-hidden="true">
											<span style={{ width: `${Math.min(100, (promo.usage_stats.total_uses / promo.total_usage_limit) * 100)}%` }} />
										</span>
									) : null}
									{(promo.services.length > 0 || promo.valid_until) && (
										<p className="num">
											{promo.services.length > 0 && t('promos.services', { count: promo.services.length })}
											{promo.services.length > 0 && promo.valid_until && ' · '}
											{promo.valid_until && t('promos.validUntil', { date: date(promo.valid_until) })}
										</p>
									)}
								</div>
								<MoreMenu
									label={`${t('common.labels.actions')} : ${promo.name}`}
									items={[
										{ label: t('promos.edit'), run: () => setEditing(promo) },
										{
											label: t(promo.is_active ? 'promos.pause' : 'promos.resume'),
											run: () =>
												toggle.mutate(promo.id, {
													onSuccess: () => toast(t(promo.is_active ? 'promos.paused' : 'promos.resumed', { name: promo.name })),
													onError: (failure) => toast(errorText(failure))
												})
										},
										{ label: t('promos.delete'), run: () => setDeleting(promo) }
									]}
								/>
							</li>
						))}
					</ul>
				)}
			</div>
			{editing && <PromoDialog promo={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
			<DeletePromoDialog promo={deleting} onClose={() => setDeleting(null)} />
		</>
	);
}

function PromoDialog({ promo, onClose }: { promo: Promo | null; onClose: () => void }) {
	const shop = useCurrentShop();
	const services = useAllServices(shop.id);
	const create = useCreatePromo(shop.id);
	const update = useUpdatePromo(shop.id);
	const toast = useToast();
	const [checked, setChecked] = useState(false);
	const [nature, setNature] = useState<PromoNature>(promo?.promo_nature ?? 'code');
	const [form, setForm] = useState({
		name: promo?.name ?? '',
		discount_type: promo?.discount_type ?? ('percentage' as const),
		discount_value: promo ? String(Number(promo.discount_value)) : '',
		code: promo?.code ?? '',
		valid_from: promo?.valid_from?.slice(0, 10) ?? '',
		valid_until: promo?.valid_until?.slice(0, 10) ?? ''
	});
	const [serviceIds, setServiceIds] = useState<number[]>(promo?.services.map((service) => service.id) ?? []);
	const [slots, setSlots] = useState<PromoSchedule[]>(promo?.schedules.length ? promo.schedules : [{ weekday: 0, start_time: '10:00', end_time: '14:00' }]);
	const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((current) => ({ ...current, [key]: value }));

	const value = Number(form.discount_value);
	const needsServices = nature !== 'code';
	const errors = {
		name: form.name.trim() ? null : t('promoForm.errName'),
		value: !(value > 0) ? t('promoForm.errValue') : form.discount_type === 'percentage' && value > 100 ? t('promoForm.errPercent') : null,
		dates: form.valid_from && form.valid_until && form.valid_until < form.valid_from ? t('promoForm.errDates') : null,
		services: needsServices && serviceIds.length === 0 ? t('promoForm.errServices') : null,
		slots: nature === 'schedule' && slots.some((slot) => hhmm(slot.end_time) <= hhmm(slot.start_time)) ? t('promoForm.errSlot') : null
	};
	const saving = create.isPending || update.isPending;
	const failed = create.error ?? update.error;

	function submit(event: FormEvent) {
		event.preventDefault();
		setChecked(true);
		if (Object.values(errors).some(Boolean)) return;
		const name = form.name.trim();
		const input = {
			name,
			discount_type: form.discount_type,
			discount_value: value,
			valid_from: form.valid_from || null,
			valid_until: form.valid_until || null,
			...(nature === 'code' && form.code.trim() ? { code: form.code.trim().toUpperCase() } : {}),
			...(needsServices ? { service_ids: serviceIds } : {}),
			...(nature === 'schedule' ? { schedules: slots.map((slot) => ({ weekday: slot.weekday, start_time: hhmm(slot.start_time), end_time: hhmm(slot.end_time) })) } : {})
		};
		const done = () => {
			toast(t(promo ? 'promoForm.saved' : 'promoForm.created', { name }));
			onClose();
		};
		if (promo) update.mutate({ id: promo.id, ...input }, { onSuccess: done });
		else create.mutate({ nature, ...input }, { onSuccess: done });
	}

	return (
		<Dialog open onClose={onClose} placement="side" title={promo ? t('promoForm.editTitle', { name: promo.name }) : t('promoForm.createTitle')}>
			<form onSubmit={submit} className="promo-form" noValidate>
				{!promo && (
					<div className="field">
						<span className="field-label">{t('promoForm.kind')}</span>
						<ChipGroup label={t('promoForm.kind')} value={nature} onChange={setNature} options={NATURES.map((kind) => ({ value: kind, label: t(`promos.kind.${kind}`) }))} />
						<p className="field-hint">{t(`promos.kindHint.${nature}`)}</p>
					</div>
				)}
				<Field label={t('promoForm.name')} error={checked ? errors.name : null}>
					{({ id, describedBy, invalid }) => <Input id={id} value={form.name} maxLength={80} onChange={(event) => set('name', event.target.value)} aria-describedby={describedBy} aria-invalid={invalid} />}
				</Field>
				<div className="promo-two">
					<Field label={t('promoForm.discount')}>
						{({ id }) => (
							<Select id={id} value={form.discount_type} onChange={(event) => set('discount_type', event.target.value as 'percentage' | 'fixed')}>
								<option value="percentage">{t('promoForm.percentage')}</option>
								<option value="fixed">{t('promoForm.fixed')}</option>
							</Select>
						)}
					</Field>
					<Field label={t('promoForm.value')} error={checked ? errors.value : null}>
						{({ id, describedBy, invalid }) => (
							<Input id={id} type="number" min={0} step="any" inputMode="decimal" value={form.discount_value} onChange={(event) => set('discount_value', event.target.value)} aria-describedby={describedBy} aria-invalid={invalid} />
						)}
					</Field>
				</div>
				{nature === 'code' && (
					<Field label={t('promoForm.code')} hint={t('promoForm.codeHint')}>
						{({ id, describedBy }) => <Input id={id} value={form.code} maxLength={24} autoCapitalize="characters" onChange={(event) => set('code', event.target.value)} aria-describedby={describedBy} />}
					</Field>
				)}
				<div className="promo-two">
					<Field label={t('promoForm.validFrom')}>{({ id }) => <Input id={id} type="date" value={form.valid_from} onChange={(event) => set('valid_from', event.target.value)} />}</Field>
					<Field label={t('promoForm.validUntil')} error={checked ? errors.dates : null}>
						{({ id, describedBy, invalid }) => (
							<Input id={id} type="date" value={form.valid_until} min={form.valid_from || undefined} onChange={(event) => set('valid_until', event.target.value)} aria-describedby={describedBy} aria-invalid={invalid} />
						)}
					</Field>
				</div>

				{needsServices && (
					<fieldset className="promo-set">
						<legend className="field-label">{t('promoForm.services')}</legend>
						<p className="field-hint">{t('promoForm.servicesHint')}</p>
						{services.data?.length === 0 && <p className="muted">{t('promoForm.noServices')}</p>}
						<ul className="promo-services">
							{(services.data ?? []).map((service) => (
								<li key={service.id}>
									<label>
										<input
											type="checkbox"
											checked={serviceIds.includes(service.id)}
											onChange={() => setServiceIds((ids) => (ids.includes(service.id) ? ids.filter((id) => id !== service.id) : [...ids, service.id]))}
										/>
										<span>{service.title}</span>
										<span className="muted num">{mad(service.price)}</span>
									</label>
								</li>
							))}
						</ul>
						{checked && errors.services && <p className="field-error">{errors.services}</p>}
					</fieldset>
				)}

				{nature === 'schedule' && (
					<fieldset className="promo-set">
						<legend className="field-label">{t('promoForm.schedules')}</legend>
						{slots.map((slot, index) => (
							<div key={index} className="promo-slot">
								<Select aria-label={t('promoForm.day')} value={slot.weekday} onChange={(event) => setSlots((list) => list.map((item, i) => (i === index ? { ...item, weekday: Number(event.target.value) } : item)))}>
									{[0, 1, 2, 3, 4, 5, 6].map((day) => (
										<option key={day} value={day}>
											{tMaybe(`weekdays.${day}`, String(day))}
										</option>
									))}
								</Select>
								<Input type="time" aria-label={t('promoForm.from')} value={hhmm(slot.start_time)} onChange={(event) => setSlots((list) => list.map((item, i) => (i === index ? { ...item, start_time: event.target.value } : item)))} />
								<Input type="time" aria-label={t('promoForm.to')} value={hhmm(slot.end_time)} onChange={(event) => setSlots((list) => list.map((item, i) => (i === index ? { ...item, end_time: event.target.value } : item)))} />
								{slots.length > 1 && (
									<button type="button" className="text-btn" onClick={() => setSlots((list) => list.filter((_, i) => i !== index))}>
										{t('common.buttons.remove')}
									</button>
								)}
							</div>
						))}
						<button type="button" className="text-btn" onClick={() => setSlots((list) => [...list, { weekday: 0, start_time: '10:00', end_time: '14:00' }])}>
							{t('promoForm.addSchedule')}
						</button>
						{checked && errors.slots && <p className="field-error">{errors.slots}</p>}
					</fieldset>
				)}

				{failed && (
					<p className="notice notice--bad" role="alert">
						{errorText(failed)}
					</p>
				)}
				<div className="promo-foot">
					<Button variant="outline" onClick={onClose}>
						{t('common.buttons.cancel')}
					</Button>
					<Button type="submit" dot={false} loading={saving}>
						{t('promoForm.save')}
					</Button>
				</div>
			</form>
		</Dialog>
	);
}

function DeletePromoDialog({ promo, onClose }: { promo: Promo | null; onClose: () => void }) {
	const shop = useCurrentShop();
	const remove = useDeletePromo(shop.id);
	const toast = useToast();
	const name = promo?.name ?? '';
	return (
		<Dialog
			open={Boolean(promo)}
			onClose={onClose}
			title={t('promos.deleteTitle', { name })}
			description={t('promos.deleteBody')}
			footer={
				<>
					<Button variant="outline" onClick={onClose}>
						{t('common.buttons.cancel')}
					</Button>
					<Button
						variant="danger"
						dot={false}
						loading={remove.isPending}
						onClick={() =>
							promo &&
							remove.mutate(promo.id, {
								onSuccess: () => {
									toast(t('promos.deleted', { name }));
									onClose();
								},
								onError: (failure) => toast(errorText(failure))
							})
						}
					>
						{t('promos.delete')}
					</Button>
				</>
			}
		/>
	);
}
