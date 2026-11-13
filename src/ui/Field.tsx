import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import './Field.css';

interface FieldProps {
	label: ReactNode;
	hint?: ReactNode;
	error?: string | null;
	className?: string;
	children: (ids: { id: string; describedBy?: string; invalid: boolean }) => ReactNode;
}

/** Label, control, then a hint or the error that replaces it. */
export function Field({ label, hint, error, className = '', children }: FieldProps) {
	const id = useId();
	const msgId = `${id}-msg`;
	const hasMsg = Boolean(error || hint);
	return (
		<div className={`field ${className}`}>
			<label htmlFor={id} className="field-label">
				{label}
			</label>
			{children({ id, describedBy: hasMsg ? msgId : undefined, invalid: Boolean(error) })}
			{hasMsg && (
				<p id={msgId} className={error ? 'field-error' : 'field-hint'} role={error ? 'alert' : undefined}>
					{error || hint}
				</p>
			)}
		</div>
	);
}

export const Input = ({ className = '', ...p }: InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={`control ${className}`} />;
export const Select = ({ className = '', ...p }: SelectHTMLAttributes<HTMLSelectElement>) => (
	<select {...p} className={`control control--select ${className}`} />
);
export const Textarea = ({ className = '', ...p }: TextareaHTMLAttributes<HTMLTextAreaElement>) => (
	<textarea {...p} className={`control control--area ${className}`} />
);
