import {
  CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, Circle,
  GripVertical, LayoutGrid, List, Plus, Sparkles,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type DragEvent } from 'react';
import { addDays, eachDayOfInterval, endOfWeek, format, isSameDay, parseISO, startOfWeek } from 'date-fns';
import { useSearchParams } from 'react-router-dom';
import ScheduleGenerator from '../components/ScheduleGenerator';
import SessionModal from '../components/SessionModal';
import { Button, EmptyState } from '../components/ui';
import { useToast } from '../context/ToastContext';
import { api } from '../lib/api';
import { cn, formatMinutes, formatTime, localDateString, sessionColors } from '../lib/utils';
import type { StudyDocument, StudySession } from '../types';

function SessionCard({ session, onEdit, onToggle }: { session: StudySession; onEdit: () => void; onToggle: () => void }) {
  return (
    <div draggable onDragStart={(event) => { event.dataTransfer.setData('text/study-session', String(session.id)); event.dataTransfer.effectAllowed = 'move'; }} onClick={onEdit} className={cn('group relative cursor-grab rounded-lg border border-line border-l-[3px] p-2.5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md active:cursor-grabbing', sessionColors[session.topic] || sessionColors.study, session.completed && 'opacity-55 saturate-50')}>
      <div className="flex items-start gap-1.5">
        <GripVertical size={12} className="mt-0.5 shrink-0 opacity-0 transition group-hover:opacity-40" />
        <div className="min-w-0 flex-1"><p className={cn('line-clamp-2 text-[11px] font-semibold leading-4', session.completed && 'line-through')}>{session.title}</p><p className="mt-1.5 text-[10px] opacity-65">{formatTime(session.start_minutes)} · {formatMinutes(session.duration_minutes)}</p></div>
        <button onClick={(event) => { event.stopPropagation(); onToggle(); }} className="shrink-0 rounded-full opacity-60 transition hover:scale-110 hover:opacity-100" aria-label={session.completed ? 'Mark incomplete' : 'Mark complete'}>{session.completed ? <span className="flex h-4 w-4 items-center justify-center rounded-full bg-accent text-white"><Check size={10} strokeWidth={3} /></span> : <Circle size={15} />}</button>
      </div>
    </div>
  );
}

export default function Schedule() {
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [anchor, setAnchor] = useState(new Date());
  const [sessions, setSessions] = useState<StudySession[]>([]);
  const [documents, setDocuments] = useState<StudyDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'week' | 'agenda'>('week');
  const [generatorOpen, setGeneratorOpen] = useState(searchParams.get('generate') === '1');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<StudySession | null>(null);
  const [initialDate, setInitialDate] = useState<string>();
  const [dragOver, setDragOver] = useState<string | null>(null);

  const start = startOfWeek(anchor, { weekStartsOn: 1 });
  const end = endOfWeek(anchor, { weekStartsOn: 1 });
  const days = useMemo(() => eachDayOfInterval({ start, end }), [start.toISOString(), end.toISOString()]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setSessions(await api<StudySession[]>(`/schedule?start=${format(start, 'yyyy-MM-dd')}&end=${format(end, 'yyyy-MM-dd')}`));
    } catch (error) { toast(error instanceof Error ? error.message : 'Could not load schedule', 'error'); }
    finally { setLoading(false); }
  }, [format(start, 'yyyy-MM-dd'), format(end, 'yyyy-MM-dd'), toast]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { api<StudyDocument[]>('/documents').then(setDocuments).catch(() => {}); }, []);

  const openCreate = (date?: string) => { setEditing(null); setInitialDate(date || localDateString(anchor)); setModalOpen(true); };
  const openEdit = (session: StudySession) => { setEditing(session); setInitialDate(undefined); setModalOpen(true); };
  const closeGenerator = () => { setGeneratorOpen(false); if (searchParams.has('generate')) setSearchParams({}); };

  const updateSession = async (session: StudySession, changes: object, message?: string) => {
    try {
      const updated = await api<StudySession>(`/schedule/${session.id}`, { method: 'PATCH', body: JSON.stringify(changes) });
      setSessions((current) => current.map((item) => item.id === updated.id ? updated : item));
      if (message) toast(message);
    } catch (error) { toast(error instanceof Error ? error.message : 'Could not update session', 'error'); load(); }
  };

  const dropSession = (event: DragEvent, date: string) => {
    event.preventDefault();
    setDragOver(null);
    const id = Number(event.dataTransfer.getData('text/study-session'));
    const session = sessions.find((item) => item.id === id);
    if (session && session.date !== date) updateSession(session, { date }, `Moved to ${format(parseISO(date), 'EEEE, MMM d')}`);
  };

  const totalMinutes = sessions.reduce((sum, session) => sum + session.duration_minutes, 0);
  const completedMinutes = sessions.filter((session) => session.completed).reduce((sum, session) => sum + session.duration_minutes, 0);

  return (
    <div className="flex min-h-full flex-col p-4 sm:p-6 lg:p-8">
      <section className="mb-5 flex flex-col justify-between gap-4 xl:flex-row xl:items-center">
        <div><h2 className="text-2xl font-semibold tracking-[-.04em]">{format(start, 'MMM d')} – {format(end, start.getMonth() === end.getMonth() ? 'd, yyyy' : 'MMM d, yyyy')}</h2><p className="mt-1 text-xs text-muted">{sessions.length} sessions · {formatMinutes(totalMinutes)} planned{completedMinutes > 0 && ` · ${formatMinutes(completedMinutes)} focused`}</p></div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex h-10 items-center rounded-xl border border-line bg-surface p-1 shadow-sm"><button className="icon-btn h-8 w-8" onClick={() => setAnchor(addDays(anchor, -7))} aria-label="Previous week"><ChevronLeft size={17} /></button><button className="h-8 rounded-lg px-2.5 text-xs font-semibold text-muted transition hover:bg-canvas hover:text-ink" onClick={() => setAnchor(new Date())}>Today</button><button className="icon-btn h-8 w-8" onClick={() => setAnchor(addDays(anchor, 7))} aria-label="Next week"><ChevronRight size={17} /></button></div>
          <div className="hidden h-10 items-center rounded-xl border border-line bg-surface p-1 sm:flex"><button onClick={() => setView('week')} className={cn('flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium', view === 'week' ? 'bg-canvas text-ink shadow-sm' : 'text-muted')}><LayoutGrid size={14} />Week</button><button onClick={() => setView('agenda')} className={cn('flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium', view === 'agenda' ? 'bg-canvas text-ink shadow-sm' : 'text-muted')}><List size={14} />Agenda</button></div>
          <Button variant="secondary" onClick={() => openCreate()} icon={<Plus size={16} />}><span className="hidden sm:inline">Add session</span></Button>
          <Button onClick={() => setGeneratorOpen(true)} icon={<Sparkles size={16} />}>Generate plan<ChevronDown size={14} className="hidden sm:block" /></Button>
        </div>
      </section>

      <div className="card min-h-[560px] flex-1 overflow-hidden">
        {view === 'week' ? (
          <div className="subtle-scrollbar h-full overflow-x-auto">
            <div className="grid min-w-[960px] grid-cols-7 divide-x divide-line">
              {days.map((day) => {
                const date = localDateString(day);
                const daySessions = sessions.filter((session) => session.date === date);
                const today = isSameDay(day, new Date());
                return <section key={date} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setDragOver(date); }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragOver(null); }} onDrop={(event) => dropSession(event, date)} className={cn('flex min-h-[560px] min-w-0 flex-col transition-colors', dragOver === date && 'bg-accent-soft/60 dark:bg-accent-dark/20')}>
                  <header className={cn('border-b border-line px-3 py-4 text-center', today && 'bg-accent-soft/50 dark:bg-accent-dark/20')}><p className={cn('text-[10px] font-semibold uppercase tracking-[.12em]', today ? 'text-accent' : 'text-muted')}>{format(day, 'EEE')}</p><div className={cn('mx-auto mt-1 flex h-8 w-8 items-center justify-center rounded-full text-lg font-medium', today && 'bg-accent text-white')}>{format(day, 'd')}</div></header>
                  <div className="flex-1 space-y-2 p-2">{daySessions.map((session) => <SessionCard key={session.id} session={session} onEdit={() => openEdit(session)} onToggle={() => updateSession(session, { completed: !session.completed }, !session.completed ? 'Session complete. Keep going!' : undefined)} />)}{!daySessions.length && !loading && <button onClick={() => openCreate(date)} className="mt-3 flex w-full flex-col items-center rounded-xl border border-dashed border-line py-5 text-muted/60 transition hover:border-accent/40 hover:text-accent"><Plus size={16} /><span className="mt-1 text-[10px]">Add session</span></button>}</div>
                  <footer className="p-2"><button onClick={() => openCreate(date)} className="flex h-8 w-full items-center justify-center rounded-lg text-muted opacity-0 transition hover:bg-canvas hover:text-ink focus:opacity-100 group-hover:opacity-100" aria-label={`Add session on ${format(day, 'MMMM d')}`}><Plus size={14} /></button></footer>
                </section>;
              })}
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-4xl p-4 sm:p-7">
            {days.some((day) => sessions.some((session) => session.date === localDateString(day))) ? days.map((day) => {
              const date = localDateString(day);
              const daySessions = sessions.filter((session) => session.date === date);
              if (!daySessions.length) return null;
              return <section key={date} className="mb-7"><div className="mb-3 flex items-center gap-3"><h3 className={cn('text-xs font-semibold', isSameDay(day, new Date()) && 'text-accent')}>{isSameDay(day, new Date()) ? 'Today' : format(day, 'EEEE')} · {format(day, 'MMMM d')}</h3><span className="h-px flex-1 bg-line" /><span className="text-[10px] text-muted">{formatMinutes(daySessions.reduce((sum, session) => sum + session.duration_minutes, 0))}</span></div><div className="space-y-2">{daySessions.map((session) => <div key={session.id} onClick={() => openEdit(session)} className="group flex cursor-pointer gap-4 rounded-xl border border-line bg-surface p-4 transition hover:border-accent/30 hover:shadow-soft"><div className="w-16 shrink-0 text-xs font-medium text-muted">{formatTime(session.start_minutes)}</div><span className={cn('w-1 shrink-0 rounded-full', session.topic === 'review' ? 'bg-amber-500' : session.topic === 'practice' ? 'bg-violet-500' : 'bg-emerald-500')} /><div className="min-w-0 flex-1"><p className={cn('text-sm font-semibold', session.completed && 'line-through opacity-50')}>{session.title}</p>{session.notes && <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted">{session.notes}</p>}<p className="mt-2 text-[10px] capitalize text-muted">{session.topic} · {formatMinutes(session.duration_minutes)}</p></div><button className="icon-btn self-start" onClick={(event) => { event.stopPropagation(); updateSession(session, { completed: !session.completed }); }} aria-label="Toggle completion">{session.completed ? <Check size={17} className="text-accent" /> : <Circle size={17} />}</button></div>)}</div></section>;
            }) : <EmptyState icon={<CalendarDays size={23} />} title="A fresh week awaits" description="Add a session yourself or generate a thoughtful study plan from your course materials." action={<Button onClick={() => setGeneratorOpen(true)} icon={<Sparkles size={15} />}>Generate a study plan</Button>} />}
          </div>
        )}
      </div>
      <p className="mt-3 hidden items-center justify-center gap-1.5 text-[10px] text-muted lg:flex"><GripVertical size={12} />Drag any session to another day to reschedule it. Select a session to edit its details.</p>

      {generatorOpen && <ScheduleGenerator documents={documents} onClose={closeGenerator} onGenerated={load} />}
      {modalOpen && <SessionModal session={editing} initialDate={initialDate} documents={documents} onClose={() => setModalOpen(false)} onSaved={load} />}
    </div>
  );
}
