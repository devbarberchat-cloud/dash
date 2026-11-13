// From schema/forms.ts (CasablancaNeighborhood + labels).
export const NEIGHBORHOODS: readonly (readonly [string, string])[] = [
	['AIN_CHOCK', 'Aïn Chock'], ['AIN_DIAB', 'Aïn Diab'], ['AIN_SEBAA', 'Aïn Sebaâ'], ['ALMAZ', 'Almaz'],
	['BACHKOU', 'Bachkou'], ['BEAUSEJOUR', 'Beauséjour'], ['BELVEDERE', 'Belvédère'], ['BOURGOGNE', 'Bourgogne'],
	['BOURNAZEL', 'Bournazel'], ['BOULEVARD_GHANDI', 'Bd Ghandi'], ['CALIFORNIE', 'Californie'],
	['DERB_GHALLEF', 'Derb Ghallef'], ['DERB_OMAR', 'Derb Omar'], ['DERB_SULTAN', 'Derb Sultan'],
	['GAUTHIER', 'Gauthier'], ['HAY_HASSANI', 'Hay Hassani'], ['HAY_MOHAMMADI', 'Hay Mohammadi'],
	['HAY_MOULAY_RACHID', 'Moulay Rachid'], ['INARA', 'Inara'], ['JNANE_CALIFORNIE', 'Jn Californie'],
	['LA_GIRONDE', 'La Gironde'], ['LISSASFA', 'Lissasfa'], ['MAARIF', 'Maârif'], ['MANDARONA', 'Mandarona'],
	['MERS_SULTAN', 'Mers Sultan'], ['OASIS', 'Oasis'], ['OULFA', 'Oulfa'], ['PALMIERS', 'Palmiers'],
	['QODS', 'Qods'], ['QUARTIER_BD_HASSAN_II', 'Bd Hassan II'], ['QUARTIER_DES_HOPITAUX', 'Les Hôpitaux'],
	['RACINE', 'Racine'], ['ROCHES_NOIRES', 'Roches Noires'], ['SBATA', 'Sbata'],
	['SIDI_BERNOUSSI', 'Sidi Bernoussi'], ['SIDI_MAAROUF', 'Sidi Maârouf'], ['SIDI_MOUMEN', 'Sidi Moumen'],
	['SIDI_OTHMANE', 'Sidi Othman'], ['VAL_FLEURI', 'Val Fleuri'], ['TWO_MARS', '2 Mars']
];

export const neighborhoodLabel = (key?: string) => NEIGHBORHOODS.find(([k]) => k === key)?.[1] ?? '';

export const SHOP_TYPES = [
	{ value: 'budget', label: 'Économique' },
	{ value: 'mid_range', label: 'Intermédiaire' },
	{ value: 'high_range', label: 'Haut de gamme' },
	{ value: 'premium', label: 'Premium' }
] as const;

/** The backend answers with a neighbourhood's label; forms send its code. */
export const neighborhoodCode = (value?: string) => NEIGHBORHOODS.find(([key, label]) => key === value || label === value)?.[0] ?? '';
