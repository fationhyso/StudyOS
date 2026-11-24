import {
  CalendarPlus, Check, CheckCircle2, ChevronRight,
  Clock3, FileText, Flame, Library, Sparkles, Target,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import ExamCountdown from '../components/ExamCountdown';
import SemesterCourses from '../components/SemesterCourses';
import { Button, EmptyState, Skeleton } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { api } from '../lib/api';
import { cn, formatMinutes, formatTime, friendlyDate, greeting, sessionColors } from '../lib/utils';
import type { DashboardData, StudySession } from '../types';

function StatCard({ label, value, detail, icon, tone }: { label: string; value: string | number; detail: string; icon: React.ReactNode; tone: string }) {
  return (
    <div className="card p-4 sm:p-5">
      <div className="flex items-start justify-between"><p className="text-xs font-medium text-muted">{label}</p><span className={cn('chip h-8 w-8', tone)}>{icon}</span></div>
      <p className="mt-2 text-[26px] font-semibold leading-none tracking-[-.045em] tabular-nums">{value}</p>
      <p className="mt-2 text-[11px] text-muted">{detail}</p>
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [data, setData] = useState<DashboardData | null>(null);
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

  if (!data) return <div className="mx-auto max-w-[1440px] p-5 sm:p-8"><Skeleton className="h-10 w-72" /><div className="mt-7 grid grid-cols-2 gap-4 lg:grid-cols-5">{[1, 2, 3, 4, 5].map((item) => <Skeleton key={item} className="h-32" />)}</div><Skeleton className="mt-5 h-96" /></div>;

  const { stats } = data;
  const todayProgress = stats.today_sessions ? Math.round(stats.today_completed / stats.today_sessions * 100) : 0;
  const maxMinutes = Math.max(60, ...data.weekly.map((day) => day.planned));

  return (
    <div className="mx-auto max-w-[1440px] px-4 py-2 sm:px-6 lg:px-7">
      <section className="mb-5 mt-1 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h2 className="page-title">{greeting()}, {user?.name.split(' ')[0]}.</h2>
          <p className="page-sub">{stats.today_sessions ? `You have ${stats.today_sessions - stats.today_completed} ${stats.today_sessions - stats.today_completed === 1 ? 'session' : 'sessions'} left today. One step at a time.` : 'A clear day is a chance to learn something new—or take a mindful break.'}</p>
        </div>
        <div className="flex gap-2">
          <Link to="/schedule?generate=1"><Button variant="secondary" icon={<CalendarPlus size={16} />}>Plan my week</Button></Link>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        <StatCard label="Focused this week" value={formatMinutes(stats.completed_minutes)} detail={`of ${formatMinutes(stats.planned_minutes)} planned`} icon={<Clock3 size={16} />} tone="chip bg-emerald-500/[.12] text-emerald-700 dark:text-emerald-300" />
        {user && <ExamCountdown key={user.id} userId={user.id} />}
        <StatCard label="Today's progress" value={`${stats.today_completed}/${stats.today_sessions}`} detail="study sessions completed" icon={<Target size={16} />} tone="chip bg-blue-500/[.12] text-blue-700 dark:text-blue-300" />
        <StatCard label="Study streak" value={`${stats.streak} ${stats.streak === 1 ? 'day' : 'days'}`} detail={stats.streak ? 'Keep the momentum going' : 'Complete a session to begin'} icon={<Flame size={16} />} tone="chip bg-amber-500/[.12] text-amber-700 dark:text-amber-300" />
        <StatCard label="Study library" value={stats.documents} detail={`${stats.documents === 1 ? 'file' : 'files'} in your library`} icon={<Library size={16} />} tone="chip bg-violet-500/[.12] text-violet-700 dark:text-violet-300" />
      </section>

      <div className="mt-5 grid gap-5 xl:grid-cols-12">
        <div className="space-y-5 xl:col-span-8">
          <section className="card overflow-hidden">
            <div className="flex items-center justify-between px-5 pb-3 pt-5 sm:px-6">
              <div><h3 className="text-sm font-semibold">Today's focus</h3><p className="mt-0.5 text-xs text-muted">{stats.today_sessions ? `${todayProgress}% complete` : 'No sessions scheduled'}</p></div>
              <Link to="/schedule" className="flex items-center gap-1 text-xs font-semibold text-accent hover:underline">Full schedule<ChevronRight size={14} /></Link>
            </div>
            {stats.today_sessions > 0 && <div className="mx-5 h-1.5 overflow-hidden rounded-full bg-canvas sm:mx-6" role="progressbar" aria-valuenow={todayProgress} aria-valuemin={0} aria-valuemax={100} aria-label="Today's progress"><div className="h-full rounded-full bg-gradient-to-r from-accent to-[#7fb08e] shadow-[0_0_12px_rgb(78_122_92/.45)] transition-all duration-500" style={{ width: `${todayProgress}%` }} /></div>}
            <div className="p-3 sm:p-4">
              {data.today_sessions.length ? <div className="space-y-1.5">{data.today_sessions.map((session) => (
                <div key={session.id} className={cn('group flex items-center gap-3 rounded-2xl p-3 transition hover:bg-canvas', session.completed && 'opacity-60')}>
                  <button disabled={updating === session.id} onClick={() => toggleSession(session)} className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-[1.5px] transition', session.completed ? 'border-accent bg-accent text-white shadow-[0_0_0_4px_rgb(78_122_92/.15)]' : 'border-muted/50 bg-surface hover:border-accent')} aria-label={session.completed ? `Mark ${session.title} incomplete` : `Complete ${session.title}`}>{session.completed && <Check size={12} strokeWidth={3} />}</button>
                  <div className="min-w-0 flex-1"><p className={cn('truncate text-sm font-medium', session.completed && 'line-through')}>{session.title}</p><p className="mt-1 flex items-center gap-2 text-[11px] capitalize text-muted"><span className="tabular-nums">{formatTime(session.start_minutes)}</span><span>{formatMinutes(session.duration_minutes)}</span><span className="sm:hidden">{session.topic}</span></p></div>
                  <span className={cn('hidden rounded-full border-l-0 px-2.5 py-1 text-[10px] font-medium capitalize ring-1 ring-inset sm:block', sessionColors[session.topic] || sessionColors.study)}>{session.topic}</span>
                </div>
              ))}</div> : <EmptyState icon={<CheckCircle2 size={22} />} title="Your day is wide open" description="Add a focused session or generate a balanced plan from your study materials." action={<Link to="/schedule?generate=1"><Button variant="secondary" icon={<Sparkles size={15} />}>Generate a study plan</Button></Link>} />}
            </div>
          </section>

          <section className="card p-5 sm:p-6">
            <div className="flex items-start justify-between"><div><h3 className="text-sm font-semibold">Weekly momentum</h3><p className="mt-1 text-xs text-muted">Focused minutes across your week</p></div><div className="flex items-center gap-3 text-[10px] text-muted"><span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-accent" />Completed</span><span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-[rgb(var(--ink)/.15)]" />Planned</span></div></div>
            <div className="mt-7 flex h-44 items-end gap-2 sm:gap-4">
              {data.weekly.map((day) => {
                const isToday = day.date === data.date;
                return <div key={day.date} className="group flex h-full flex-1 flex-col items-center justify-end gap-2" title={`${formatMinutes(day.completed)} completed of ${formatMinutes(day.planned)} planned`}>
                  <span className="text-[10px] font-medium text-muted opacity-0 transition group-hover:opacity-100">{day.planned ? formatMinutes(day.planned) : 'Rest'}</span>
                  <div className="relative flex w-full max-w-12 flex-1 items-end justify-center overflow-hidden rounded-xl bg-canvas">
                    <div className="absolute bottom-0 w-full rounded-xl bg-[rgb(var(--ink)/.09)] transition-all duration-500" style={{ height: `${Math.max(day.planned ? 5 : 0, day.planned / maxMinutes * 100)}%` }} />
                    <div className={cn('absolute bottom-0 w-full rounded-xl transition-all duration-700', isToday ? 'bg-gradient-to-t from-accent to-[#7fb08e] shadow-[0_0_16px_rgb(78_122_92/.4)]' : 'bg-accent/60')} style={{ height: `${day.completed / maxMinutes * 100}%` }} />
                  </div>
                  <span className={cn('text-[11px]', isToday ? 'font-bold text-accent' : 'text-muted')}>{format(parseISO(day.date), 'EEE')}</span>
                </div>;
              })}
            </div>
          </section>
        </div>

        <aside className="space-y-5 xl:col-span-4">
          {user && <SemesterCourses key={user.id} userId={user.id} />}

          <section className="card p-5">
            <div className="mb-4 flex items-center justify-between"><h3 className="text-sm font-semibold">Coming up</h3><CalendarPlus size={16} className="text-muted" /></div>
            {data.upcoming.length ? <div className="space-y-4">{data.upcoming.slice(0, 4).map((session) => <Link to="/schedule" key={session.id} className="group flex gap-3"><div className="flex flex-col items-center"><span className="mt-1.5 h-2 w-2 rounded-full bg-accent" /><span className="mt-1 w-px flex-1 bg-line" /></div><div className="min-w-0 flex-1 pb-1"><p className="truncate text-xs font-medium group-hover:text-accent">{session.title}</p><p className="mt-1 text-[11px] text-muted">{friendlyDate(session.date)} · {formatTime(session.start_minutes)}</p></div><ChevronRight size={14} className="mt-1 text-muted opacity-0 transition group-hover:opacity-100" /></Link>)}</div> : <p className="py-4 text-center text-xs leading-5 text-muted">Nothing on the horizon.<br /><Link className="font-medium text-accent hover:underline" to="/schedule">Plan a study session</Link></p>}
          </section>

          <section className="card p-5">
            <div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-semibold">Recently opened</h3><Link to="/files" className="text-[11px] font-medium text-accent hover:underline">View library</Link></div>
            {data.recent_documents.length ? <div className="space-y-1">{data.recent_documents.slice(0, 4).map((doc) => <Link key={`doc-${doc.id}`} to={`/files/${doc.id}`} className="flex items-center gap-3 rounded-xl p-2 transition hover:bg-canvas"><span className="flex h-8 w-8 items-center justify-center rounded-lg chip bg-red-500/[.12] text-red-600 dark:text-red-300"><FileText size={15} /></span><div className="min-w-0"><p className="truncate text-xs font-medium">{doc.name}</p><p className="mt-0.5 text-[10px] text-muted">{doc.extension.replace('.', '').toUpperCase()} document</p></div></Link>)}</div> : <div className="rounded-2xl bg-canvas p-4 text-center"><FileText size={18} className="mx-auto text-muted" /><p className="mt-2 text-[11px] leading-5 text-muted">Upload a syllabus or lecture notes to get started.</p><Link to="/files" className="mt-2 inline-block text-xs font-semibold text-accent">Add your first file</Link></div>}
          </section>
        </aside>
      </div>
    </div>
  );
}
