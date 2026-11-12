import {
  CheckCircle2, Download, File, FileImage, FileSpreadsheet, FileText, FolderOpen,
  ChevronRight, FolderPlus, Pencil, Move, PanelLeft, Grid2X2, HardDrive, List, Loader2, Search, Trash2, UploadCloud, X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type DragEvent, type MouseEvent } from 'react';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import FolderBrowser, { FolderDot, FolderTree, folderTrail, descendantIds, type FolderSelection } from '../components/FolderBrowser';
import DocumentViewer from '../components/DocumentViewer';
import { Button, EmptyState, Modal, Spinner } from '../components/ui';
import { useToast } from '../context/ToastContext';
import { api, downloadDocument } from '../lib/api';
import { cn, formatBytes } from '../lib/utils';
import type { StudyDocument, SubjectFolder } from '../types';

const accepted = '.pdf,.txt,.md,.png,.jpg,.jpeg,.webp,.docx,.odt,.pptx,.xlsx';
const imageTypes = ['.png', '.jpg', '.jpeg', '.webp'];

function DocumentIcon({ extension, size = 22 }: { extension: string; size?: number }) {
  if (imageTypes.includes(extension)) return <FileImage size={size} />;
  if (extension === '.xlsx') return <FileSpreadsheet size={size} />;
  if (extension === '.pdf' || extension === '.docx' || extension === '.odt' || extension === '.pptx') return <FileText size={size} />;
  return <File size={size} />;
}

function iconTone(extension: string) {
  if (extension === '.pdf') return 'bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-300';
  if (imageTypes.includes(extension)) return 'bg-violet-50 text-violet-600 dark:bg-violet-950/30 dark:text-violet-300';
  if (extension === '.xlsx') return 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-300';
  if (extension === '.docx' || extension === '.odt' || extension === '.pptx') return 'bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-300';
  return 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300';
}

export default function Files() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { documentId } = useParams();
  const fileInput = useRef<HTMLInputElement>(null);
  const [documents, setDocuments] = useState<StudyDocument[]>([]);
  const [folders, setFolders] = useState<SubjectFolder[]>([]);
  const [searchParams, setSearchParams] = useSearchParams();
  const folderParam = searchParams.get('folder') || 'root';
  const activeFolder: FolderSelection = /^\d+$/.test(folderParam) ? Number(folderParam) : folderParam === 'unfiled' ? 'unfiled' : 'root';
  const setActiveFolder = (value: FolderSelection) => setSearchParams(value === 'root' ? {} : { folder: String(value) });
  const libraryUrl = activeFolder === 'root' ? '/files' : `/files?folder=${activeFolder}`;
  const [folderPanelOpen, setFolderPanelOpen] = useState(false);
  const [folderParent, setFolderParent] = useState<number | null>(null);
  const dragIds = useRef<number[]>([]);
  const selectionAnchor = useRef<number | null>(null);
  const [dropFolder, setDropFolder] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [moveIds, setMoveIds] = useState<number[]>([]);
  const [moveBusy, setMoveBusy] = useState(false);
  const [newDestinationName, setNewDestinationName] = useState('');
  const [createDestination, setCreateDestination] = useState(false);
  const [moveDestination, setMoveDestination] = useState<number | null>(null);
  const [folderDialog, setFolderDialog] = useState<SubjectFolder | 'new' | null>(null);
  const [folderName, setFolderName] = useState('');
  const [folderDelete, setFolderDelete] = useState<SubjectFolder | null>(null);
  const [folderBusy, setFolderBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [layout, setLayout] = useState<'grid' | 'list'>('list');
  const [uploading, setUploading] = useState<string[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<StudyDocument | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async (silent = false) => {
    try {
      const [result, subjects] = await Promise.all([api<StudyDocument[]>('/documents'), api<SubjectFolder[]>('/folders')]);
      setDocuments(result);
      setFolders(subjects);

      setLoaded(true);
    } catch (error) { if (!silent) toast(error instanceof Error ? error.message : 'Could not load your library', 'error'); }
  }, [toast]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setSelectedIds(new Set()); }, [activeFolder, query, filter]);
  useEffect(() => {
    setSelectedIds(current => new Set([...current].filter(id => documents.some(doc => doc.id === id))));
  }, [documents]);
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
        if (activeFolder === 'root') setActiveFolder('unfiled');
        toast(`${file.name} added to your library`);
      } catch (error) { toast(error instanceof Error ? error.message : `Could not upload ${file.name}`, 'error'); }
      finally { setUploading((current) => current.filter((name) => name !== file.name)); }
    }
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

  const currentFolder = folders.find(folder => folder.id === activeFolder);
  const trail = typeof activeFolder === 'number' ? folderTrail(folders, activeFolder) : [];
  const childFolders = folders.filter(folder => folder.parent_id === (typeof activeFolder === 'number' ? activeFolder : null));
  const openFolderDialog = (folder: SubjectFolder | 'new', parent: number | null = null) => {
    setFolderDialog(folder); setFolderName(folder === 'new' ? '' : folder.name);
    setFolderParent(folder === 'new' ? parent : folder.parent_id);
  };
  const saveFolder = async () => {
    if (!folderDialog || !folderName.trim()) return;
    setFolderBusy(true);
    try {
      const folder = await api<SubjectFolder>(folderDialog === 'new' ? '/folders' : `/folders/${folderDialog.id}`, {
        method: folderDialog === 'new' ? 'POST' : 'PATCH', body: JSON.stringify({ name: folderName.trim(), parent_id: folderParent }),
      });
      await load(); setActiveFolder(folder.id); setFolderDialog(null);
      toast(folderDialog === 'new' ? 'Subject created' : 'Subject renamed');
    } catch (error) { toast(error instanceof Error ? error.message : 'Could not save subject', 'error'); }
    finally { setFolderBusy(false); }
  };
  const removeFolder = async () => {
    if (!folderDelete) return;
    setFolderBusy(true);
    try {
      await api(`/folders/${folderDelete.id}`, { method: 'DELETE' });
      await load(); if (activeFolder === folderDelete.id) setActiveFolder(folderDelete.parent_id ?? 'root'); setFolderDelete(null); toast('Subject removed. Files kept in Unfiled.');
    } catch (error) { toast(error instanceof Error ? error.message : 'Could not delete subject', 'error'); }
    finally { setFolderBusy(false); }
  };
  const openMove = (ids: number[], destination: number | null) => {
    setMoveIds(ids); setMoveDestination(destination); setCreateDestination(false); setNewDestinationName('');
  };
  const selectFile = (event: MouseEvent, id: number) => {
    if (event.shiftKey && selectionAnchor.current !== null) {
      const ordered = [...filtered].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
      const start = ordered.findIndex(doc => doc.id === selectionAnchor.current);
      const end = ordered.findIndex(doc => doc.id === id);
      if (start >= 0 && end >= 0) {
        setSelectedIds(current => new Set([...current, ...ordered.slice(Math.min(start, end), Math.max(start, end) + 1).map(doc => doc.id)]));
        return;
      }
    }
    selectionAnchor.current = id;
    setSelectedIds(current => {
      if (!event.metaKey && !event.ctrlKey) return new Set([id]);
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const startDrag = (event: DragEvent, id: number) => {
    if (moveBusy) { event.preventDefault(); return; }
    const ids = selectedIds.has(id) ? [...selectedIds] : [id];
    setSelectedIds(new Set(ids)); dragIds.current = ids;
    event.dataTransfer.setData('text/study-files', JSON.stringify(ids));
    event.dataTransfer.effectAllowed = 'move';
    const preview = document.createElement('div');
    preview.textContent = `${ids.length} ${ids.length === 1 ? 'file' : 'files'}`;
    preview.className = 'rounded-lg bg-accent px-3 py-2 text-sm text-white';
    preview.style.position = 'fixed'; preview.style.top = '-1000px';
    document.body.appendChild(preview); event.dataTransfer.setDragImage(preview, 0, 0);
    window.setTimeout(() => preview.remove(), 0);
  };
  const dropFiles = (destination: number | null) => {
    const ids = dragIds.current.filter(id => documents.some(doc => doc.id === id && doc.folder_id !== destination));
    dragIds.current = []; setDropFolder(null);
    if (ids.length) void moveFiles(ids, destination, false);
  };
  const moveFiles = async (ids = moveIds, target = moveDestination, create = createDestination) => {
    if (moveBusy || !ids.length || (create && !newDestinationName.trim())) return;
    setMoveBusy(true);
    try {
      let destination = target;
      if (create) {
        const folder = await api<SubjectFolder>('/folders', { method: 'POST', body: JSON.stringify({ name: newDestinationName.trim(), parent_id: destination }) });
        setFolders(current => [...current, folder]);
        destination = folder.id;
        // Keep the created destination for retries if some files cannot move.
        setMoveDestination(destination); setCreateDestination(false); setNewDestinationName('');
      }
      const results = await Promise.allSettled(ids.map(id => api<StudyDocument>(`/documents/${id}`, { method: 'PATCH', body: JSON.stringify({ folder_id: destination }) })));
      const updated = new Map<number, StudyDocument>();
      const failed: number[] = [];
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') updated.set(result.value.id, result.value);
        else failed.push(ids[index]);
      });
      setDocuments(current => current.map(doc => updated.get(doc.id) ?? doc));
      setSelectedIds(current => new Set([...current].filter(id => !updated.has(id))));
      setMoveIds(failed);
      if (updated.size) toast(`${updated.size} ${updated.size === 1 ? 'file moved' : 'files moved'}`);
      if (failed.length) toast(`${failed.length} ${failed.length === 1 ? 'file could' : 'files could'} not be moved. Retry the remaining files.`, 'error');
    } catch (error) { toast(error instanceof Error ? error.message : 'Could not create destination', 'error'); }
    finally { setMoveBusy(false); }
  };
  const folderPicker = (document: StudyDocument) => <button className={cn('flex max-w-full items-center gap-1.5 rounded-lg px-1 text-left text-[11px] text-muted hover:bg-canvas hover:text-accent', layout === 'list' ? 'mt-0.5 py-0.5' : 'mt-3 py-1')} onClick={event => { event.stopPropagation(); openMove([document.id], document.folder_id); }} aria-label={`Move ${document.name} to subject`}><Move size={12} className="shrink-0" /><FolderDot id={document.folder_id} /><span className="truncate">{document.folder_id ? folderTrail(folders, document.folder_id).map(folder => folder.name).join(' / ') || 'Subject' : 'Unfiled'}</span></button>;


  const selected = documents.find((doc) => doc.id === Number(documentId));
  if (documentId && selected) return <><DocumentViewer document={selected} onClose={() => navigate(libraryUrl)} onDelete={() => setDeleteTarget(selected)} onRefresh={() => load()} />{deleteTarget && <Modal title="Delete this document?" description="The original file and its search index will be permanently removed. Notes and study sessions will be kept." onClose={() => setDeleteTarget(null)}><div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setDeleteTarget(null)}>Keep file</Button><Button variant="danger" loading={deleting} onClick={remove} icon={<Trash2 size={15} />}>Delete document</Button></div></Modal>}</>;

  const filtered = documents.filter((doc) => {
    const matchesQuery = doc.name.toLowerCase().includes(query.toLowerCase());
    const matchesFilter = filter === 'all' || (filter === 'images' ? imageTypes.includes(doc.extension) : filter === 'pdf' ? doc.extension === '.pdf' : filter === 'notes' ? ['.txt', '.md'].includes(doc.extension) : ['.docx', '.odt', '.pptx', '.xlsx'].includes(doc.extension));
    const matchesFolder = activeFolder === 'unfiled' ? doc.folder_id === null : typeof activeFolder === 'number' && doc.folder_id === activeFolder;
    return matchesQuery && matchesFilter && matchesFolder;
  });
  const visibleSubjects = activeFolder === 'unfiled' ? [] : childFolders.filter(folder => folder.name.toLowerCase().includes(query.toLowerCase()));
  const entries = [
    ...visibleSubjects.map(folder => ({ kind: 'subject' as const, name: folder.name, folder })),
    ...filtered.map(document => ({ kind: 'document' as const, name: document.name, document })),
  ].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
  const subjectItem = (folder: SubjectFolder) => {
    const details = `${folders.filter(item => item.parent_id === folder.id).length} subjects · ${documents.filter(doc => doc.folder_id === folder.id).length} files`;
    return <div key={`subject-${folder.id}`} onDragOver={event => { if (!moveBusy && dragIds.current.length) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setDropFolder(folder.id); } }} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDropFolder(null); }} onDrop={event => { event.preventDefault(); dropFiles(folder.id); }} className={cn(dropFolder === folder.id && 'ring-2 ring-inset ring-accent bg-accent-soft dark:bg-accent-dark/40', 'flex min-w-0 items-center gap-2.5 transition hover:bg-canvas/60', layout === 'grid' ? 'card p-4' : 'px-3 py-2 sm:px-4')}>
      <button className="flex min-w-0 flex-1 items-center gap-2.5 text-left" title={folder.name} onClick={() => setActiveFolder(folder.id)}>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent dark:bg-accent-dark/40"><FolderOpen size={16} /></span>
        <span className="min-w-0 flex-1"><span className="flex items-center gap-1.5 text-xs font-medium"><FolderDot id={folder.id} /><span className="truncate">{folder.name}</span></span><span className="mt-0.5 block text-[11px] text-muted">{details}</span></span><ChevronRight size={14} className="shrink-0 text-muted" />
      </button>
      <button className="icon-btn h-8 w-8" title={`Edit ${folder.name}`} aria-label={`Edit ${folder.name}`} onClick={() => openFolderDialog(folder)}><Pencil size={14} /></button>
    </div>;
  };
  const storage = documents.reduce((sum, doc) => sum + doc.size, 0);

  return (
    <div className="relative flex h-full min-h-0">
      {folderPanelOpen && <button className="fixed inset-0 z-20 bg-black/30 lg:hidden" aria-label="Close subjects" onClick={() => setFolderPanelOpen(false)} />}
      <div className={cn('shrink-0 lg:static lg:z-auto lg:block lg:w-64', folderPanelOpen ? 'fixed inset-y-0 left-0 z-30 w-72 shadow-float' : 'hidden')}><FolderBrowser folders={folders} selected={activeFolder} onSelect={value => { setActiveFolder(value); setFolderPanelOpen(false); }} onNew={() => openFolderDialog('new')} onDropFiles={dropFiles} canDropFiles={() => !moveBusy && dragIds.current.length > 0} /></div>
      <div className="min-w-0 flex-1 overflow-y-auto"><div className="mx-auto max-w-[1440px] px-4 py-3 sm:px-6 sm:py-4 lg:px-7">
      <section className="mb-2">
        <div><button className="mb-3 inline-flex items-center gap-2 text-xs font-medium text-accent lg:hidden" onClick={() => setFolderPanelOpen(true)}><PanelLeft size={16} />Browse subjects</button><h2 className="flex items-center gap-2 text-2xl font-semibold tracking-[-.04em]">{currentFolder && <FolderDot id={currentFolder.id} />}{currentFolder?.name || (activeFolder === 'unfiled' ? 'Unfiled' : 'Your study library')}</h2><p className="mt-1.5 text-sm text-muted">Everything you need, organized and searchable.</p></div>
        <input ref={fileInput} type="file" className="hidden" accept={accepted} multiple onChange={(event) => { uploadFiles(Array.from(event.target.files || [])); event.target.value = ''; }} />
      </section>

      <section className="mb-1">
        <nav aria-label="Subject breadcrumb" className="mb-2 flex flex-wrap items-center gap-1 text-xs text-muted"><button className="rounded px-1 py-1 hover:text-accent" onClick={() => setActiveFolder('root')}>Library</button>{trail.map(folder => <span key={folder.id} className="flex min-w-0 items-center gap-1"><ChevronRight size={12} /><button className="inline-flex max-w-48 items-center gap-1.5 rounded px-1 py-1 hover:text-accent" onClick={() => setActiveFolder(folder.id)}><FolderDot id={folder.id} /><span className="truncate">{folder.name}</span></button></span>)}{activeFolder === 'unfiled' && <span>/ Unfiled</span>}</nav>
        <div className="mb-2 flex items-center gap-1">
          <button className="icon-btn h-8 w-8" title={currentFolder ? 'New subsubject' : 'New subject'} aria-label={currentFolder ? 'New subsubject' : 'New subject'} onClick={() => openFolderDialog('new', typeof activeFolder === 'number' ? activeFolder : null)}><FolderPlus size={16} /></button>
          {currentFolder && <><button className="icon-btn h-8 w-8" title="Edit subject" aria-label="Edit subject" onClick={() => openFolderDialog(currentFolder)}><Pencil size={15} /></button><button className="icon-btn h-8 w-8 hover:text-red-600" title="Delete subject" aria-label="Delete subject" onClick={() => setFolderDelete(currentFolder)}><Trash2 size={15} /></button></>}
        </div>
      </section>

      {uploading.length > 0 && <div role="status" className="mb-3 flex items-center gap-2 text-xs text-muted"><Spinner />Uploading {uploading.length} {uploading.length === 1 ? 'file' : 'files'}… <span className="truncate">{uploading[0]}</span></div>}
      <section className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1 sm:max-w-xs"><Search size={15} className="absolute left-3 top-3 text-muted" /><input className="field h-10 pl-9 pr-8" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search your library…" />{query && <button className="icon-btn absolute right-0.5 top-0.5 h-9 w-9" onClick={() => setQuery('')}><X size={14} /></button>}</div>
        <Button className="h-10 shrink-0 px-3 text-xs" onClick={() => fileInput.current?.click()} icon={<UploadCloud size={15} />}>Upload files</Button>
        <div className="subtle-scrollbar flex flex-1 gap-1 overflow-x-auto">{[['all', 'All types'], ['pdf', 'PDFs'], ['office', 'Office'], ['notes', 'Text & notes'], ['images', 'Images']].map(([value, label]) => <button key={value} onClick={() => setFilter(value)} className={cn('whitespace-nowrap rounded-lg px-3 py-2 text-xs font-medium transition', filter === value ? 'bg-accent-soft text-accent-dark dark:bg-accent-dark/40 dark:text-emerald-100' : 'text-muted hover:bg-surface hover:text-ink')}>{label}</button>)}</div>
        <div className="flex items-center rounded-xl border border-line bg-surface p-1"><button className={cn('icon-btn h-7 w-7 rounded-md', layout === 'grid' && 'bg-canvas text-ink')} onClick={() => setLayout('grid')} aria-label="Grid view"><Grid2X2 size={14} /></button><button className={cn('icon-btn h-7 w-7 rounded-md', layout === 'list' && 'bg-canvas text-ink')} onClick={() => setLayout('list')} aria-label="List view"><List size={15} /></button></div>
      </section>

      {filtered.length > 0 && <div className="mb-2 flex min-h-8 items-center gap-2 text-xs text-muted">
        <span className="flex-1">Click to select · Ctrl/Cmd-click for multiple · Shift-click for a range · Double-click to open · Drag onto a subject to move</span>
        {selectedIds.size > 0 && <><span role="status">{selectedIds.size} selected</span><button className="icon-btn h-8 w-8" title="Move selected files or create a subsubject" aria-label="Move selected files" onClick={() => openMove([...selectedIds], typeof activeFolder === 'number' ? activeFolder : null)}><Move size={15} /></button><button className="icon-btn h-8 w-8" title="Clear selection" aria-label="Clear selection" onClick={() => setSelectedIds(new Set())}><X size={14} /></button></>}
      </div>}

      <div className="mb-3 flex items-center justify-between text-[11px] text-muted"><span>{visibleSubjects.length} {visibleSubjects.length === 1 ? 'subject' : 'subjects'} · {filtered.length} {filtered.length === 1 ? 'document' : 'documents'}</span><span className="flex items-center gap-1.5"><HardDrive size={12} />{formatBytes(storage)} stored locally</span></div>

      {!loaded ? <div className="flex h-64 items-center justify-center"><Spinner /></div> : entries.length === 0 ? <div className="card"><EmptyState icon={<FolderOpen size={24} />} title={query || filter !== 'all' ? 'No matching items' : currentFolder ? 'This subject is empty' : 'Your library is ready for its first file'} description={documents.length ? 'Try another search or filter to find what you need.' : 'Upload a syllabus, lecture slides, or notes. StudyOS will make them searchable.'} action={!documents.length && <Button onClick={() => fileInput.current?.click()} icon={<UploadCloud size={16} />}>Choose a file</Button>} /></div>
        : layout === 'grid' ? <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">{entries.map(item => { if (item.kind === 'subject') return subjectItem(item.folder); const doc = item.document; return <article key={doc.id} draggable={!moveBusy} tabIndex={0} aria-label={`${doc.name}${selectedIds.has(doc.id) ? ', selected' : ''}`} onClick={event => selectFile(event, doc.id)} onDoubleClick={() => navigate(`/files/${doc.id}?folder=${activeFolder}`)} onKeyDown={event => { if (event.target !== event.currentTarget) return; if (event.key === 'Enter') navigate(`/files/${doc.id}?folder=${activeFolder}`); if (event.key === ' ') { event.preventDefault(); setSelectedIds(current => { const next = new Set(current); if (next.has(doc.id)) next.delete(doc.id); else next.add(doc.id); return next; }); } }} onDragStart={event => startDrag(event, doc.id)} onDragEnd={() => { dragIds.current = []; setDropFolder(null); }} className={cn('card group cursor-grab select-none overflow-hidden transition duration-200 hover:border-accent/30 active:cursor-grabbing', selectedIds.has(doc.id) && 'ring-2 ring-inset ring-accent bg-accent-soft dark:bg-accent-dark/40')}>
          <div className="relative flex h-32 items-center justify-center border-b border-line bg-canvas/65"><span className={cn('flex h-16 w-14 items-center justify-center rounded-xl shadow-sm transition group-hover:scale-105', iconTone(doc.extension))}><DocumentIcon extension={doc.extension} size={28} /></span><span className="absolute bottom-3 right-3 rounded-md bg-surface/90 px-1.5 py-0.5 text-[9px] font-bold uppercase text-muted shadow-sm">{doc.extension.replace('.', '')}</span><div className="absolute right-2 top-2 flex opacity-0 transition group-hover:opacity-100"><button className="icon-btn h-8 w-8 bg-surface/90 shadow-sm" onClick={(event) => { event.stopPropagation(); downloadDocument(doc.id, doc.name); }} aria-label="Download"><Download size={14} /></button><button className="icon-btn h-8 w-8 bg-surface/90 shadow-sm hover:text-red-600" onClick={(event) => { event.stopPropagation(); setDeleteTarget(doc); }} aria-label="Delete"><Trash2 size={14} /></button></div></div>
          <div className="p-4"><h3 className="truncate text-sm font-semibold" title={doc.name}>{doc.name}</h3><div className="mt-2 flex items-center justify-between text-[10px] text-muted"><span>{formatBytes(doc.size)} · {formatDistanceToNow(parseISO(doc.created_at), { addSuffix: true })}</span>{doc.status === 'processing' ? <span className="flex items-center gap-1 text-amber-600"><Loader2 size={11} className="animate-spin" />Indexing</span> : doc.status === 'ready' ? <span className="flex items-center gap-1 text-emerald-600"><CheckCircle2 size={11} />AI ready</span> : <span className="text-red-500">Read error</span>}</div>{folderPicker(doc)}</div>
        </article>; })}</div>
        : <div className="card divide-y divide-line overflow-hidden">{entries.map(item => { if (item.kind === 'subject') return subjectItem(item.folder); const doc = item.document; return <div key={doc.id} draggable={!moveBusy} tabIndex={0} aria-label={`${doc.name}${selectedIds.has(doc.id) ? ', selected' : ''}`} onClick={event => selectFile(event, doc.id)} onDoubleClick={() => navigate(`/files/${doc.id}?folder=${activeFolder}`)} onKeyDown={event => { if (event.target !== event.currentTarget) return; if (event.key === 'Enter') navigate(`/files/${doc.id}?folder=${activeFolder}`); if (event.key === ' ') { event.preventDefault(); setSelectedIds(current => { const next = new Set(current); if (next.has(doc.id)) next.delete(doc.id); else next.add(doc.id); return next; }); } }} onDragStart={event => startDrag(event, doc.id)} onDragEnd={() => { dragIds.current = []; setDropFolder(null); }} className={cn('group flex cursor-grab select-none items-center gap-2.5 px-3 py-2 transition hover:bg-canvas/60 active:cursor-grabbing sm:px-4', selectedIds.has(doc.id) && 'bg-accent-soft ring-1 ring-inset ring-accent dark:bg-accent-dark/40')}><span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', iconTone(doc.extension))}><DocumentIcon extension={doc.extension} size={16} /></span><div className="min-w-0 flex-1"><p className="truncate text-xs font-medium">{doc.name}</p>{folderPicker(doc)}<p className="mt-1 text-[10px] text-muted sm:hidden">{formatBytes(doc.size)} · {doc.status}</p></div><span className="hidden w-20 text-xs text-muted md:block">{formatBytes(doc.size)}</span><span className="hidden w-28 text-xs capitalize text-muted sm:block">{doc.status === 'ready' ? 'AI ready' : doc.status}</span><span className="hidden w-32 text-xs text-muted lg:block">{formatDistanceToNow(parseISO(doc.created_at), { addSuffix: true })}</span><button className="icon-btn" onClick={(event) => { event.stopPropagation(); downloadDocument(doc.id, doc.name); }} aria-label="Download"><Download size={15} /></button><button className="icon-btn hover:text-red-600" onClick={(event) => { event.stopPropagation(); setDeleteTarget(doc); }} aria-label="Delete"><Trash2 size={15} /></button></div>; })}</div>}

      {folderDialog && <Modal title={folderDialog === 'new' ? folderParent === null ? 'New subject' : 'New subsubject' : 'Edit subject'} onClose={() => { if (!folderBusy) setFolderDialog(null); }}><form onSubmit={event => { event.preventDefault(); saveFolder(); }}><label className="block text-sm">Subject name<input autoFocus className="field mt-2" placeholder="e.g. Biology" maxLength={80} value={folderName} onChange={event => setFolderName(event.target.value)} /></label><p className="mt-4 text-xs font-medium text-muted">Parent subject</p><div className="mt-2 flex h-60 flex-col overflow-hidden rounded-xl border border-line"><FolderTree folders={folders} showRoot={false} rootLabel="Library root" selected={folderParent ?? 'unfiled'} excluded={folderDialog === 'new' ? new Set() : descendantIds(folders, folderDialog.id)} onSelect={value => setFolderParent(typeof value === 'number' ? value : null)} /></div><div className="mt-5 flex justify-end gap-2"><Button type="button" variant="ghost" disabled={folderBusy} onClick={() => setFolderDialog(null)}>Cancel</Button><Button type="submit" disabled={!folderName.trim()} loading={folderBusy}>Save subject</Button></div></form></Modal>}
      {folderDelete && <Modal title={`Delete “${folderDelete.name}”?`} description="Only this subject is removed. Its files move to Unfiled. Its subsubjects move up one level, keeping their files and organization." onClose={() => { if (!folderBusy) setFolderDelete(null); }}><div className="flex justify-end gap-2"><Button variant="ghost" disabled={folderBusy} onClick={() => setFolderDelete(null)}>Keep subject</Button><Button variant="danger" loading={folderBusy} onClick={removeFolder}>Delete subject</Button></div></Modal>}
      {moveIds.length > 0 && <Modal title={`Move ${moveIds.length} ${moveIds.length === 1 ? 'file' : 'files'}`} onClose={() => { if (!moveBusy) setMoveIds([]); }}>
        <p className="mb-2 text-xs text-muted">{createDestination ? 'Choose the parent subject for your new subsubject.' : 'Choose a destination subject, or create a new subsubject inside it.'}</p>
        <fieldset disabled={moveBusy} className="min-w-0">
          <div className="flex h-60 flex-col overflow-hidden rounded-xl border border-line"><FolderTree folders={folders} showRoot={false} rootLabel={createDestination ? 'Library root' : 'Unfiled'} selected={moveDestination ?? 'unfiled'} onSelect={value => setMoveDestination(typeof value === 'number' ? value : null)} /></div>
          <button type="button" className="mt-3 flex items-center gap-2 text-xs text-accent" aria-pressed={createDestination} onClick={() => setCreateDestination(current => !current)}><FolderPlus size={14} />{createDestination ? 'Use an existing subject' : 'Create a new subsubject'}</button>
          {createDestination && <label className="mt-3 block text-xs">New subsubject name<input className="field mt-1" value={newDestinationName} onChange={event => setNewDestinationName(event.target.value)} maxLength={80} placeholder="e.g. Chapter 1" /></label>}
        </fieldset>
        <div className="mt-4 flex justify-end gap-2"><Button variant="ghost" disabled={moveBusy} onClick={() => setMoveIds([])}>Cancel</Button><Button loading={moveBusy} disabled={createDestination && !newDestinationName.trim()} onClick={() => moveFiles()}>{createDestination ? 'Create & move' : 'Move files'}</Button></div>
      </Modal>}
      {deleteTarget && <Modal title="Delete this document?" description={`“${deleteTarget.name}” and its private search index will be permanently removed. This cannot be undone.`} onClose={() => setDeleteTarget(null)}><div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setDeleteTarget(null)}>Keep file</Button><Button variant="danger" loading={deleting} onClick={remove} icon={<Trash2 size={15} />}>Delete document</Button></div></Modal>}
      </div></div>
    </div>
  );
}
