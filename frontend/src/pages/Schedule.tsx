import {
  AlertTriangle, ArrowRight, CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, Circle,
  GraduationCap, GripVertical, History, Keyboard, LayoutGrid, List, Plus, Sparkles,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { addDays, addMonths, differenceInCalendarDays, eachDayOfInterval, endOfMonth, endOfWeek, format, isValid, isSameDay, isSameMonth, parseISO, startOfMonth, startOfWeek } from 'date-fns';
import { Link, useSearchParams } from 'react-router-dom';
import ScheduleGenerator from '../components/ScheduleGenerator';
import SessionModal from '../components/SessionModal';
import { Button, EmptyState } from '../components/ui';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import { useExams, useExamPeriod, type Exam } from '../lib/exams';
import { api } from '../lib/api';
import { cn, formatMinutes, formatTime, localDateString, sessionColors } from '../lib/utils';
import type { StudyDocument, StudySession } from '../types';

function SessionCard({ session, overlaps, onEdit, onToggle }: { session: StudySession; overlaps: boolean; onEdit: () => void; onToggle: () => void }) {
  return (
    <div draggable onDragStart={(event) => { event.dataTransfer.setData('text/study-session', String(session.id)); event.dataTransfer.effectAllowed = 'move'; }} onClick={onEdit} className={cn('group relative cursor-grab rounded-lg border border-line border-l-[3px] p-2.5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md active:cursor-grabbing', sessionColors[session.topic] || sessionColors.study, session.completed && 'opacity-55 saturate-50', overlaps && !session.completed && 'ring-1 ring-amber-400')}>
      <div className="flex items-start gap-1.5">
        <GripVertical size={12} className="mt-0.5 shrink-0 opacity-0 transition group-hover:opacity-40" />
        <div className="min-w-0 flex-1"><p className={cn('line-clamp-2 text-[11px] font-semibold leading-4', session.completed && 'line-through')}>{session.title}</p><p className="mt-1.5 text-[10px] opacity-65">{formatTime(session.start_minutes)}–{formatTime(session.start_minutes + session.duration_minutes)}</p>{overlaps && !session.completed && <p className="mt-1 flex items-center gap-1 text-[9px] font-semibold text-amber-700 dark:text-amber-300"><AlertTriangle size={10} />Overlaps another session</p>}</div>
        <button onClick={(event) => { event.stopPropagation(); onToggle(); }} className="shrink-0 rounded-full opacity-60 transition hover:scale-110 hover:opacity-100" aria-label={session.completed ? 'Mark incomplete' : 'Mark complete'}>{session.completed ? <span className="flex h-4 w-4 items-center justify-center rounded-full bg-accent text-white"><Check size={10} strokeWidth={3} /></span> : <Circle size={15} />}</button>
      </div>
    </div>
  );
}

function ExamCard({ exam }: { exam: Exam }) {
  return <Link to={exam.id === 'exam-period-start' ? '/?examPeriod=1' : `/?exam=${encodeURIComponent(exam.id)}`}  className="flex min-w-0 items-start gap-2 rounded-lg border border-violet-200 border-l-[3px] border-l-violet-500 bg-violet-50 p-2.5 text-violet-950 transition hover:bg-violet-100 dark:border-violet-900 dark:bg-violet-950/30 dark:text-violet-100" title={`Edit exam: ${exam.name}`}>
    <GraduationCap size={15} className="mt-0.5 shrink-0" /><span className="min-w-0"><span className="block text-[9px] font-semibold uppercase tracking-wide opacity-70">Exam · All day</span><span className="mt-1 block break-words text-xs font-semibold">{exam.name}</span></span>
  </Link>;
}

type View = 'week' | 'month' | 'agenda';
const VIEW_KEY = 'studyos.schedule-view';
function initialView(): View {
  try { const saved = localStorage.getItem(VIEW_KEY); if (saved === 'week' || saved === 'month' || saved === 'agenda') return saved; } catch { /* use default */ }
  return window.innerWidth < 768 ? 'agenda' : 'week';
}

/** Sessions on one day sorted by start time, plus the ids of any whose times overlap. */
function dayPlan(sessions: StudySession[], date: string) {
  const list = sessions.filter(session => session.date === date).sort((a, b) => a.start_minutes - b.start_minutes);
  const overlapping = new Set<number>();
  list.forEach((session, index) => list.slice(index + 1).forEach(other => {
    if (other.start_minutes < session.start_minutes + session.duration_minutes) { overlapping.add(session.id); overlapping.add(other.id); }
  }));
  const planned = list.reduce((sum, session) => sum + session.duration_minutes, 0);
  const done = list.filter(session => session.completed).reduce((sum, session) => sum + session.duration_minutes, 0);
  return { list, overlapping, planned, done };
}

/** Earliest start today (from now, or 8:00 at the latest) that fits `duration` without overlapping `busy`. */
function nextFreeSlot(busy: { start_minutes: number; duration_minutes: number }[], duration: number) {
  const now = new Date();
  let start = Math.max(8 * 60, Math.ceil((now.getHours() * 60 + now.getMinutes()) / 15) * 15);
  for (const item of [...busy].sort((a, b) => a.start_minutes - b.start_minutes)) {
    if (start + duration <= item.start_minutes) break;
    start = Math.max(start, item.start_minutes + item.duration_minutes);
  }
  return start + duration <= 24 * 60 ? start : null;
}

export default function Schedule() {
  const { toast } = useToast();
  const { user } = useAuth();
  const { exams } = useExams(user?.id ?? 0);
  const { startDate: examPeriodStart } = useExamPeriod(user?.id ?? 0);
  const calendarExams = examPeriodStart ? [...exams, { id: 'exam-period-start', name: 'Exam period starts', date: examPeriodStart }] : exams;
  const [searchParams, setSearchParams] = useSearchParams();
  const loadSequence = useRef(0);
  const [anchor, setAnchor] = useState(() => { const value = searchParams.get('date'); return value && isValid(parseISO(value)) ? parseISO(value) : new Date(); });
  const handledSession = useRef<number | null>(null);
  const [sessions, setSessions] = useState<StudySession[]>([]);
  const [documents, setDocuments] = useState<StudyDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>(initialView);
  const [missed, setMissed] = useState<StudySession[]>([]);
  const [missedOpen, setMissedOpen] = useState(false);
  const [generatorOpen, setGeneratorOpen] = useState(searchParams.get('generate') === '1');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<StudySession | null>(null);
  const [initialDate, setInitialDate] = useState<string>();
  const [dragOver, setDragOver] = useState<string | null>(null);

  const start = startOfWeek(view === 'month' ? startOfMonth(anchor) : anchor, { weekStartsOn: 1 });
  const end = endOfWeek(view === 'month' ? endOfMonth(anchor) : anchor, { weekStartsOn: 1 });
  const days = useMemo(() => eachDayOfInterval({ start, end }), [start.toISOString(), end.toISOString()]);

  const load = useCallback(async () => {
    const request = ++loadSequence.current;
    setLoading(true);
    try {
      const result = await api<StudySession[]>(`/schedule?start=${format(start, 'yyyy-MM-dd')}&end=${format(end, 'yyyy-MM-dd')}`);
      if (request === loadSequence.current) setSessions(result);
    } catch (error) { if (request === loadSequence.current) toast(error instanceof Error ? error.message : 'Could not load schedule', 'error'); }
    finally { if (request === loadSequence.current) setLoading(false); }
  }, [format(start, 'yyyy-MM-dd'), format(end, 'yyyy-MM-dd'), toast]);

  const todayString = localDateString(new Date());
  const loadMissed = useCallback(async () => {
    try {
      const result = await api<StudySession[]>(`/schedule?start=${localDateString(addDays(new Date(), -14))}&end=${localDateString(addDays(new Date(), -1))}`);
      setMissed(result.filter(session => !session.completed).sort((a, b) => a.date.localeCompare(b.date) || a.start_minutes - b.start_minutes));
    } catch { /* The catch-up list is optional. */ }
  }, []);
  const refresh = useCallback(() => { load(); loadMissed(); }, [load, loadMissed]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadMissed(); }, [loadMissed]);
  useEffect(() => { try { localStorage.setItem(VIEW_KEY, view); } catch { /* not critical */ } }, [view]);
  useEffect(() => { api<StudyDocument[]>('/documents').then(setDocuments).catch(() => {}); }, []);

  const openCreate = (date?: string) => { setEditing(null); setInitialDate(date || localDateString(anchor)); setModalOpen(true); };
  const openEdit = (session: StudySession) => { setEditing(session); setInitialDate(undefined); setModalOpen(true); };
  useEffect(() => {
    const id = Number(searchParams.get('session'));
    if (!id || loading || handledSession.current === id) return;
    const session = sessions.find(item => item.id === id);
    if (session) { handledSession.current = id; openEdit(session); }
  }, [sessions, loading, searchParams]);
  const closeGenerator = () => { setGeneratorOpen(false); if (searchParams.has('generate')) setSearchParams({}); };

  const updateSession = async (session: StudySession, changes: object, message?: string) => {
    try {
      const updated = await api<StudySession>(`/schedule/${session.id}`, { method: 'PATCH', body: JSON.stringify(changes) });
      setSessions((current) => {
        const inRange = updated.date >= localDateString(start) && updated.date <= localDateString(end);
        const rest = current.filter((item) => item.id !== updated.id);
        return inRange ? [...rest, updated] : rest;
      });
      setMissed((current) => current.filter((item) => item.id !== updated.id || (!updated.completed && updated.date < todayString)));
      if (message) toast(message);
      return true;
    } catch (error) { toast(error instanceof Error ? error.message : 'Could not update session', 'error'); refresh(); return false; }
  };
  // Missed sessions go into today's next free time instead of keeping their old (possibly clashing) time.
  const moveToToday = async (list: StudySession[]) => {
    let busy: StudySession[] = [];
    try { busy = await api<StudySession[]>(`/schedule?start=${todayString}&end=${todayString}`); } catch { /* fall back to original times */ }
    let moved = 0;
    for (const session of list) {
      const start = nextFreeSlot(busy, session.duration_minutes);
      const changes = start === null ? { date: todayString } : { date: todayString, start_minutes: start };
      if (await updateSession(session, changes)) { moved++; busy = [...busy, { ...session, ...changes }]; }
    }
    if (moved) toast(moved === 1 ? `Moved to today at ${formatTime(busy[busy.length - 1].start_minutes)}` : `Moved ${moved} sessions into today's free time`);
    if (list.length > 1) setMissedOpen(false);
  };

  const shift = (direction: 1 | -1) => setAnchor(current => view === 'month' ? addMonths(current, direction) : addDays(current, 7 * direction));
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (modalOpen || generatorOpen || event.metaKey || event.ctrlKey || event.altKey || target.closest('input, textarea, select, [contenteditable="true"]')) return;
      const actions: Record<string, () => void> = {
        n: () => openCreate(), t: () => setAnchor(new Date()), w: () => setView('week'), m: () => setView('month'), a: () => setView('agenda'),
        ArrowLeft: () => shift(-1), ArrowRight: () => shift(1), j: () => shift(1), k: () => shift(-1),
      };
      const action = actions[event.key];
      if (action) { event.preventDefault(); action(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const dropSession = (event: DragEvent, date: string) => {
    event.preventDefault();
    setDragOver(null);
    const id = Number(event.dataTransfer.getData('text/study-session'));
    const session = sessions.find((item) => item.id === id);
    if (session && session.date !== date) updateSession(session, { date }, `Moved to ${format(parseISO(date), 'EEEE, MMM d')}`);
  };

  const periodSessions = view === 'month' ? sessions.filter(session => isSameMonth(parseISO(session.date), anchor)) : sessions;
  const periodExams = calendarExams.filter(exam => exam.date >= localDateString(start) && exam.date <= localDateString(end) && (view !== 'month' || isSameMonth(parseISO(exam.date), anchor)));
  const totalMinutes = periodSessions.reduce((sum, session) => sum + session.duration_minutes, 0);
  const completedMinutes = periodSessions.filter((session) => session.completed).reduce((sum, session) => sum + session.duration_minutes, 0);
  const progress = totalMinutes ? Math.round(completedMinutes / totalMinutes * 100) : 0;
  const nextExam = calendarExams.filter(exam => exam.date >= todayString).sort((a, b) => a.date.localeCompare(b.date))[0];
  const daysToExam = nextExam ? differenceInCalendarDays(parseISO(nextExam.date), new Date()) : 0;

  return (
    <div className="flex min-h-full flex-col p-4 sm:p-6 lg:p-8">
      <section className="mb-5 flex flex-col justify-between gap-4 xl:flex-row xl:items-center">
        <div><h2 className="text-2xl font-semibold tracking-[-.04em]">{view === 'month' ? format(anchor, 'MMMM yyyy') : `${format(start, 'MMM d')} – ${format(end, start.getMonth() === end.getMonth() ? 'd, yyyy' : 'MMM d, yyyy')}`}</h2><p className="mt-1 text-xs text-muted">{periodSessions.length} sessions · {periodExams.length} exams · {formatMinutes(totalMinutes)} planned{completedMinutes > 0 && ` · ${formatMinutes(completedMinutes)} focused`}</p>
          <div className="mt-2.5 flex flex-wrap items-center gap-3">
            {totalMinutes > 0 && <div className="flex items-center gap-2" title={`${formatMinutes(completedMinutes)} of ${formatMinutes(totalMinutes)} done`}><div className="h-1.5 w-32 overflow-hidden rounded-full bg-line"><div className="h-full rounded-full bg-accent transition-all" style={{ width: `${progress}%` }} /></div><span className="text-[11px] font-semibold tabular-nums text-muted">{progress}% done</span></div>}
            {nextExam && <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold', daysToExam <= 7 ? 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300' : 'bg-violet-50 text-violet-700 dark:bg-violet-950/30 dark:text-violet-200')}><GraduationCap size={12} />{nextExam.name} {daysToExam === 0 ? 'today' : daysToExam === 1 ? 'tomorrow' : `in ${daysToExam} days`}</span>}
          </div></div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex h-10 items-center rounded-xl border border-line bg-surface p-1 shadow-sm"><button className="icon-btn h-8 w-8" onClick={() => shift(-1)} aria-label={view === 'month' ? 'Previous month' : 'Previous week'}><ChevronLeft size={17} /></button><button className="h-8 rounded-lg px-2.5 text-xs font-semibold text-muted transition hover:bg-canvas hover:text-ink" onClick={() => setAnchor(new Date())}>Today</button><button className="icon-btn h-8 w-8" onClick={() => shift(1)} aria-label={view === 'month' ? 'Next month' : 'Next week'}><ChevronRight size={17} /></button></div>
          <div className="flex h-10 items-center rounded-xl border border-line bg-surface p-1"><button onClick={() => setView('week')} className={cn('flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium', view === 'week' ? 'bg-canvas text-ink shadow-sm' : 'text-muted')}><LayoutGrid size={14} />Week</button><button onClick={() => setView('month')} aria-pressed={view === 'month'} className={cn('flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium', view === 'month' ? 'bg-canvas text-ink shadow-sm' : 'text-muted')}><CalendarDays size={14} />Month</button><button onClick={() => setView('agenda')} className={cn('flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium', view === 'agenda' ? 'bg-canvas text-ink shadow-sm' : 'text-muted')}><List size={14} />Agenda</button></div>
          <Link to="/?newExam=1" className="inline-flex h-10 items-center gap-2 rounded-xl border border-line bg-surface px-3 text-xs font-semibold hover:bg-canvas"><GraduationCap size={16} />Add exam</Link>
          <Button variant="secondary" onClick={() => openCreate()} icon={<Plus size={16} />}><span className="hidden sm:inline">Add session</span></Button>
          <Button onClick={() => setGeneratorOpen(true)} icon={<Sparkles size={16} />}>Generate plan<ChevronDown size={14} className="hidden sm:block" /></Button>
        </div>
      </section>

      {missed.length > 0 && <section className="mb-4 overflow-hidden rounded-2xl border border-amber-200 bg-amber-50/70 dark:border-amber-900/60 dark:bg-amber-950/20" aria-label="Missed sessions">
        <div className="flex flex-wrap items-center gap-3 px-4 py-3">
          <History size={17} className="shrink-0 text-amber-600 dark:text-amber-400" />
          <p className="min-w-0 flex-1 text-xs"><span className="font-semibold">{missed.length} unfinished {missed.length === 1 ? 'session' : 'sessions'}</span><span className="text-muted"> from the last two weeks ({formatMinutes(missed.reduce((sum, session) => sum + session.duration_minutes, 0))})</span></p>
          <button className="text-xs font-semibold text-muted hover:text-ink" onClick={() => setMissedOpen(open => !open)}>{missedOpen ? 'Hide' : 'Review'}</button>
          <Button variant="secondary" className="h-8 px-3 text-xs" onClick={() => moveToToday(missed)} icon={<ArrowRight size={14} />}>Move all to today</Button>
        </div>
        {missedOpen && <ul className="divide-y divide-amber-200/70 border-t border-amber-200/70 dark:divide-amber-900/50 dark:border-amber-900/50">{missed.map(session => <li key={session.id} className="flex items-center gap-3 px-4 py-2.5">
          <span className="w-20 shrink-0 text-[11px] text-muted">{format(parseISO(session.date), 'EEE, MMM d')}</span>
          <button className="min-w-0 flex-1 truncate text-left text-xs font-medium hover:text-accent" onClick={() => openEdit(session)}>{session.title}</button>
          <span className="hidden text-[11px] text-muted sm:inline">{formatMinutes(session.duration_minutes)}</span>
          <button className="rounded-lg px-2 py-1 text-[11px] font-semibold text-accent hover:bg-surface" onClick={() => moveToToday([session])}>Today</button>
          <button className="rounded-lg px-2 py-1 text-[11px] font-semibold text-muted hover:bg-surface hover:text-ink" onClick={() => updateSession(session, { completed: true }, 'Marked as done')}>Done</button>
        </li>)}</ul>}
      </section>}

      <div className="card min-h-[560px] flex-1 overflow-hidden">
        {view === 'month' ? (
          <div className="overflow-x-auto" aria-label="Month calendar" aria-busy={loading}>
            <div className="grid min-w-[700px] grid-cols-7 border-b border-line bg-sidebar">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => <div key={day} className="py-3 text-center text-[10px] font-semibold uppercase tracking-wider text-muted">{day}</div>)}</div>
            <div className="grid min-w-[700px] grid-cols-7">{days.map(day => {
              const date = localDateString(day);
              const dayExams = calendarExams.filter(exam => exam.date === date);
              const daySessions = sessions.filter(session => session.date === date).sort((a, b) => a.start_minutes - b.start_minutes);
              return <section key={date} aria-label={format(day, 'EEEE, MMMM d, yyyy')} onDragOver={event => { event.preventDefault(); setDragOver(date); }} onDragLeave={() => setDragOver(null)} onDrop={event => dropSession(event, date)} className={cn('min-h-36 border-b border-r border-line p-2', !isSameMonth(day, anchor) && 'bg-canvas text-muted', dragOver === date && 'bg-accent-soft dark:bg-accent-dark/30')}>
                <div className="mb-2 flex items-center justify-between"><button onClick={() => openCreate(date)} className={cn('flex h-7 w-7 items-center justify-center rounded-full text-xs hover:ring-1 hover:ring-accent', isSameDay(day, new Date()) && 'bg-accent text-white')} aria-label={`Add session on ${format(day, 'MMMM d, yyyy')}`}>{format(day, 'd')}</button><button className="icon-btn h-6 w-6" onClick={() => openCreate(date)} aria-label={`New session on ${date}`}><Plus size={12} /></button></div>
                <div className="space-y-1">{dayExams.map(exam => <ExamCard key={exam.id} exam={exam} />)}{daySessions.slice(0, 3).map(session => <div key={session.id} draggable onDragStart={event => { event.dataTransfer.setData('text/study-session', String(session.id)); event.dataTransfer.effectAllowed = 'move'; }} className={cn('flex min-w-0 items-center gap-1 rounded-md border-l-2 px-1.5 py-1', sessionColors[session.topic] || sessionColors.study, session.completed && 'opacity-50')}>
                  <button className="min-w-0 flex-1 text-left" onClick={() => openEdit(session)} title={`${formatTime(session.start_minutes)} · ${session.title}`}><span className="block text-[9px] opacity-65">{formatTime(session.start_minutes)}</span><span className={cn('block truncate text-[10px] font-medium', session.completed && 'line-through')}>{session.title}</span></button><button className="shrink-0" aria-label={`${session.completed ? 'Mark incomplete' : 'Mark complete'}: ${session.title}`} onClick={() => updateSession(session, { completed: !session.completed })}>{session.completed ? <Check size={11} /> : <Circle size={11} />}</button>
                </div>)}{daySessions.length > 3 && <button className="w-full rounded px-1 py-1 text-left text-[10px] font-semibold text-accent hover:bg-canvas" onClick={() => { setAnchor(day); setView('agenda'); }}>+{daySessions.length - 3} more · agenda</button>}</div>
              </section>;
            })}</div>
          </div>
        ) : view === 'week' ? (
          <div className="subtle-scrollbar h-full overflow-x-auto">
            <div className="grid min-w-[960px] grid-cols-7 divide-x divide-line">
              {days.map((day) => {
                const date = localDateString(day);
              const dayExams = calendarExams.filter(exam => exam.date === date);
                const { list: daySessions, overlapping, planned, done } = dayPlan(sessions, date);
                const today = isSameDay(day, new Date());
                const past = date < todayString;
                return <section key={date} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setDragOver(date); }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragOver(null); }} onDrop={(event) => dropSession(event, date)} className={cn('flex min-h-[560px] min-w-0 flex-col transition-colors', dragOver === date && 'bg-accent-soft/60 dark:bg-accent-dark/20')}>
                  <header className={cn('border-b border-line px-3 py-4 text-center', today && 'bg-accent-soft/50 dark:bg-accent-dark/20')}><p className={cn('text-[10px] font-semibold uppercase tracking-[.12em]', today ? 'text-accent' : 'text-muted')}>{format(day, 'EEE')}</p><div className={cn('mx-auto mt-1 flex h-8 w-8 items-center justify-center rounded-full text-lg font-medium', today && 'bg-accent text-white', past && !today && 'text-muted')}>{format(day, 'd')}</div>{planned > 0 && <div className="mx-auto mt-2 w-full max-w-[96px]" title={`${formatMinutes(done)} of ${formatMinutes(planned)} done`}><div className="h-1 overflow-hidden rounded-full bg-line"><div className={cn('h-full rounded-full', done >= planned ? 'bg-accent' : 'bg-accent/70')} style={{ width: `${Math.round(done / planned * 100)}%` }} /></div><p className={cn('mt-1 text-[10px] tabular-nums', planned > 360 ? 'font-semibold text-amber-600 dark:text-amber-400' : 'text-muted')}>{formatMinutes(planned)}{planned > 360 && ' · heavy'}</p></div>}</header>
                  <div className="flex-1 space-y-2 p-2">{dayExams.map(exam => <ExamCard key={exam.id} exam={exam} />)}{daySessions.map((session) => <SessionCard key={session.id} session={session} overlaps={overlapping.has(session.id)} onEdit={() => openEdit(session)} onToggle={() => updateSession(session, { completed: !session.completed }, !session.completed ? 'Session complete. Keep going!' : undefined)} />)}{!daySessions.length && !loading && <button onClick={() => openCreate(date)} className="mt-3 flex w-full flex-col items-center rounded-xl border border-dashed border-line py-5 text-muted/60 transition hover:border-accent/40 hover:text-accent"><Plus size={16} /><span className="mt-1 text-[10px]">Add session</span></button>}</div>
                  <footer className="p-2"><button onClick={() => openCreate(date)} className="flex h-8 w-full items-center justify-center rounded-lg text-muted opacity-0 transition hover:bg-canvas hover:text-ink focus:opacity-100 group-hover:opacity-100" aria-label={`Add session on ${format(day, 'MMMM d')}`}><Plus size={14} /></button></footer>
                </section>;
              })}
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-4xl p-4 sm:p-7">
            {days.some(day => sessions.some(session => session.date === localDateString(day)) || calendarExams.some(exam => exam.date === localDateString(day))) ? days.map((day) => {
              const date = localDateString(day);
              const dayExams = calendarExams.filter(exam => exam.date === date);
              const { list: daySessions } = dayPlan(sessions, date);
              if (!daySessions.length && !dayExams.length) return null;
              return <section key={date} className="mb-7"><div className="mb-3 flex items-center gap-3"><h3 className={cn('text-xs font-semibold', isSameDay(day, new Date()) && 'text-accent')}>{isSameDay(day, new Date()) ? 'Today' : format(day, 'EEEE')} · {format(day, 'MMMM d')}</h3><span className="h-px flex-1 bg-line" /><span className="text-[10px] text-muted">{formatMinutes(daySessions.reduce((sum, session) => sum + session.duration_minutes, 0))}</span></div><div className="space-y-2">{dayExams.map(exam => <ExamCard key={exam.id} exam={exam} />)}{daySessions.map((session) => <div key={session.id} onClick={() => openEdit(session)} className="group flex cursor-pointer gap-4 rounded-xl border border-line bg-surface p-4 transition hover:border-accent/30 hover:shadow-soft"><div className="w-16 shrink-0 text-xs font-medium text-muted">{formatTime(session.start_minutes)}</div><span className={cn('w-1 shrink-0 rounded-full', session.topic === 'review' ? 'bg-amber-500' : session.topic === 'practice' ? 'bg-violet-500' : 'bg-emerald-500')} /><div className="min-w-0 flex-1"><p className={cn('text-sm font-semibold', session.completed && 'line-through opacity-50')}>{session.title}</p>{session.notes && <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted">{session.notes}</p>}<p className="mt-2 text-[10px] capitalize text-muted">{session.topic} · {formatMinutes(session.duration_minutes)}</p></div><button className="icon-btn self-start" onClick={(event) => { event.stopPropagation(); updateSession(session, { completed: !session.completed }); }} aria-label="Toggle completion">{session.completed ? <Check size={17} className="text-accent" /> : <Circle size={17} />}</button></div>)}</div></section>;
            }) : <EmptyState icon={<CalendarDays size={23} />} title="A fresh week awaits" description="Add a session yourself or generate a thoughtful study plan from your course materials." action={<Button onClick={() => setGeneratorOpen(true)} icon={<Sparkles size={15} />}>Generate a study plan</Button>} />}
          </div>
        )}
      </div>
      <p className="mt-3 hidden flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[10px] text-muted lg:flex"><span className="flex items-center gap-1.5"><GripVertical size={12} />Drag a session to another day to reschedule</span><span className="flex items-center gap-1.5"><Keyboard size={12} /><kbd className="font-sans font-semibold">N</kbd> new · <kbd className="font-sans font-semibold">T</kbd> today · <kbd className="font-sans font-semibold">← →</kbd> previous/next · <kbd className="font-sans font-semibold">W M A</kbd> views</span></p>

      {generatorOpen && <ScheduleGenerator documents={documents} onClose={closeGenerator} onGenerated={refresh} />}
      {modalOpen && <SessionModal session={editing} initialDate={initialDate} documents={documents} onClose={() => setModalOpen(false)} onSaved={refresh} />}
    </div>
  );
}
