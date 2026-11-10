import { BookOpen, Pencil, Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { usePreference } from '../lib/preferences';
import { useToast } from '../context/ToastContext';
import { Button, Modal } from './ui';

type Semester = { name: string; courses: string[] };
function parseSemester(value: unknown): Semester {
  const item = value as Partial<Semester> | null;
  if (item && typeof item.name === 'string' && Array.isArray(item.courses)) return { name: item.name, courses: item.courses.filter((course: unknown): course is string => typeof course === 'string' && !!course.trim()) };
  return { name: '', courses: [] };
}

export default function SemesterCourses({ userId }: { userId: number }) {
  const { toast } = useToast();
  const [semester, saveSemester] = usePreference(userId, 'semester-courses', parseSemester);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [courseText, setCourseText] = useState('');
  const openSetup = () => { setName(semester.name); setCourseText(semester.courses.join('\n')); setEditing(true); };
  const save = (event: FormEvent) => {
    event.preventDefault();
    const seen = new Set<string>();
    const courses = courseText.split('\n').map(course => course.trim()).filter(course => {
      if (!course || seen.has(course.toLocaleLowerCase())) return false;
      seen.add(course.toLocaleLowerCase()); return true;
    });
    if (!name.trim()) return;
    const next = { name: name.trim(), courses };
    setEditing(false);
    saveSemester(next).catch(() => toast('Could not sync your semester to your account', 'error'));
  };
  return <>
    <section aria-label="This semester’s courses" className="card overflow-hidden">
      <div className="flex items-center justify-between gap-3 p-4 sm:px-5"><div className="flex items-center gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent dark:bg-accent-dark/40"><BookOpen size={20} /></span><div><h3 className="text-sm font-semibold">This semester’s courses</h3><p className="mt-1 text-xs text-muted">{semester.name || 'Add the courses you’re taking this semester.'}</p></div></div>{semester.name ? <button className="icon-btn" title="Edit semester courses" aria-label="Edit semester courses" onClick={openSetup}><Pencil size={15} /></button> : <Button variant="secondary" className="h-9 shrink-0 px-3 text-xs" onClick={openSetup} icon={<Plus size={14} />}>Set up</Button>}</div>
      {semester.courses.length > 0 ? <ul className="max-h-80 divide-y divide-line overflow-y-auto border-t border-line">{semester.courses.map((course, index) => <li key={course} className="flex items-start gap-3 px-5 py-3"><span className="mt-0.5 text-[10px] tabular-nums text-muted">{String(index + 1).padStart(2, '0')}</span><span className="min-w-0 break-words text-xs font-medium">{course}</span></li>)}</ul> : semester.name && <p className="border-t border-line px-5 py-3 text-xs text-muted">No courses added. <button className="font-medium text-accent" onClick={openSetup}>Add your courses</button></p>}
    </section>
    {editing && <Modal title="This semester’s courses" description="List all the courses you’ll take this semester." onClose={() => setEditing(false)}>
      <form onSubmit={save} className="space-y-4">
        <div><label className="label" htmlFor="semester-name">Semester name</label><input id="semester-name" autoFocus className="field" placeholder="e.g. Fall 2026" maxLength={80} required value={name} onChange={event => setName(event.target.value)} /></div>
        <div><label className="label" htmlFor="semester-courses">Courses</label><textarea id="semester-courses" className="field min-h-56 resize-y text-sm leading-7" placeholder={'Organic Chemistry\nCalculus II\nIntroduction to Psychology'} maxLength={10000} value={courseText} onChange={event => setCourseText(event.target.value)} aria-describedby="semester-courses-help" /><p id="semester-courses-help" className="mt-2 text-xs text-muted">One course per line. Edit or remove any line to update your list.</p></div>
        <p className="text-[11px] text-muted">Saved to your account and synced across devices.</p>
        <div className="flex justify-end gap-2 border-t border-line pt-4"><Button type="button" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button><Button type="submit" disabled={!name.trim()}>Save courses</Button></div>
      </form>
    </Modal>}
  </>;
}
