import { CalendarDays, GraduationCap, Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { differenceInCalendarDays, format, isValid, parseISO } from 'date-fns';
import { useToast } from '../context/ToastContext';
import { localDateString } from '../lib/utils';
import SessionDatePicker from './SessionDatePicker';
import { Link, useSearchParams } from 'react-router-dom';
import { useExams, type Exam } from '../lib/exams';
import { Button, Modal } from './ui';

export default function ExamCountdown({ userId }: { userId: number }) {
  const { exams, saveExams } = useExams(userId);
  const [searchParams] = useSearchParams();
  const [handledExam, setHandledExam] = useState<string | null>(null);
  const { toast } = useToast();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [managing, setManaging] = useState(false);
  const [name, setName] = useState('');
  const [date, setDate] = useState(localDateString());
  const [today, setToday] = useState(localDateString());
  useEffect(() => {
    const refresh = () => setToday(localDateString());
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener('focus', refresh);
    return () => { clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, []);
  useEffect(() => {
    const id = searchParams.get('exam');
    if (searchParams.get('newExam') === '1' && handledExam !== 'new') { setEditingId(null); setName(''); setDate(localDateString()); setEditing(true); setHandledExam('new'); return; }
    const exam = exams.find(item => item.id === id);
    if (exam && id !== handledExam) { setEditingId(exam.id); setName(exam.name); setDate(exam.date); setEditing(true); setHandledExam(id); }
  }, [searchParams, exams, handledExam]);
  const openSetup = (exam?: Exam) => { setManaging(false); setEditingId(exam?.id ?? null); setName(exam?.name || ''); setDate(exam?.date ?? localDateString()); setEditing(true); };
  const save = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !isValid(parseISO(date)) || date < localDateString()) { toast('Choose an exam name and a date from today onward', 'error'); return; }
    const exam = { id: editingId ?? crypto.randomUUID(), name: name.trim(), date };
    const next = editingId ? exams.map(item => item.id === editingId ? exam : item) : [...exams, exam];
    try { saveExams(next); setEditing(false); }
    catch { toast('Could not save your countdown in this browser', 'error'); }
  };
  const remove = () => {
    try { const next = exams.filter(exam => exam.id !== editingId); saveExams(next); setEditing(false); }
    catch { toast('Could not remove your countdown', 'error'); }
  };
  const sortedExams = [...exams].sort((a, b) => Number(a.date < today) - Number(b.date < today) || a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
  const nextExam = sortedExams.find(exam => exam.date >= today);
  const daysLeft = nextExam ? differenceInCalendarDays(parseISO(nextExam.date), parseISO(today)) : null;
  return <>
    <section aria-label="Exam countdowns" className="card min-w-0 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-2"><h3 className="text-xs font-medium text-muted">Exam countdown</h3><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent dark:bg-accent-dark/40"><GraduationCap size={16} /></span></div>
      {nextExam ? <>
        <button className="mt-1 block w-full text-left" title={`Edit ${nextExam.name}`} onClick={() => openSetup(nextExam)}><span className="block text-2xl font-semibold tracking-[-.04em]">{daysLeft === 0 ? 'Today' : `${daysLeft} ${daysLeft === 1 ? 'day' : 'days'}`}</span><span className="mt-1 block truncate text-[11px] text-muted">{nextExam.name} · {format(parseISO(nextExam.date), 'd MMM')}</span></button>
        <button className="mt-2 text-[11px] font-medium text-accent hover:underline" onClick={() => setManaging(true)}>Manage exams ({exams.length})</button>
      </> : <><p className="mt-1 text-sm font-semibold">{exams.length ? 'Set your next date' : 'When are your exams?'}</p><button className="mt-2 text-xs font-medium text-accent hover:underline" onClick={() => exams.length ? setManaging(true) : openSetup()}>{exams.length ? 'Manage exams' : 'Set up exams'}</button></>}
    </section>
    {managing && <Modal title="Your exams" description="Upcoming exams appear first." onClose={() => setManaging(false)}>
      <div className="mb-3 flex justify-end"><Button variant="secondary" className="h-9 px-3 text-xs" onClick={() => openSetup()} icon={<Plus size={15} />}>Add exam</Button></div>
      {sortedExams.length > 0 && <div className="max-h-80 divide-y divide-line overflow-y-auto border-t border-line">{sortedExams.map(exam => {
        const days = differenceInCalendarDays(parseISO(exam.date), parseISO(today));
        return <div key={exam.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
          <div className="min-w-0 flex-1"><p className="break-words text-sm font-medium">{exam.name}</p><p className="mt-1 text-xs text-muted">{format(parseISO(exam.date), 'EEE, d MMM yyyy')}</p></div>
          <div className="shrink-0 text-right"><p className="text-2xl font-semibold tracking-tight text-accent">{days > 0 ? days : days === 0 ? 'Today' : 'Passed'}</p><p className="text-[11px] text-muted">{days > 0 ? `${days === 1 ? 'day' : 'days'} to go` : days === 0 ? 'You’ve got this.' : 'Exam date passed'}</p></div>
          <Link to={`/schedule?date=${exam.date}`} className="icon-btn h-8 w-8" title="View exam in schedule" aria-label={`View ${exam.name} in schedule`}><CalendarDays size={14} /></Link>
          <button className="icon-btn h-8 w-8" title={`Edit ${exam.name}`} aria-label={`Edit ${exam.name}`} onClick={() => openSetup(exam)}><Pencil size={14} /></button>
        </div>;
      })}</div>}
    </Modal>}
    {editing && <Modal title={editingId ? 'Edit exam countdown' : 'Add an exam'} description="Add the exam you’re working toward." onClose={() => setEditing(false)}>
      <form onSubmit={save} className="space-y-4">
        <div><label className="label" htmlFor="exam-name">Exam name</label><input id="exam-name" autoFocus className="field" placeholder="e.g. Biology final" value={name} onChange={event => setName(event.target.value)} required maxLength={120} /></div>
        <div><label className="label" htmlFor="exam-date">Exam date</label><SessionDatePicker id="exam-date" value={date} onChange={setDate} /><p className="mt-2 text-[11px] text-muted">Saved in this browser for your account.</p></div>
        <div className="flex items-center justify-between gap-2 border-t border-line pt-4"><div>{editingId && <button type="button" className="icon-btn hover:text-red-600" aria-label="Remove exam countdown" title="Remove countdown" onClick={remove}><Trash2 size={15} /></button>}</div><div className="flex gap-2"><Button type="button" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button><Button type="submit" disabled={!name.trim() || date < today}>Save countdown</Button></div></div>
      </form>
    </Modal>}
  </>;
}
