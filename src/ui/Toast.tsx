import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { Check } from 'lucide-react';
import './Toast.css';

type Toast = { id: number; text: string };
const Ctx = createContext<(text: string) => void>(() => {});
export const useToast = () => useContext(Ctx);

let seq = 0;
export function ToastProvider({ children }: { children: ReactNode }) {
	const [toasts, setToasts] = useState<Toast[]>([]);
	const push = useCallback((text: string) => {
		const id = ++seq;
		setToasts((t) => [...t.slice(-2), { id, text }]);
		setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3600);
	}, []);
	return (
		<Ctx.Provider value={push}>
			{children}
			<div className="toasts" role="status" aria-live="polite">
				{toasts.map((t) => (
					<p key={t.id} className="toast">
						<Check aria-hidden />
						{t.text}
					</p>
				))}
			</div>
		</Ctx.Provider>
	);
}
