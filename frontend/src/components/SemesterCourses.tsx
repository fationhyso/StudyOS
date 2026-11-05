import { BookOpen, ChevronRight, Pencil, Plus, Search, X } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { cn } from '../lib/utils';
import { useToast } from '../context/ToastContext';
import type { SubjectFolder } from '../types';
import { FolderDot, folderPath } from './FolderBrowser';
import { Button, Modal, Spinner } from './ui';

type Semester = { name: string; subjectIds: number[] };
function readSemester(key: string): Semester {
  try {
    const value = JSON.parse(localStorage.getItem(key) || 'null');
    if (value && typeof value.name === 'string' && Array.isArray(value.subjectIds)) return { name: value.name, subjectIds: [...new Set<number>(value.subjectIds.filter((id: unknown) => typeof id === 'number' && Number.isInteger(id) && id > 0))] };
  } catch { /* Show setup when no valid settings are stored. */ }
  return { name: '', subjectIds: [] };
}

export default function SemesterCourses({ userId }: { userId: number }) {
  const key = `studyos.semester.${userId}`;
  const { toast } = useToast();
  const [semester, setSemester] = useState(() => readSemester(key));
  const [subjects, setSubjects] = useState<SubjectFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [query, setQuery] = useState('');
  const [newCourse, setNewCourse] = useState('');
  const [creating, setCreating] = useState(false);
  const loadSubjects = async () => {
    setLoading(true); setLoadError(false);
    try { setSubjects(await api<SubjectFolder[]>('/folders')); }
    catch { setLoadError(true); }
    finally { setLoading(false); }
  };
  useEffect(() => { void loadSubjects(); }, []);
  useEffect(() => {
    const sync = () => setSemester(readSemester(key));
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, [key]);
  const openSetup = () => { setName(semester.name); setSelectedIds(semester.subjectIds); setQuery(''); setNewCourse(''); setEditing(true); };
  const createCourse = async () => {
    if (!newCourse.trim() || creating) return;
    setCreating(true);
    try {
      const subject = await api<SubjectFolder>('/folders', { method: 'POST', body: JSON.stringify({ name: newCourse.trim(), parent_id: null }) });
      setSubjects(current => [...current, subject]); setSelectedIds(current => [...current, subject.id]); setNewCourse('');
      toast('Course created in Subjects');
    } catch (error) { toast(error instanceof Error ? error.message : 'Could not create course', 'error'); }
    finally { setCreating(false); }
  };
  const save = (event: FormEvent) => {
    event.preventDefault();
    if (creating || !name.trim()) return;
    const next = { name: name.trim(), subjectIds: selectedIds };
    try { localStorage.setItem(key, JSON.stringify(next)); setSemester(next); setEditing(false); }
    catch { toast('Could not save your semester in this browser', 'error'); }
  };
  const courses = semester.subjectIds.map(id => subjects.find(subject => subject.id === id)).filter((subject): subject is SubjectFolder => !!subject);
  const available = [...subjects].sort((a, b) => folderPath(subjects, a).localeCompare(folderPath(subjects, b))).filter(subject => folderPath(subjects, subject).toLowerCase().includes(query.trim().toLowerCase()));
  const toggle = (id: number) => setSelectedIds(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]);
  return <>
    <section aria-label="This semester’s courses" className="card overflow-hidden">
      <div className="flex items-center justify-between gap-3 p-4 sm:px-5"><div className="flex items-center gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent dark:bg-accent-dark/40"><BookOpen size={20} /></span><div><h3 className="text-sm font-semibold">This semester’s courses</h3><p className="mt-1 text-xs text-muted">{semester.name || 'Set up your semester and choose the courses you’re taking.'}</p></div></div>{semester.name ? <button className="icon-btn" title="Configure semester courses" aria-label="Configure semester courses" onClick={openSetup}><Pencil size={15} /></button> : <Button variant="secondary" className="h-9 shrink-0 px-3 text-xs" onClick={openSetup} icon={<Plus size={14} />}>Set up courses</Button>}</div>
      {loading ? <div className="flex justify-center pb-4"><Spinner /></div> : loadError ? <div className="px-5 pb-4 text-xs text-muted">Could not load subjects. <button className="font-medium text-accent" onClick={() => void loadSubjects()}>Retry</button></div> : courses.length > 0 ? <div className="grid gap-2 border-t border-line p-3">{courses.map(course => <Link key={course.id} to={`/files?folder=${course.id}`} className="flex min-w-0 items-center gap-2 rounded-xl border border-line px-3 py-3 transition hover:border-accent/40 hover:bg-canvas"><FolderDot id={course.id} /><span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold">{course.name}</span><span className="mt-1 block truncate text-[10px] text-muted">{course.parent_id === null ? 'Open study materials' : folderPath(subjects, course)}</span></span><ChevronRight size={14} className="shrink-0 text-muted" /></Link>)}</div> : semester.name && <p className="border-t border-line px-5 py-3 text-xs text-muted">No courses selected. <button className="font-medium text-accent" onClick={openSetup}>Choose your courses</button></p>}
    </section>
    {editing && <Modal title="Configure your semester" description="Choose existing subjects or create courses for this semester." onClose={() => { if (!creating) setEditing(false); }}>
      <form onSubmit={save} className="space-y-4">
        <div><label className="label" htmlFor="semester-name">Semester name</label><input id="semester-name" autoFocus className="field" placeholder="e.g. Fall 2026" maxLength={80} required value={name} onChange={event => setName(event.target.value)} /></div>
        <div><p className="label">Your courses · {selectedIds.length} selected</p><div className="relative mb-2"><Search size={14} className="pointer-events-none absolute left-3 top-3.5 text-muted" /><input aria-label="Search courses" type="search" className="field pl-8 text-xs" value={query} onChange={event => setQuery(event.target.value)} placeholder="Find a subject…" /></div>
          <div className="max-h-56 space-y-1 overflow-y-auto rounded-xl border border-line p-2">{loading ? <div className="flex justify-center p-4"><Spinner /></div> : loadError ? <button type="button" className="p-3 text-xs text-accent" onClick={() => void loadSubjects()}>Could not load subjects. Retry</button> : available.length ? available.map(subject => <button key={subject.id} type="button" aria-pressed={selectedIds.includes(subject.id)} onClick={() => toggle(subject.id)} className={cn('flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs transition', selectedIds.includes(subject.id) ? 'bg-accent-soft text-accent dark:bg-accent-dark/40' : 'hover:bg-canvas')}><FolderDot id={subject.id} /><span className="min-w-0 flex-1 truncate">{folderPath(subjects, subject)}</span>{selectedIds.includes(subject.id) ? <X size={13} /> : <Plus size={13} />}</button>) : <p className="p-3 text-xs text-muted">No matching subjects. Create a course below.</p>}</div>
          {selectedIds.filter(id => !subjects.some(subject => subject.id === id)).length > 0 && !loading && !loadError && <div className="mt-2 space-y-1">{selectedIds.filter(id => !subjects.some(subject => subject.id === id)).map(id => <button key={id} type="button" onClick={() => toggle(id)} className="flex items-center gap-2 text-xs text-muted">Unavailable subject <X size={12} />Remove</button>)}</div>}
        </div>
        <div><label className="label" htmlFor="new-course">Create a course</label><div className="flex gap-2"><input id="new-course" className="field min-w-0 flex-1" placeholder="e.g. Organic Chemistry" maxLength={80} value={newCourse} disabled={creating} onChange={event => setNewCourse(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); void createCourse(); } }} /><Button type="button" variant="secondary" className="px-3" loading={creating} disabled={!newCourse.trim()} onClick={() => void createCourse()} icon={<Plus size={15} />}>Add</Button></div><p className="mt-2 text-[11px] text-muted">New courses also appear in Subjects. Semester selections are saved in this browser for your account.</p></div>
        <div className="flex justify-end gap-2 border-t border-line pt-4"><Button type="button" variant="ghost" disabled={creating} onClick={() => setEditing(false)}>Cancel</Button><Button type="submit" disabled={creating || !name.trim()}>Save semester</Button></div>
      </form>
    </Modal>}
  </>;
}
