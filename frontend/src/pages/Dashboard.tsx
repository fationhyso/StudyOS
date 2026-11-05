import {
  ArrowRight, BookOpenText, Bot, CalendarPlus, Check, CheckCircle2, ChevronRight,
  Clock3, FileText, Flame, Library, Plus, Sparkles, Target,
} from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { Button, EmptyState, Skeleton } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { api } from '../lib/api';
import { cn, formatMinutes, formatTime, friendlyDate, greeting, sessionColors } from '../lib/utils';
import type { DashboardData, Note, StudySession } from '../types';

function StatCard({ label, value, detail, icon, tone }: { label: string; value: string | number; detail: string; icon: React.ReactNode; tone: string }) {
  return (
    <div className="card p-4 sm:p-5">
      <div className="flex items-start justify-between"><p className="text-xs font-medium text-muted">{label}</p><span className={cn('flex h-8 w-8 items-center justify-center rounded-xl', tone)}>{icon}</span></div>
      <p className="mt-1 text-2xl font-semibold tracking-[-.04em]">{value}</p>
      <p className="mt-1 text-[11px] text-muted">{detail}</p>
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [data, setData] = useState<DashboardData | null>(null);
  const [quickNote, setQuickNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [updating, setUpdating] = useState<number | null>(null);

  const load = useCallback(async () => {
    try { setData(await api<DashboardData>('/dashboard')); }
    catch (error) { toast(error instanceof Error ? error.message : 'Could not load dashboard', 'error'); }
  }, [toast]);
  useEffect(() => { load(); }, [load]);

  const toggleSession = async (session: StudySession) => {
    setUpdating(session.id);
    try {
      await api(`/schedule/${session.id}`, { method: 'PATCH', body: JSON.stringify({ completed: !session.completed }) });
      await load();
      if (!session.completed) toast('Session complete. Nice work!');
    } catch (error) { toast(error instanceof Error ? error.message : 'Could not update session', 'error'); }
    finally { setUpdating(null); }
  };

  const createQuickNote = async (event: FormEvent) => {
    event.preventDefault();
    if (!quickNote.trim()) return;
    setSavingNote(true);
    try {
      const firstLine = quickNote.trim().split('\n')[0].slice(0, 70);
      const note = await api<Note>('/notes', { method: 'POST', body: JSON.stringify({ title: firstLine || 'Quick note', content: quickNote.trim() }) });
      setQuickNote('');
      navigate(`/notes?note=${note.id}`);
    } catch (error) { toast(error instanceof Error ? error.message : 'Could not save note', 'error'); }
    finally { setSavingNote(false); }
  };

  if (!data) return <div className="mx-auto max-w-[1440px] p-5 sm:p-8"><Skeleton className="h-10 w-72" /><div className="mt-7 grid grid-cols-2 gap-4 lg:grid-cols-4">{[1, 2, 3, 4].map((item) => <Skeleton key={item} className="h-32" />)}</div><Skeleton className="mt-5 h-96" /></div>;

  const { stats } = data;
  const todayProgress = stats.today_sessions ? Math.round(stats.today_completed / stats.today_sessions * 100) : 0;
  const maxMinutes = Math.max(60, ...data.weekly.map((day) => day.planned));

  return (
    <div className="mx-auto max-w-[1440px] p-5 sm:p-7 lg:p-8">
      <section className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="mb-1.5 text-xs font-medium text-accent">{format(new Date(), 'EEEE, MMMM d')}</p>
          <h2 className="text-[28px] font-semibold tracking-[-.045em] sm:text-[32px]">{greeting()}, {user?.name.split(' ')[0]}.</h2>
          <p className="mt-1.5 text-sm text-muted">{stats.today_sessions ? `You have ${stats.today_sessions - stats.today_completed} ${stats.today_sessions - stats.today_completed === 1 ? 'session' : 'sessions'} left today. One step at a time.` : 'A clear day is a chance to learn something new—or take a mindful break.'}</p>
        </div>
        <div className="flex gap-2">
          <Link to="/schedule?generate=1"><Button variant="secondary" icon={<CalendarPlus size={16} />}>Plan my week</Button></Link>
          <Link to="/tutor" className="hidden sm:block"><Button icon={<Sparkles size={16} />}>Study with AI</Button></Link>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Focused this week" value={formatMinutes(stats.completed_minutes)} detail={`of ${formatMinutes(stats.planned_minutes)} planned`} icon={<Clock3 size={16} />} tone="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" />
        <StatCard label="Today's progress" value={`${stats.today_completed}/${stats.today_sessions}`} detail="study sessions completed" icon={<Target size={16} />} tone="bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300" />
        <StatCard label="Study streak" value={`${stats.streak} ${stats.streak === 1 ? 'day' : 'days'}`} detail={stats.streak ? 'Keep the momentum going' : 'Complete a session to begin'} icon={<Flame size={16} />} tone="bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300" />
        <StatCard label="Study library" value={stats.documents} detail={`${stats.notes} ${stats.notes === 1 ? 'note' : 'notes'} in your workspace`} icon={<Library size={16} />} tone="bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300" />
      </section>

      <div className="mt-5 grid gap-5 xl:grid-cols-12">
        <div className="space-y-5 xl:col-span-8">
          <section className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-line px-5 py-4 sm:px-6">
              <div><h3 className="text-sm font-semibold">Today's focus</h3><p className="mt-0.5 text-xs text-muted">{stats.today_sessions ? `${todayProgress}% complete` : 'No sessions scheduled'}</p></div>
              <Link to="/schedule" className="flex items-center gap-1 text-xs font-semibold text-accent hover:underline">Full schedule<ChevronRight size={14} /></Link>
            </div>
            {stats.today_sessions > 0 && <div className="h-1 bg-canvas"><div className="h-full bg-accent transition-all duration-500" style={{ width: `${todayProgress}%` }} /></div>}
            <div className="p-3 sm:p-4">
              {data.today_sessions.length ? <div className="space-y-1.5">{data.today_sessions.map((session) => (
                <div key={session.id} className={cn('group flex items-center gap-3 rounded-xl border border-transparent p-3 transition hover:border-line hover:bg-canvas/70', session.completed && 'opacity-60')}>
                  <button disabled={updating === session.id} onClick={() => toggleSession(session)} className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-[1.5px] transition', session.completed ? 'border-accent bg-accent text-white' : 'border-muted/50 hover:border-accent')} aria-label={session.completed ? `Mark ${session.title} incomplete` : `Complete ${session.title}`}>{session.completed && <Check size={12} strokeWidth={3} />}</button>
                  <div className="min-w-0 flex-1"><p className={cn('truncate text-sm font-medium', session.completed && 'line-through')}>{session.title}</p><p className="mt-1 flex items-center gap-2 text-[11px] capitalize text-muted"><span>{formatTime(session.start_minutes)}</span><span>·</span><span>{formatMinutes(session.duration_minutes)}</span><span>·</span><span>{session.topic}</span></p></div>
                  <span className={cn('hidden rounded-lg border-l-2 px-2.5 py-1 text-[10px] font-medium capitalize sm:block', sessionColors[session.topic] || sessionColors.study)}>{session.topic}</span>
                </div>
              ))}</div> : <EmptyState icon={<CheckCircle2 size={22} />} title="Your day is wide open" description="Add a focused session or generate a balanced plan from your study materials." action={<Link to="/schedule?generate=1"><Button variant="secondary" icon={<Sparkles size={15} />}>Generate a study plan</Button></Link>} />}
            </div>
          </section>

          <section className="card p-5 sm:p-6">
            <div className="flex items-start justify-between"><div><h3 className="text-sm font-semibold">Weekly momentum</h3><p className="mt-1 text-xs text-muted">Focused minutes across your week</p></div><div className="flex items-center gap-3 text-[10px] text-muted"><span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-accent" />Completed</span><span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-line" />Planned</span></div></div>
            <div className="mt-7 flex h-44 items-end gap-2 sm:gap-4">
              {data.weekly.map((day) => {
                const isToday = day.date === data.date;
                return <div key={day.date} className="group flex h-full flex-1 flex-col items-center justify-end gap-2" title={`${formatMinutes(day.completed)} completed of ${formatMinutes(day.planned)} planned`}>
                  <span className="text-[10px] font-medium text-muted opacity-0 transition group-hover:opacity-100">{day.planned ? formatMinutes(day.planned) : 'Rest'}</span>
                  <div className="relative flex w-full max-w-12 flex-1 items-end justify-center overflow-hidden rounded-t-lg bg-canvas/60">
                    <div className="absolute bottom-0 w-full rounded-t-lg bg-line/70 transition-all duration-500" style={{ height: `${Math.max(day.planned ? 5 : 0, day.planned / maxMinutes * 100)}%` }} />
                    <div className={cn('absolute bottom-0 w-full rounded-t-lg transition-all duration-700', isToday ? 'bg-accent' : 'bg-accent/65')} style={{ height: `${day.completed / maxMinutes * 100}%` }} />
                  </div>
                  <span className={cn('text-[11px]', isToday ? 'font-bold text-accent' : 'text-muted')}>{format(parseISO(day.date), 'EEE')}</span>
                </div>;
              })}
            </div>
          </section>
        </div>

        <aside className="space-y-5 xl:col-span-4">
          <section className="card p-5">
            <div className="flex items-center gap-2"><Plus size={16} className="text-accent" /><h3 className="text-sm font-semibold">Capture a thought</h3></div>
            <form onSubmit={createQuickNote}><textarea className="field mt-3 min-h-24 resize-none border-transparent bg-canvas px-3 text-[13px]" value={quickNote} onChange={(e) => setQuickNote(e.target.value)} placeholder="An idea, a question, something to remember…" maxLength={500000} /><div className="mt-2 flex items-center justify-between"><span className="text-[10px] text-muted">Saved to Notes & docs</span><Button type="submit" variant="ghost" className="h-8 px-2 text-xs" disabled={!quickNote.trim()} loading={savingNote}>Save note<ArrowRight size={14} /></Button></div></form>
          </section>

          <section className="card p-5">
            <div className="mb-4 flex items-center justify-between"><h3 className="text-sm font-semibold">Coming up</h3><CalendarPlus size={16} className="text-muted" /></div>
            {data.upcoming.length ? <div className="space-y-4">{data.upcoming.slice(0, 4).map((session) => <Link to="/schedule" key={session.id} className="group flex gap-3"><div className="flex flex-col items-center"><span className="mt-1.5 h-2 w-2 rounded-full bg-accent" /><span className="mt-1 w-px flex-1 bg-line" /></div><div className="min-w-0 flex-1 pb-1"><p className="truncate text-xs font-medium group-hover:text-accent">{session.title}</p><p className="mt-1 text-[11px] text-muted">{friendlyDate(session.date)} · {formatTime(session.start_minutes)}</p></div><ChevronRight size={14} className="mt-1 text-muted opacity-0 transition group-hover:opacity-100" /></Link>)}</div> : <p className="py-4 text-center text-xs leading-5 text-muted">Nothing on the horizon.<br /><Link className="font-medium text-accent hover:underline" to="/schedule">Plan a study session</Link></p>}
          </section>

          <section className="card p-5">
            <div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-semibold">Recently opened</h3><Link to="/files" className="text-[11px] font-medium text-accent hover:underline">View library</Link></div>
            {data.recent_documents.length || data.recent_notes.length ? <div className="space-y-1">{data.recent_notes.slice(0, 2).map((note) => <Link key={`note-${note.id}`} to={`/notes?note=${note.id}`} className="flex items-center gap-3 rounded-lg p-2 transition hover:bg-canvas"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300"><BookOpenText size={15} /></span><div className="min-w-0"><p className="truncate text-xs font-medium">{note.title}</p><p className="mt-0.5 text-[10px] text-muted">Note</p></div></Link>)}{data.recent_documents.slice(0, 2).map((doc) => <Link key={`doc-${doc.id}`} to={`/files/${doc.id}`} className="flex items-center gap-3 rounded-lg p-2 transition hover:bg-canvas"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-300"><FileText size={15} /></span><div className="min-w-0"><p className="truncate text-xs font-medium">{doc.name}</p><p className="mt-0.5 text-[10px] text-muted">{doc.extension.replace('.', '').toUpperCase()} document</p></div></Link>)}</div> : <div className="rounded-xl bg-canvas p-4 text-center"><Bot size={18} className="mx-auto text-muted" /><p className="mt-2 text-[11px] leading-5 text-muted">Upload a syllabus and let your tutor help you get started.</p><Link to="/files" className="mt-2 inline-block text-xs font-semibold text-accent">Add your first file</Link></div>}
          </section>
        </aside>
      </div>
    </div>
  );
}
