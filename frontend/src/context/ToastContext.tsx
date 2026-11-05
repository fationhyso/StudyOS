import { CheckCircle2, CircleAlert, Info, X } from 'lucide-react';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

type ToastKind = 'success' | 'error' | 'info';
interface ToastItem { id: number; message: string; kind: ToastKind }
const ToastContext = createContext<{ toast: (message: string, kind?: ToastKind) => void } | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const dismiss = useCallback((id: number) => setItems((current) => current.filter((item) => item.id !== id)), []);
  const toast = useCallback((message: string, kind: ToastKind = 'success') => {
    const id = Date.now() + Math.random();
    setItems((current) => [...current.slice(-2), { id, message, kind }]);
    window.setTimeout(() => dismiss(id), 4500);
  }, [dismiss]);
  const value = useMemo(() => ({ toast }), [toast]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-5 right-5 z-[100] flex w-[min(380px,calc(100vw-40px))] flex-col gap-2" aria-live="polite">
        {items.map((item) => (
          <div key={item.id} className="pointer-events-auto flex items-start gap-3 rounded-xl border border-line bg-surface p-3.5 text-sm text-ink shadow-float animate-slide-up">
            {item.kind === 'success' ? <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-600" /> : item.kind === 'error' ? <CircleAlert size={18} className="mt-0.5 shrink-0 text-red-500" /> : <Info size={18} className="mt-0.5 shrink-0 text-blue-500" />}
            <span className="flex-1 leading-5">{item.message}</span>
            <button className="rounded p-0.5 text-muted hover:bg-canvas hover:text-ink" onClick={() => dismiss(item.id)} aria-label="Dismiss notification"><X size={15} /></button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within ToastProvider');
  return context;
}
