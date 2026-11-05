import { BookOpen, CalendarRange, Check, Clock3, Sparkles } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { addDays, format } from 'date-fns';
import { api } from '../lib/api';
import { localDateString } from '../lib/utils';
import type { StudyDocument, StudySession } from '../types';
import { Button, Modal } from './ui';
import { useToast } from '../context/ToastContext';

const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function ScheduleGenerator({ documents, onClose, onGenerated }: {
  documents: StudyDocument[];
  onClose: () => void;
  onGenerated: () => void;
}) {
  const { toast } = useToast();
  const readyDocuments = documents.filter((doc) => doc.status === 'ready');
  const [documentIds, setDocumentIds] = useState<number[]>([]);
  const [startDate, setStartDate] = useState(localDateString());
  const [endDate, setEndDate] = useState(localDateString(addDays(new Date(), 6)));
  const [minutes, setMinutes] = useState(90);
  const [length, setLength] = useState(45);
  const [startTime, setStartTime] = useState('18:00');
  const [days, setDays] = useState([0, 1, 2, 3, 4]);
  const [focus, setFocus] = useState('');
  const [replace, setReplace] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (readyDocuments.length && readyDocuments.length <= 4) setDocumentIds(readyDocuments.map((doc) => doc.id));
  }, []); // Only preselect the initial ready library.

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    try {
      const sessions = await api<StudySession[]>('/schedule/generate', {
        method: 'POST',
        body: JSON.stringify({
          document_ids: documentIds,
          start_date: startDate,
          end_date: endDate,
          minutes_per_day: minutes,
          session_length: length,
          preferred_start: startTime,
          selected_days: days,
          focus,
          replace_existing: replace,
        }),
      });
      toast(`${sessions.length} personalized study sessions added to your calendar`);
      onGenerated();
      onClose();
    } catch (error) { toast(error instanceof Error ? error.message : 'Could not generate a schedule', 'error'); }
    finally { setLoading(false); }
  };

  return (
    <Modal title="Design my study plan" description="Turn your materials and availability into a balanced, achievable routine." onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-6">
        <div>
          <div className="mb-3 flex items-center gap-2"><BookOpen size={16} className="text-accent" /><h3 className="text-sm font-semibold">What are you studying?</h3></div>
          {readyDocuments.length ? <div className="grid max-h-40 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">{readyDocuments.map((doc) => {
            const selected = documentIds.includes(doc.id);
            return <label key={doc.id} className={`flex cursor-pointer items-center gap-2.5 rounded-xl border p-3 text-xs transition ${selected ? 'border-accent bg-accent-soft/60 dark:bg-accent-dark/30' : 'border-line hover:bg-canvas'}`}><input type="checkbox" className="sr-only" checked={selected} onChange={() => setDocumentIds((current) => selected ? current.filter((id) => id !== doc.id) : [...current, doc.id])} /><span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${selected ? 'border-accent bg-accent text-white' : 'border-muted/40'}`}>{selected && <Check size={11} />}</span><span className="truncate">{doc.name}</span></label>;
          })}</div> : <div className="rounded-xl bg-canvas p-3.5 text-xs leading-5 text-muted">No indexed files yet. You can still generate a plan from your study goal below, or <a href="/files" className="font-semibold text-accent">upload course materials</a>.</div>}
          {!documentIds.length && readyDocuments.length > 0 && <p className="mt-2 text-[11px] text-muted">No selection means all ready documents will be included.</p>}
          <input className="field mt-3" value={focus} onChange={(e) => setFocus(e.target.value)} placeholder="Optional goal, exam, or topic to prioritize" maxLength={1000} />
        </div>

        <div>
          <div className="mb-3 flex items-center gap-2"><CalendarRange size={16} className="text-accent" /><h3 className="text-sm font-semibold">When can you study?</h3></div>
          <div className="grid grid-cols-2 gap-3"><div><label className="label" htmlFor="plan-start">First day</label><input id="plan-start" type="date" className="field" value={startDate} onChange={(e) => setStartDate(e.target.value)} required /></div><div><label className="label" htmlFor="plan-end">Last day</label><input id="plan-end" type="date" className="field" value={endDate} min={startDate} max={format(addDays(new Date(startDate + 'T00:00:00'), 92), 'yyyy-MM-dd')} onChange={(e) => setEndDate(e.target.value)} required /></div></div>
          <div className="mt-3 flex flex-wrap gap-2">{weekdays.map((day, index) => <button key={day} type="button" onClick={() => setDays((current) => current.includes(index) ? current.filter((value) => value !== index) : [...current, index])} className={`h-9 min-w-12 rounded-xl border px-2 text-xs font-medium transition ${days.includes(index) ? 'border-accent bg-accent text-white' : 'border-line bg-surface text-muted hover:text-ink'}`} aria-pressed={days.includes(index)}>{day}</button>)}</div>
        </div>

        <div>
          <div className="mb-3 flex items-center gap-2"><Clock3 size={16} className="text-accent" /><h3 className="text-sm font-semibold">Set a sustainable pace</h3></div>
          <div className="grid grid-cols-3 gap-3"><div><label className="label" htmlFor="daily-minutes">Minutes / day</label><input id="daily-minutes" type="number" className="field" value={minutes} min={20} max={480} step={5} onChange={(e) => setMinutes(Number(e.target.value))} required /></div><div><label className="label" htmlFor="session-length">Session length</label><select id="session-length" className="field" value={length} onChange={(e) => setLength(Number(e.target.value))}><option value={25}>25 min</option><option value={30}>30 min</option><option value={45}>45 min</option><option value={60}>60 min</option><option value={90}>90 min</option></select></div><div><label className="label" htmlFor="preferred-time">Start around</label><input id="preferred-time" type="time" className="field" value={startTime} onChange={(e) => setStartTime(e.target.value)} required /></div></div>
          <p className="mt-2 text-[11px] leading-5 text-muted">Plans include short breaks, spaced reviews, and active-recall practice. You can move or edit any session afterward.</p>
        </div>

        <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-canvas p-3.5"><input type="checkbox" className="mt-0.5 accent-[#617a67]" checked={replace} onChange={(e) => setReplace(e.target.checked)} /><span><span className="block text-xs font-medium">Replace generated sessions in this range</span><span className="mt-0.5 block text-[11px] text-muted">Manual sessions and completed work outside the range are kept.</span></span></label>
        {!days.length && <p className="text-xs text-red-600">Select at least one study day.</p>}
        <div className="flex justify-end gap-2 border-t border-line pt-4"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" disabled={!days.length || loading} loading={loading} icon={<Sparkles size={16} />}>{loading ? 'Designing your plan…' : 'Generate my plan'}</Button></div>
      </form>
    </Modal>
  );
}
