import { useCallback, useId, useState } from 'react';
import { Ellipsis } from 'lucide-react';
import { useDismiss } from './useDismiss';

export interface MenuAction {
	label: string;
	run: () => void;
}

/** The secondary actions of a row, behind one button. */
export function MoreMenu({ label, items }: { label: string; items: MenuAction[] }) {
	const [open, setOpen] = useState(false);
	const close = useCallback(() => setOpen(false), []);
	const ref = useDismiss<HTMLDivElement>(open, close);
	const id = useId();
	if (items.length === 0) return null;
	return (
		<div className="more" ref={ref}>
			<button type="button" className="icon-btn" aria-label={label} aria-expanded={open} aria-controls={id} onClick={() => setOpen((shown) => !shown)}>
				<Ellipsis aria-hidden />
			</button>
			{open && (
				<div className="menu" id={id}>
					{items.map((item) => (
						<button
							key={item.label}
							type="button"
							className="menu-item"
							onClick={() => {
								close();
								item.run();
							}}
						>
							{item.label}
						</button>
					))}
				</div>
			)}
		</div>
	);
}
