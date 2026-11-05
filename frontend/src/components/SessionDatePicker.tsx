import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { useRef, useState, type KeyboardEvent } from 'react';
import { addDays, addMonths, format, isSameMonth, isValid, parseISO, startOfMonth, startOfWeek } from 'date-fns';
import { cn, localDateString } from '../lib/utils';

export default function SessionDatePicker({ value, onChange, id = 'session-date' }: { value: string; onChange: (value: string) => void; id?: string }) {
  const selected = isValid(parseISO(value)) ? parseISO(value) : new Date();
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => startOfMonth(selected));
  const trigger = useRef<HTMLButtonElement>(null);
  const calendar = useRef<HTMLDivElement>(null);
  const first = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
  const close = () => { setOpen(false); trigger.current?.focus(); };
  const focusDay = (day: Date) => {
    setMonth(startOfMonth(day));
    requestAnimationFrame(() => calendar.current?.querySelector<HTMLButtonElement>(`[data-day="${localDateString(day)}"]`)?.focus());
  };
  const navigateDay = (event: KeyboardEvent<HTMLButtonElement>, day: Date) => {
    const offset = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[event.key];
    if (offset !== undefined) { event.preventDefault(); focusDay(addDays(day, offset)); }
    if (event.key === 'Home') { event.preventDefault(); focusDay(startOfWeek(day, { weekStartsOn: 1 })); }
    if (event.key === 'End') { event.preventDefault(); focusDay(addDays(startOfWeek(day, { weekStartsOn: 1 }), 6)); }
    if (event.key === 'PageUp' || event.key === 'PageDown') { event.preventDefault(); focusDay(addMonths(day, event.key === 'PageUp' ? -1 : 1)); }
  };
  return <div onKeyDown={event => { if (open && event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); } }}>
    <button ref={trigger} id={id} type="button" aria-expanded={open} aria-controls={`${id}-calendar`} onClick={() => { setMonth(startOfMonth(selected)); setOpen(current => !current); if (!open) requestAnimationFrame(() => calendar.current?.querySelector<HTMLButtonElement>(`[data-day="${value}"]`)?.focus()); }} className="flex h-11 w-full items-center gap-2 rounded-xl border border-line bg-surface px-3 text-left text-sm transition hover:border-accent/50">
      <CalendarDays size={16} className="shrink-0 text-accent" /><span className="min-w-0 flex-1 truncate">{format(selected, 'EEE, d MMM yyyy')}</span><ChevronDown size={14} className={cn('shrink-0 text-muted transition', open && 'rotate-180')} />
    </button>
    {open && <div ref={calendar} id={`${id}-calendar`} role="group" aria-label="Choose date" className="mt-2 rounded-xl border border-line bg-surface p-2">
      <div className="mb-2 flex items-center justify-between"><button type="button" className="icon-btn h-8 w-8" aria-label="Previous month" onClick={() => setMonth(current => addMonths(current, -1))}><ChevronLeft size={15} /></button><span aria-live="polite" className="text-xs font-semibold">{format(month, 'MMMM yyyy')}</span><button type="button" className="icon-btn h-8 w-8" aria-label="Next month" onClick={() => setMonth(current => addMonths(current, 1))}><ChevronRight size={15} /></button></div>
      <div className="grid grid-cols-7 gap-0.5">{['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map(day => <span key={day} aria-hidden="true" className="py-1 text-center text-[10px] text-muted">{day}</span>)}
        {Array.from({ length: 42 }, (_, index) => addDays(first, index)).map(day => {
          const key = localDateString(day);
          return <button key={key} data-day={key} type="button" aria-label={format(day, 'EEEE, d MMMM yyyy')} aria-pressed={key === value} aria-current={key === localDateString() ? 'date' : undefined} onKeyDown={event => navigateDay(event, day)} onClick={() => { onChange(key); close(); }} className={cn('flex h-8 items-center justify-center rounded-lg text-xs transition', key === value ? 'bg-accent font-semibold text-white' : isSameMonth(day, month) ? 'text-ink hover:bg-canvas' : 'text-muted/60 hover:bg-canvas', key === localDateString() && key !== value && 'ring-1 ring-inset ring-accent/50')}>{format(day, 'd')}</button>;
        })}
      </div>
    </div>}
  </div>;
}
