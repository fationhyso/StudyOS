import {
  CheckCircle2, Download, File, FileImage, FileSpreadsheet, FileText, FolderOpen,
  FolderPlus, Pencil, Grid2X2, HardDrive, List, Loader2, Search, Trash2, UploadCloud, X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { useNavigate, useParams } from 'react-router-dom';
import DocumentViewer from '../components/DocumentViewer';
import { Button, EmptyState, Modal, Spinner } from '../components/ui';
import { useToast } from '../context/ToastContext';
import { api, downloadDocument } from '../lib/api';
import { cn, formatBytes } from '../lib/utils';
import type { StudyDocument, SubjectFolder } from '../types';

const accepted = '.pdf,.txt,.md,.png,.jpg,.jpeg,.webp,.docx,.pptx,.xlsx';
const imageTypes = ['.png', '.jpg', '.jpeg', '.webp'];

function DocumentIcon({ extension, size = 22 }: { extension: string; size?: number }) {
  if (imageTypes.includes(extension)) return <FileImage size={size} />;
  if (extension === '.xlsx') return <FileSpreadsheet size={size} />;
  if (extension === '.pdf' || extension === '.docx' || extension === '.pptx') return <FileText size={size} />;
  return <File size={size} />;
}

function iconTone(extension: string) {
  if (extension === '.pdf') return 'bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-300';
  if (imageTypes.includes(extension)) return 'bg-violet-50 text-violet-600 dark:bg-violet-950/30 dark:text-violet-300';
  if (extension === '.xlsx') return 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-300';
  if (extension === '.docx' || extension === '.pptx') return 'bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-300';
  return 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300';
}

export default function Files() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { documentId } = useParams();
  const fileInput = useRef<HTMLInputElement>(null);
  const [documents, setDocuments] = useState<StudyDocument[]>([]);
  const [folders, setFolders] = useState<SubjectFolder[]>([]);
  const [activeFolder, setActiveFolder] = useState<number | 'all' | 'unfiled'>('all');
  const [folderDialog, setFolderDialog] = useState<SubjectFolder | 'new' | null>(null);
  const [folderName, setFolderName] = useState('');
  const [folderDelete, setFolderDelete] = useState<SubjectFolder | null>(null);
  const [folderBusy, setFolderBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [layout, setLayout] = useState<'grid' | 'list'>('grid');
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState<string[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<StudyDocument | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async (silent = false) => {
    try {
      const [result, subjects] = await Promise.all([api<StudyDocument[]>('/documents'), api<SubjectFolder[]>('/folders')]);
      setDocuments(result);
      setFolders(subjects);
      setActiveFolder(current => typeof current === 'number' && !subjects.some(folder => folder.id === current) ? 'unfiled' : current);
      setLoaded(true);
    } catch (error) { if (!silent) toast(error instanceof Error ? error.message : 'Could not load your library', 'error'); }
  }, [toast]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!documents.some((doc) => doc.status === 'processing')) return;
    const interval = window.setInterval(() => load(true), 2500);
    return () => clearInterval(interval);
  }, [documents.some((doc) => doc.status === 'processing'), load]);
  useEffect(() => {
    if (loaded && documentId && !documents.some((doc) => doc.id === Number(documentId))) navigate('/files', { replace: true });
  }, [loaded, documentId, documents, navigate]);

  const uploadFiles = async (files: File[]) => {
    const invalid = files.find((file) => !accepted.split(',').includes(`.${file.name.split('.').pop()?.toLowerCase()}`));
    if (invalid) { toast(`${invalid.name} isn't a supported file type`, 'error'); return; }
    const oversized = files.find((file) => file.size > 25 * 1024 * 1024);
    if (oversized) { toast(`${oversized.name} is larger than 25 MB`, 'error'); return; }
    for (const file of files) {
      setUploading((current) => [...current, file.name]);
      const body = new FormData();
      body.append('file', file);
      try {
        await api<StudyDocument>(`/documents${typeof activeFolder === 'number' ? `?folder_id=${activeFolder}` : ''}`, { method: 'POST', body });
        await load(true);
        toast(`${file.name} added to your library`);
      } catch (error) { toast(error instanceof Error ? error.message : `Could not upload ${file.name}`, 'error'); }
      finally { setUploading((current) => current.filter((name) => name !== file.name)); }
    }
  };

  const drop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    uploadFiles(Array.from(event.dataTransfer.files));
  };

  const remove = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api(`/documents/${deleteTarget.id}`, { method: 'DELETE' });
      setDocuments((current) => current.filter((doc) => doc.id !== deleteTarget.id));
      if (Number(documentId) === deleteTarget.id) navigate('/files');
      toast('Document and its private index deleted');
      setDeleteTarget(null);
    } catch (error) { toast(error instanceof Error ? error.message : 'Could not delete document', 'error'); }
    finally { setDeleting(false); }
  };

  const saveFolder = async () => {
    if (!folderDialog || !folderName.trim()) return;
    setFolderBusy(true);
    try {
      const folder = await api<SubjectFolder>(folderDialog === 'new' ? '/folders' : `/folders/${folderDialog.id}`, {
        method: folderDialog === 'new' ? 'POST' : 'PATCH', body: JSON.stringify({ name: folderName.trim() }),
      });
      await load(); setActiveFolder(folder.id); setFolderDialog(null);
      toast(folderDialog === 'new' ? 'Subject folder created' : 'Folder renamed');
    } catch (error) { toast(error instanceof Error ? error.message : 'Could not save folder', 'error'); }
    finally { setFolderBusy(false); }
  };
  const removeFolder = async () => {
    if (!folderDelete) return;
    setFolderBusy(true);
    try {
      await api(`/folders/${folderDelete.id}`, { method: 'DELETE' });
      await load(); setFolderDelete(null); toast('Folder removed. Files kept in Unfiled.');
    } catch (error) { toast(error instanceof Error ? error.message : 'Could not delete folder', 'error'); }
    finally { setFolderBusy(false); }
  };
  const moveFile = async (document: StudyDocument, destination: string) => {
    try {
      const updated = await api<StudyDocument>(`/documents/${document.id}`, { method: 'PATCH', body: JSON.stringify({ folder_id: destination ? Number(destination) : null }) });
      setDocuments(current => current.map(item => item.id === updated.id ? updated : item));
      toast('File moved');
    } catch (error) { toast(error instanceof Error ? error.message : 'Could not move file', 'error'); }
  };
  const folderPicker = (document: StudyDocument) => <select aria-label={`Subject folder for ${document.name}`} className="field mt-3 h-8 text-xs" value={document.folder_id ?? ''} onClick={event => event.stopPropagation()} onChange={event => moveFile(document, event.target.value)}><option value="">Unfiled</option>{folders.map(folder => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select>;

  const selected = documents.find((doc) => doc.id === Number(documentId));
  if (documentId && selected) return <><DocumentViewer document={selected} onClose={() => navigate('/files')} onDelete={() => setDeleteTarget(selected)} onRefresh={() => load()} />{deleteTarget && <Modal title="Delete this document?" description="The original file and its search index will be permanently removed. Notes and study sessions will be kept." onClose={() => setDeleteTarget(null)}><div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setDeleteTarget(null)}>Keep file</Button><Button variant="danger" loading={deleting} onClick={remove} icon={<Trash2 size={15} />}>Delete document</Button></div></Modal>}</>;

  const filtered = documents.filter((doc) => {
    const matchesQuery = doc.name.toLowerCase().includes(query.toLowerCase());
    const matchesFilter = filter === 'all' || (filter === 'images' ? imageTypes.includes(doc.extension) : filter === 'pdf' ? doc.extension === '.pdf' : filter === 'notes' ? ['.txt', '.md'].includes(doc.extension) : ['.docx', '.pptx', '.xlsx'].includes(doc.extension));
    const matchesFolder = activeFolder === 'all' || (activeFolder === 'unfiled' ? doc.folder_id === null : doc.folder_id === activeFolder);
    return matchesQuery && matchesFilter && matchesFolder;
  });
  const storage = documents.reduce((sum, doc) => sum + doc.size, 0);

  return (
    <div className="mx-auto max-w-[1440px] p-5 sm:p-7 lg:p-8">
      <section className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div><h2 className="text-2xl font-semibold tracking-[-.04em]">Your study library</h2><p className="mt-1.5 text-sm text-muted">Everything you need, searchable and ready for your tutor.</p></div>
        <Button onClick={() => fileInput.current?.click()} icon={<UploadCloud size={16} />}>Upload files</Button>
        <input ref={fileInput} type="file" className="hidden" accept={accepted} multiple onChange={(event) => { uploadFiles(Array.from(event.target.files || [])); event.target.value = ''; }} />
      </section>

      <section className="mb-6">
        <div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-semibold">Subjects</h3><Button variant="secondary" icon={<FolderPlus size={15} />} onClick={() => { setFolderName(''); setFolderDialog('new'); }}>New folder</Button></div>
        <div className="mb-3 flex flex-wrap gap-2">{(['all', 'unfiled'] as const).map(value => <button key={value} className={cn('rounded-lg border px-3 py-2 text-xs', activeFolder === value ? 'border-accent bg-accent-soft text-accent-dark dark:bg-accent-dark dark:text-white' : 'border-line bg-surface text-muted')} onClick={() => setActiveFolder(value)}>{value === 'all' ? 'All files' : 'Unfiled'} · {documents.filter(doc => value === 'all' || doc.folder_id === null).length}</button>)}</div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">{folders.map(folder => <div key={folder.id} className={cn('card flex items-center gap-2 p-3 transition', activeFolder === folder.id && 'border-accent ring-1 ring-accent/20')}>
          <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => setActiveFolder(folder.id)}><FolderOpen size={22} className="shrink-0 text-accent" /><span className="min-w-0"><span className="block truncate text-sm font-semibold">{folder.name}</span><span className="text-[11px] text-muted">{documents.filter(doc => doc.folder_id === folder.id).length} files</span></span></button>
          <button className="icon-btn h-7 w-7" aria-label={`Rename ${folder.name}`} onClick={() => { setFolderName(folder.name); setFolderDialog(folder); }}><Pencil size={13} /></button><button className="icon-btn h-7 w-7 hover:text-red-600" aria-label={`Delete folder ${folder.name}`} onClick={() => setFolderDelete(folder)}><Trash2 size={13} /></button>
        </div>)}</div>
        <p className="mt-3 text-xs text-muted">{typeof activeFolder === 'number' ? `Showing ${folders.find(folder => folder.id === activeFolder)?.name || 'subject'}. Uploads go directly into this folder.` : activeFolder === 'unfiled' ? 'Files without a subject folder. New uploads are saved here.' : 'Showing files across all subjects. Select a folder to upload into that subject.'}</p>
      </section>

      <section onDragEnter={(event) => { event.preventDefault(); setDragging(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false); }} onDrop={drop} className={cn('relative mb-6 overflow-hidden rounded-2xl border border-dashed p-5 transition sm:p-6', dragging ? 'border-accent bg-accent-soft dark:bg-accent-dark/30' : 'border-line bg-surface')}>
        <div className="flex flex-col items-center justify-between gap-4 sm:flex-row"><div className="flex items-center gap-4"><span className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl transition', dragging ? 'bg-accent text-white' : 'bg-accent-soft text-accent dark:bg-accent-dark/40')}><UploadCloud size={22} /></span><div><h3 className="text-sm font-semibold">{dragging ? 'Drop to add to your library' : 'Bring your course materials'}</h3><p className="mt-1 text-xs leading-5 text-muted">PDF, Markdown, text, images & Office documents · Up to 25 MB each</p></div></div><Button variant="secondary" className="shrink-0" onClick={() => fileInput.current?.click()}>Browse files</Button></div>
        {uploading.length > 0 && <div className="mt-4 flex items-center gap-2 border-t border-line pt-4 text-xs text-muted"><Spinner />Uploading {uploading.length} {uploading.length === 1 ? 'file' : 'files'}… <span className="truncate">{uploading[0]}</span></div>}
      </section>

      <section className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 sm:max-w-xs"><Search size={15} className="absolute left-3 top-3 text-muted" /><input className="field h-10 pl-9 pr-8" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search your library…" />{query && <button className="icon-btn absolute right-0.5 top-0.5 h-9 w-9" onClick={() => setQuery('')}><X size={14} /></button>}</div>
        <div className="subtle-scrollbar flex flex-1 gap-1 overflow-x-auto">{[['all', 'All files'], ['pdf', 'PDFs'], ['office', 'Office'], ['notes', 'Text & notes'], ['images', 'Images']].map(([value, label]) => <button key={value} onClick={() => setFilter(value)} className={cn('whitespace-nowrap rounded-lg px-3 py-2 text-xs font-medium transition', filter === value ? 'bg-accent-soft text-accent-dark dark:bg-accent-dark/40 dark:text-emerald-100' : 'text-muted hover:bg-surface hover:text-ink')}>{label}</button>)}</div>
        <div className="flex items-center rounded-xl border border-line bg-surface p-1"><button className={cn('icon-btn h-7 w-7 rounded-md', layout === 'grid' && 'bg-canvas text-ink')} onClick={() => setLayout('grid')} aria-label="Grid view"><Grid2X2 size={14} /></button><button className={cn('icon-btn h-7 w-7 rounded-md', layout === 'list' && 'bg-canvas text-ink')} onClick={() => setLayout('list')} aria-label="List view"><List size={15} /></button></div>
      </section>

      <div className="mb-3 flex items-center justify-between text-[11px] text-muted"><span>{filtered.length} {filtered.length === 1 ? 'document' : 'documents'}</span><span className="flex items-center gap-1.5"><HardDrive size={12} />{formatBytes(storage)} stored locally</span></div>

      {!loaded ? <div className="flex h-64 items-center justify-center"><Spinner /></div> : filtered.length === 0 ? <div className="card"><EmptyState icon={<FolderOpen size={24} />} title={documents.length ? 'No matching documents' : 'Your library is ready for its first file'} description={documents.length ? 'Try another search or filter to find what you need.' : 'Upload a syllabus, lecture slides, or notes. StudyOS will make them searchable for you and your tutor.'} action={!documents.length && <Button onClick={() => fileInput.current?.click()} icon={<UploadCloud size={16} />}>Choose a file</Button>} /></div>
        : layout === 'grid' ? <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">{filtered.map((doc) => <article key={doc.id} onClick={() => navigate(`/files/${doc.id}`)} className="card group cursor-pointer overflow-hidden transition duration-200 hover:-translate-y-0.5 hover:border-accent/30 hover:shadow-float">
          <div className="relative flex h-32 items-center justify-center border-b border-line bg-canvas/65"><span className={cn('flex h-16 w-14 items-center justify-center rounded-xl shadow-sm transition group-hover:scale-105', iconTone(doc.extension))}><DocumentIcon extension={doc.extension} size={28} /></span><span className="absolute bottom-3 right-3 rounded-md bg-surface/90 px-1.5 py-0.5 text-[9px] font-bold uppercase text-muted shadow-sm">{doc.extension.replace('.', '')}</span><div className="absolute right-2 top-2 flex opacity-0 transition group-hover:opacity-100"><button className="icon-btn h-8 w-8 bg-surface/90 shadow-sm" onClick={(event) => { event.stopPropagation(); downloadDocument(doc.id, doc.name); }} aria-label="Download"><Download size={14} /></button><button className="icon-btn h-8 w-8 bg-surface/90 shadow-sm hover:text-red-600" onClick={(event) => { event.stopPropagation(); setDeleteTarget(doc); }} aria-label="Delete"><Trash2 size={14} /></button></div></div>
          <div className="p-4"><h3 className="truncate text-sm font-semibold" title={doc.name}>{doc.name}</h3><div className="mt-2 flex items-center justify-between text-[10px] text-muted"><span>{formatBytes(doc.size)} · {formatDistanceToNow(parseISO(doc.created_at), { addSuffix: true })}</span>{doc.status === 'processing' ? <span className="flex items-center gap-1 text-amber-600"><Loader2 size={11} className="animate-spin" />Indexing</span> : doc.status === 'ready' ? <span className="flex items-center gap-1 text-emerald-600"><CheckCircle2 size={11} />AI ready</span> : <span className="text-red-500">Read error</span>}</div>{folderPicker(doc)}</div>
        </article>)}</div>
        : <div className="card divide-y divide-line overflow-hidden">{filtered.map((doc) => <div key={doc.id} onClick={() => navigate(`/files/${doc.id}`)} className="group flex cursor-pointer items-center gap-3 p-3.5 transition hover:bg-canvas/60 sm:px-5"><span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', iconTone(doc.extension))}><DocumentIcon extension={doc.extension} size={19} /></span><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{doc.name}</p>{folderPicker(doc)}<p className="mt-1 text-[10px] text-muted sm:hidden">{formatBytes(doc.size)} · {doc.status}</p></div><span className="hidden w-20 text-xs text-muted md:block">{formatBytes(doc.size)}</span><span className="hidden w-28 text-xs capitalize text-muted sm:block">{doc.status === 'ready' ? 'AI ready' : doc.status}</span><span className="hidden w-32 text-xs text-muted lg:block">{formatDistanceToNow(parseISO(doc.created_at), { addSuffix: true })}</span><button className="icon-btn" onClick={(event) => { event.stopPropagation(); downloadDocument(doc.id, doc.name); }} aria-label="Download"><Download size={15} /></button><button className="icon-btn hover:text-red-600" onClick={(event) => { event.stopPropagation(); setDeleteTarget(doc); }} aria-label="Delete"><Trash2 size={15} /></button></div>)}</div>}

      {folderDialog && <Modal title={folderDialog === 'new' ? 'New subject folder' : 'Rename subject folder'} onClose={() => { if (!folderBusy) setFolderDialog(null); }}><form onSubmit={event => { event.preventDefault(); saveFolder(); }}><label className="block text-sm">Subject name<input autoFocus className="field mt-2" placeholder="e.g. Biology" maxLength={80} value={folderName} onChange={event => setFolderName(event.target.value)} /></label><div className="mt-5 flex justify-end gap-2"><Button type="button" variant="ghost" disabled={folderBusy} onClick={() => setFolderDialog(null)}>Cancel</Button><Button type="submit" disabled={!folderName.trim()} loading={folderBusy}>Save folder</Button></div></form></Modal>}
      {folderDelete && <Modal title={`Delete “${folderDelete.name}”?`} description="Only the folder is removed. Its files, search index, and study references are kept. Files will appear in Unfiled." onClose={() => { if (!folderBusy) setFolderDelete(null); }}><div className="flex justify-end gap-2"><Button variant="ghost" disabled={folderBusy} onClick={() => setFolderDelete(null)}>Keep folder</Button><Button variant="danger" loading={folderBusy} onClick={removeFolder}>Delete folder</Button></div></Modal>}
      {deleteTarget && <Modal title="Delete this document?" description={`“${deleteTarget.name}” and its private search index will be permanently removed. This cannot be undone.`} onClose={() => setDeleteTarget(null)}><div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setDeleteTarget(null)}>Keep file</Button><Button variant="danger" loading={deleting} onClick={remove} icon={<Trash2 size={15} />}>Delete document</Button></div></Modal>}
    </div>
  );
}
