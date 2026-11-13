import { useCallback, useId, useState } from 'react';
import { Link } from 'react-router';
import { Check, ChevronsUpDown } from 'lucide-react';
import { mediaUrl } from '@/api/http';
import type { ManagedShop } from '@/api/shops';
import { t, tMaybe } from '@/i18n';
import { initials } from '@/lib/format';
import { useToast } from '@/ui/Toast';
import { useDismiss } from '@/ui/useDismiss';
import { useShopContext } from './shop-context';

export const shopKind = (shop: ManagedShop) => (shop.shop_type ? tMaybe(`salonType.${shop.shop_type}`, shop.shop_type_display ?? '') : (shop.shop_type_display ?? ''));

export function ShopMark({ shop }: { shop: Pick<ManagedShop, 'name' | 'logo'> }) {
	const logo = mediaUrl(shop.logo);
	return <span className="shop-mark">{logo ? <img src={logo} alt="" /> : initials(shop.name)}</span>;
}

/** The salon being managed, and the way to another one. */
export function ShopSwitcher({ compact }: { compact?: boolean }) {
	const { shops, shop, select } = useShopContext();
	const [open, setOpen] = useState(false);
	const close = useCallback(() => setOpen(false), []);
	const ref = useDismiss<HTMLDivElement>(open, close);
	const menuId = useId();
	const toast = useToast();

	if (!shop) return null;
	return (
		<div className={`shop${compact ? ' shop--compact' : ''}`} ref={ref}>
			<button type="button" className="shop-btn" aria-expanded={open} aria-controls={menuId} aria-label={`${shop.name}. ${t('shell.switchSalon')}`} onClick={() => setOpen((shown) => !shown)}>
				<ShopMark shop={shop} />
				<span className="shop-name">
					<b>{shop.name}</b>
				</span>
				<ChevronsUpDown aria-hidden className="shop-chev" />
			</button>
			{open && (
				<div className="menu shop-menu" id={menuId}>
					<p className="menu-label">{t('shell.yourSalons')}</p>
					{shops.map((other) => (
						<button
							key={other.id}
							type="button"
							className="menu-item"
							aria-current={other.id === shop.id ? 'true' : undefined}
							onClick={() => {
								close();
								if (other.id === shop.id) return;
								select(other.id);
								toast(t('shell.switchedSalon', { name: other.name }));
							}}
						>
							<ShopMark shop={other} />
							<span className="shop-name">
								<b>{other.name}</b>
								<span>{shopKind(other)}</span>
							</span>
							{other.id === shop.id && <Check aria-hidden className="menu-check" />}
						</button>
					))}
					<div className="menu-foot">
						<Link to="/salons" className="menu-item" onClick={close}>
							{t('shell.allSalons')}
						</Link>
						<Link to="/salon/nouveau" className="menu-item" onClick={close}>
							{t('shop.createShop')}
						</Link>
					</div>
				</div>
			)}
		</div>
	);
}
