import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { LoaderCircle } from 'lucide-react';
import './Button.css';

type Variant = 'ink' | 'outline' | 'quiet' | 'danger' | 'white';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
	variant?: Variant;
	size?: 'md' | 'sm';
	/** The site's pill dot. On by default for the black pill. */
	dot?: boolean;
	icon?: ReactNode;
	iconAfter?: ReactNode;
	loading?: boolean;
}

export function Button({ variant = 'ink', size = 'md', dot, icon, iconAfter, loading, className = '', children, disabled, ...rest }: Props) {
	const withDot = dot ?? (variant === 'ink' && !icon);
	return (
		<button
			type="button"
			{...rest}
			disabled={disabled || loading}
			aria-busy={loading || undefined}
			className={`btn btn--${variant} btn--${size}${withDot ? ' btn--dot' : ''} ${className}`}
		>
			{loading ? <LoaderCircle className="btn-spin" aria-hidden /> : icon}
			{children}
			{iconAfter && <span className="btn-after">{iconAfter}</span>}
		</button>
	);
}

export function IconButton({ label, children, className = '', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
	return (
		<button type="button" aria-label={label} title={label} {...rest} className={`icon-btn ${className}`}>
			{children}
		</button>
	);
}
