import { Search, Trash2 } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../lib/api';
import { localDateString } from '../lib/utils';
import type { SessionInput, StudyDocument, StudySession, SubjectFolder } from '../types';
import { descendantIds, FolderDot, folderPath } from './FolderBrowser';
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

  const [subjects, setSubjects] = useState<SubjectFolder[]>([]);
  const [subjectFilter, setSubjectFilter] = useState<string>(() => {
    const linked = documents.find(doc => doc.id === session?.document_id);
    return linked ? linked.folder_id === null ? 'unfiled' : String(linked.folder_id) : 'all';
  });
  const [resourceQuery, setResourceQuery] = useState('');
  const [subjectsError, setSubjectsError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    api<SubjectFolder[]>('/folders').then(result => { if (!cancelled) setSubjects(result); }).catch(() => { if (!cancelled) setSubjectsError(true); });
    return () => { cancelled = true; };
  }, []);
  const subjectIds = /^\d+$/.test(subjectFilter) ? descendantIds(subjects, Number(subjectFilter)) : null;
  const resourceGroups = new Map<string, StudyDocument[]>();
  for (const doc of [...documents].sort((a, b) => a.name.localeCompare(b.name))) {
    if (subjectFilter === 'unfiled' ? doc.folder_id !== null : subjectIds && (doc.folder_id === null || !subjectIds.has(doc.folder_id))) continue;
    if (!doc.name.toLowerCase().includes(resourceQuery.trim().toLowerCase())) continue;
    const subject = subjects.find(item => item.id === doc.folder_id);
    const group = subject ? folderPath(subjects, subject) : doc.folder_id === null ? 'Unfiled' : 'Subject';
    resourceGroups.set(group, [...resourceGroups.get(group) || [], doc]);
  }
  const linkedResource = documents.find(doc => doc.id === documentId);
  const linkedIsVisible = [...resourceGroups.values()].some(group => group.some(doc => doc.id === documentId));

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
        <div><label className="label" htmlFor="session-kind">Session type</label><select id="session-kind" className="field" value={topic} onChange={(e) => setTopic(e.target.value)}><option value="study">Deep study</option><option value="review">Review</option><option value="practice">Practice</option></select></div>
        <div className="rounded-xl border border-line p-3">
          <p className="label">Linked resource</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <div><label className="mb-1 flex items-center gap-1.5 text-xs text-muted" htmlFor="session-subject">{subjectFilter !== 'all' && <FolderDot id={subjectFilter === 'unfiled' ? null : Number(subjectFilter)} />}Subject</label><select id="session-subject" className="field text-xs" value={subjectFilter} onChange={event => setSubjectFilter(event.target.value)}><option value="all">All subjects</option><option value="unfiled">Unfiled</option>{[...subjects].sort((a, b) => folderPath(subjects, a).localeCompare(folderPath(subjects, b))).map(subject => <option key={subject.id} value={subject.id}>{folderPath(subjects, subject)}</option>)}</select></div>
            <div><label className="mb-1 block text-xs text-muted" htmlFor="session-resource-search">Find a file</label><div className="relative"><Search size={14} className="pointer-events-none absolute left-3 top-3.5 text-muted" /><input id="session-resource-search" type="search" className="field pl-8 text-xs" placeholder="Search file names…" value={resourceQuery} onChange={event => setResourceQuery(event.target.value)} /></div></div>
          </div>
          <label className="mb-1 mt-3 block text-xs text-muted" htmlFor="session-document">File</label>
          <select id="session-document" className="field text-xs" value={documentId ?? ''} onChange={event => setDocumentId(event.target.value ? Number(event.target.value) : null)}>
            <option value="">None</option>
            {linkedResource && !linkedIsVisible && <optgroup label="Currently linked"><option value={linkedResource.id}>{linkedResource.name}</option></optgroup>}
            {[...resourceGroups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([name, files]) => <optgroup key={name} label={name}>{files.map(doc => <option key={doc.id} value={doc.id}>{doc.name}</option>)}</optgroup>)}
          </select>
          <p className="mt-2 text-[11px] text-muted" role="status">{resourceGroups.size === 0 ? 'No files match. Try another subject or search.' : subjectIds ? 'Includes files in this subject and its subsubjects.' : 'Files are grouped by subject.'}</p>
          {subjectsError && <p className="mt-1 text-[11px] text-muted">Subjects could not load. You can still search all files.</p>}
        </div>
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
