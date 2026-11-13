import { useEffect, useMemo, useState } from 'react';
import { SHOP_TYPES, useSaveAgenda, useUpdateShop, type AgendaDay, type ShopDetails, type ShopFields, type ShopType } from '@/api/shops';
import { neighborhoodCode } from '@/lib/neighborhoods';

export type Draft = Required<Omit<ShopFields, 'logo' | 'cover_image'>> & { logo?: File; cover_image?: File };
export type Errors = Partial<Record<keyof Draft | `day${number}`, string>>;
export const DESCRIPTION_MAX = 300;

/** The salon's price range: its code when the backend sends it, else read from the English label. */
function shopType(s: ShopDetails): ShopType {
	if (s.shop_type && SHOP_TYPES.includes(s.shop_type)) return s.shop_type;
	const label = (s.shop_type_display ?? '').toLowerCase();
	return label.includes('premium') ? 'premium' : label.includes('high') ? 'high_range' : label.includes('mid') ? 'mid_range' : 'budget';
}

const fromShop = (s: ShopDetails): Draft => ({
	name: s.name,
	description: s.description ?? '',
	shop_type: shopType(s),
	address: s.address ?? '',
	city: s.city ?? '',
	neighborhood: neighborhoodCode(s.neighborhood),
	postal_code: s.postal_code ?? '',
	latitude: s.latitude ?? '',
	longitude: s.longitude ?? '',
	google_maps_url: s.google_maps_url ?? '',
	phone: s.phone ?? '',
	email: s.email ?? ''
});

/** Only the presentation is the salon's to change; the rest is locked and shown as it is. */
export function validate(d: Draft): Errors {
	const e: Errors = {};
	if (d.description.length > DESCRIPTION_MAX) e.description = `${DESCRIPTION_MAX} caractères au plus.`;
	return e;
}

/** The salon's editable state: profile, address and hours, saved together. */
export function useShopForm(shop: ShopDetails | undefined, agenda: AgendaDay[] | undefined) {
	const [draft, setDraft] = useState<Draft | null>(null);
	const [days, setDays] = useState<AgendaDay[] | null>(null);
	const [showErrors, setShowErrors] = useState(false);
	const update = useUpdateShop(shop?.id ?? 0);
	const saveAgenda = useSaveAgenda(shop?.id ?? 0);

	// (re)start from the server whenever it changes and nothing is being edited
	useEffect(() => {
		if (shop) setDraft(fromShop(shop));
	}, [shop]);
	useEffect(() => {
		if (agenda) setDays(agenda.map((d) => ({ ...d })));
	}, [agenda]);

	const base = useMemo(() => (shop ? fromShop(shop) : null), [shop]);
	const changedFields = useMemo(() => {
		if (!draft || !base) return {} as Partial<Draft>;
		const out: Partial<Draft> = {};
		for (const k of Object.keys(draft) as (keyof Draft)[]) if (draft[k] !== base[k]) (out as Record<string, unknown>)[k] = draft[k];
		return out;
	}, [draft, base]);
	const changedDays = useMemo(
		() =>
			(days ?? []).filter((d) => {
				const o = agenda?.find((x) => x.weekday === d.weekday);
				return o && (o.opening_time !== d.opening_time || o.closing_time !== d.closing_time || o.is_closed !== d.is_closed);
			}),
		[days, agenda]
	);

	const errors = draft && days ? validate(draft) : {};
	const dirty = Object.keys(changedFields).length > 0 || changedDays.length > 0;

	return {
		draft,
		days,
		errors: showErrors ? errors : ({} as Errors),
		allErrors: errors,
		dirty,
		saving: update.isPending || saveAgenda.isPending,
		failed: update.isError || saveAgenda.isError,
		set: <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d)),
		setDay: (weekday: number, patch: Partial<AgendaDay>) => setDays((ds) => ds && ds.map((d) => (d.weekday === weekday ? { ...d, ...patch } : d))),
		setDays,
		reset: () => {
			if (shop) setDraft(fromShop(shop));
			if (agenda) setDays(agenda.map((d) => ({ ...d })));
			setShowErrors(false);
		},
		/** Returns the first field in error, or null once saved. */
		async save(): Promise<string | null> {
			setShowErrors(true);
			const first = Object.keys(errors)[0];
			if (first) return first;
			// the update replaces the salon's fields: send them all, and the images only when changed
			if (draft && Object.keys(changedFields).length) {
				const { logo, cover_image, ...fields } = draft;
				await update.mutateAsync({ ...fields, ...(logo ? { logo } : {}), ...(cover_image ? { cover_image } : {}) });
			}
			if (changedDays.length) await saveAgenda.mutateAsync(changedDays);
			setShowErrors(false);
			return null;
		}
	};
}
