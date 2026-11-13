import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { useShops, type ManagedShop } from '@/api/shops';

interface ShopState {
	shops: ManagedShop[];
	/** The salon being managed: the one chosen last, else the first. */
	shop: ManagedShop | null;
	select: (id: number) => void;
	isPending: boolean;
	error: unknown;
	retry: () => void;
}

const ShopContext = createContext<ShopState>({ shops: [], shop: null, select: () => {}, isPending: true, error: null, retry: () => {} });

const STORAGE_KEY = 'bc_shop';
const remembered = () => {
	try {
		return Number(localStorage.getItem(STORAGE_KEY)) || null;
	} catch {
		return null;
	}
};

export function ShopProvider({ children }: { children: ReactNode }) {
	const { data: shops = [], isPending, error, refetch } = useShops();
	const [id, setId] = useState<number | null>(remembered);
	const shop = shops.find((s) => s.id === id) ?? shops[0] ?? null;

	const select = useCallback((next: number) => {
		setId(next);
		try {
			localStorage.setItem(STORAGE_KEY, String(next));
		} catch {
			// private mode: the choice lasts for this visit
		}
	}, []);

	return <ShopContext.Provider value={{ shops, shop, select, isPending, error, retry: () => void refetch() }}>{children}</ShopContext.Provider>;
}

export const useShopContext = () => useContext(ShopContext);

/** For pages: the selected salon, which the shell guarantees is loaded. */
export function useCurrentShop() {
	const { shop } = useContext(ShopContext);
	if (!shop) throw new Error('useCurrentShop used outside a loaded shell');
	return shop;
}
