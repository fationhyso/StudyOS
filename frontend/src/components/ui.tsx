import { BookOpen, Loader2, X } from 'lucide-react';
import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { cn } from '../lib/utils';

export function Logo({ compact = false, className = '' }: { compact?: boolean; className?: string }) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <span className="relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-[11px] bg-gradient-to-b from-[#6a9878] to-accent text-white shadow-[inset_0_1px_0_rgb(255_255_255/.35),0_4px_12px_-4px_rgb(46_88_62/.6)]"><BookOpen size={17} strokeWidth={2.2} /></span>
      {!compact && <span className="text-[17px] font-bold tracking-[-0.035em]">StudyOS</span>}
    </div>
  );
}

export function Spinner({ className = '' }: { className?: string }) {
  return <Loader2 size={18} className={cn('animate-spin', className)} aria-label="Loading" />;
}

export function LoadingScreen() {
  return <div className="flex min-h-[50vh] items-center justify-center"><div className="glass flex items-center gap-2.5 rounded-full px-4 py-2.5 text-sm text-muted"><Spinner /> Preparing your workspace…</div></div>;
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  loading?: boolean;
  icon?: ReactNode;
};

export function Button({ variant = 'primary', loading, icon, className, children, disabled, ...props }: ButtonProps) {
  const styles = {
    primary: 'bg-gradient-to-b from-[#5b8a69] to-accent text-white shadow-[inset_0_1px_0_rgb(255_255_255/.28),0_6px_16px_-6px_rgb(46_88_62/.55)] hover:from-accent hover:to-accent-hover',
    secondary: 'glass text-ink hover:bg-raised',
    ghost: 'text-muted hover:bg-canvas hover:text-ink',
    danger: 'bg-gradient-to-b from-red-500 to-red-600 text-white shadow-[inset_0_1px_0_rgb(255_255_255/.25),0_6px_16px_-6px_rgb(185_28_28/.5)] hover:to-red-700',
  };
  return (
    <button className={cn('inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition active:scale-[.98] disabled:pointer-events-none disabled:opacity-50', styles[variant], className)} disabled={disabled || loading} {...props}>
      {loading ? <Spinner /> : icon}{children}
    </button>
  );
}

export function Modal({ title, description, onClose, children, wide = false }: { title: string; description?: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const panel = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const timer = window.setTimeout(() => panel.current?.querySelector<HTMLElement>('input[autofocus], textarea[autofocus], input, textarea, select, button')?.focus(), 30);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeRef.current();
      if (event.key === 'Tab' && panel.current) {
        const focusable = Array.from(panel.current.querySelectorAll<HTMLElement>('button, input, textarea, select, a[href], [tabindex="0"]')).filter((element) => !element.hasAttribute('disabled'));
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(timer);
      document.body.style.overflow = oldOverflow;
      document.removeEventListener('keydown', onKey);
      previous?.focus();
    };
  }, []);
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[rgb(var(--shade)/.22)] p-0 backdrop-blur-[6px] animate-fade-in sm:items-center sm:p-5" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={panel} role="dialog" aria-modal="true" aria-labelledby="modal-title" className={cn('glass-raised max-h-[92vh] w-full overflow-y-auto rounded-t-[26px] animate-slide-up sm:rounded-[24px]', wide ? 'max-w-2xl' : 'max-w-lg')}>
        <div className="flex items-start justify-between px-6 pb-2 pt-6">
          <div><h2 id="modal-title" className="text-lg font-semibold tracking-[-.025em]">{title}</h2>{description && <p className="mt-1 text-sm leading-5 text-muted">{description}</p>}</div>
          <button className="icon-btn -mr-2 -mt-1" onClick={onClose} aria-label="Close dialog"><X size={19} /></button>
        </div>
        <div className="px-6 pb-6 pt-4">{children}</div>
      </div>
    </div>, document.body,
  );
}

export function EmptyState({ icon, title, description, action }: { icon: ReactNode; title: string; description: string; action?: ReactNode }) {
  return (
    <div className="flex min-h-56 flex-col items-center justify-center px-6 py-10 text-center">
      <div className="glass mb-4 flex h-12 w-12 items-center justify-center rounded-2xl text-accent">{icon}</div>
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="mt-1.5 max-w-sm text-sm leading-6 text-muted">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Markdown({ children, className = '' }: { children: string; className?: string }) {
  return <div className={cn('markdown-body', className)}><ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[[rehypeKatex, { trust: false, strict: false }]]}>{children}</ReactMarkdown></div>;
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-[20px] bg-surface/70', className)} />;
}
