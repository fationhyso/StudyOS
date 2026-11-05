import { Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { api } from '../lib/api';
import { localDateString } from '../lib/utils';
import type { SessionInput, StudyDocument, StudySession } from '../types';
import { Button, Modal } from './ui';
import { useToast } from '../context/ToastContext';

function timeValue(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

export default function SessionModal({ session, initialDate, documents, onClose, onSaved }: {
  session: StudySession | null;
  initialDate?: string;
  documents: StudyDocument[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [title, setTitle] = useState(session?.title || '');
  const [topic, setTopic] = useState(session?.topic || 'study');
  const [date, setDate] = useState(session?.date || initialDate || localDateString());
  const [time, setTime] = useState(timeValue(session?.start_minutes ?? 18 * 60));
  const [duration, setDuration] = useState(session?.duration_minutes || 45);
  const [notes, setNotes] = useState(session?.notes || '');
  const [documentId, setDocumentId] = useState<number | null>(session?.document_id || null);
  const [loading, setLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const [hours, minutes] = time.split(':').map(Number);
    const payload: SessionInput = { title: title.trim(), topic, notes, date, start_minutes: hours * 60 + minutes, duration_minutes: duration, document_id: documentId };
    setLoading(true);
    try {
      await api(session ? `/schedule/${session.id}` : '/schedule', { method: session ? 'PATCH' : 'POST', body: JSON.stringify(payload) });
      toast(session ? 'Study session updated' : 'Study session added');
      onSaved();
      onClose();
    } catch (error) { toast(error instanceof Error ? error.message : 'Could not save session', 'error'); }
    finally { setLoading(false); }
  };

  const remove = async () => {
    if (!session) return;
    setLoading(true);
    try { await api(`/schedule/${session.id}`, { method: 'DELETE' }); toast('Study session removed'); onSaved(); onClose(); }
    catch (error) { toast(error instanceof Error ? error.message : 'Could not remove session', 'error'); }
    finally { setLoading(false); }
  };

  return (
    <Modal title={session ? 'Edit study session' : 'Add a study session'} description="Make the goal clear and the time realistic." onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div><label className="label" htmlFor="session-title">What will you work on?</label><input id="session-title" className="field" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Review cellular respiration" required maxLength={255} /></div>
        <div className="grid grid-cols-2 gap-3"><div><label className="label" htmlFor="session-kind">Session type</label><select id="session-kind" className="field" value={topic} onChange={(e) => setTopic(e.target.value)}><option value="study">Deep study</option><option value="review">Review</option><option value="practice">Practice</option></select></div><div><label className="label" htmlFor="session-document">Linked resource</label><select id="session-document" className="field" value={documentId || ''} onChange={(e) => setDocumentId(e.target.value ? Number(e.target.value) : null)}><option value="">None</option>{documents.map((doc) => <option key={doc.id} value={doc.id}>{doc.name}</option>)}</select></div></div>
        <div className="grid grid-cols-3 gap-3"><div><label className="label" htmlFor="session-date">Date</label><input id="session-date" type="date" className="field" value={date} onChange={(e) => setDate(e.target.value)} required /></div><div><label className="label" htmlFor="session-time">Start</label><input id="session-time" type="time" className="field" value={time} onChange={(e) => setTime(e.target.value)} required /></div><div><label className="label" htmlFor="session-duration">Minutes</label><input id="session-duration" type="number" className="field" value={duration} onChange={(e) => setDuration(Number(e.target.value))} min={5} max={480} step={5} required /></div></div>
        <div><label className="label" htmlFor="session-notes">A small plan for this session <span className="font-normal text-muted">(optional)</span></label><textarea id="session-notes" className="field min-h-24 resize-y" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What would make this session a success?" maxLength={5000} /></div>
        <div className="flex items-center justify-between border-t border-line pt-4">
          <div>{session && (confirmDelete ? <div className="flex items-center gap-2"><span className="text-xs text-muted">Remove this session?</span><Button type="button" variant="danger" className="h-8 px-3 text-xs" onClick={remove} loading={loading}>Confirm</Button></div> : <Button type="button" variant="ghost" className="px-2 text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/30" onClick={() => setConfirmDelete(true)} icon={<Trash2 size={15} />}>Delete</Button>)}</div>
          <div className="flex gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" loading={loading}>{session ? 'Save changes' : 'Add session'}</Button></div>
        </div>
      </form>
    </Modal>
  );
}
