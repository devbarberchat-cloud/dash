import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { t } from '@/i18n';
import { IconButton } from './Button';
import './Dialog.css';

interface Props {
	open: boolean;
	onClose: () => void;
	title: ReactNode;
	description?: ReactNode;
	children?: ReactNode;
	footer?: ReactNode;
	/** 'center' for decisions, 'side' for details (a sheet from the right; from the bottom on phones). */
	placement?: 'center' | 'side';
	header?: ReactNode;
}

/** Native <dialog>: focus trap, Escape and the top layer come with it. */
export function Dialog({ open, onClose, title, description, children, footer, placement = 'center', header }: Props) {
	const ref = useRef<HTMLDialogElement>(null);
	const titleId = useId();
	// closing because `open` went false is not the user closing it
	const wanted = useRef(open);
	wanted.current = open;
	useEffect(() => {
		const d = ref.current;
		if (!d) return;
		if (open && !d.open) d.showModal();
		if (!open && d.open) d.close();
	}, [open]);

	return (
		<dialog
			ref={ref}
			className={`dialog dialog--${placement}`}
			onClose={() => wanted.current && onClose()}
			onCancel={(e) => {
				e.preventDefault();
				onClose();
			}}
			onClick={(e) => e.target === ref.current && onClose()}
			aria-labelledby={titleId}
		>
			{open && (
				<div className="dialog-panel">
					{header}
					<div className="dialog-head">
						<div>
							<h2 id={titleId} className="dialog-title">
								{title}
							</h2>
							{description && <p className="dialog-desc">{description}</p>}
						</div>
						<IconButton label={t('common.buttons.close')} onClick={onClose} className="dialog-close">
							<X />
						</IconButton>
					</div>
					{children && <div className="dialog-body">{children}</div>}
					{footer && <div className="dialog-foot">{footer}</div>}
				</div>
			)}
		</dialog>
	);
}
