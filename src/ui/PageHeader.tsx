import { useEffect, type ReactNode } from 'react';
import { MapPin } from 'lucide-react';
import './PageHeader.css';

interface Props {
	/** A quiet line above the title. */
	kicker?: ReactNode;
	title: string;
	/** A picture shown before the title, such as the salon's logo. */
	mark?: ReactNode;
	/** One sentence on what the page is for, under the title. */
	description?: ReactNode;
	/** Where it is, shown under the title with a pin. */
	place?: ReactNode;
	actions?: ReactNode;
}

/** A page's title, which also names the browser tab. */
export function PageHeader({ kicker, title, mark, description, place, actions }: Props) {
	useEffect(() => {
		document.title = `${title} · BarberChat`;
	}, [title]);

	return (
		<header className="phead">
			<div className="phead-text">
				{kicker && <p className="phead-kicker">{kicker}</p>}
				<h1 className={`phead-title${mark ? ' phead-title--mark' : ''}`}>
					{mark && <span className="phead-mark">{mark}</span>}
					{title}
				</h1>
				{description && <p className="phead-desc">{description}</p>}
				{place && (
					<p className="phead-place">
						<MapPin aria-hidden />
						<span>{place}</span>
					</p>
				)}
			</div>
			{actions && <div className="phead-actions">{actions}</div>}
		</header>
	);
}
