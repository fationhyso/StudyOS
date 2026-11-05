import {
  Bold, Check, ChevronLeft, PanelLeftClose, PanelLeftOpen, Clock3, Code2, Eye, FileText, GripVertical, Heading2,
  Download, Italic, Link2, List, MoreHorizontal, PencilLine, Plus, Quote, Search, Star, Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { useSearchParams } from 'react-router-dom';
import { Button, EmptyState, Markdown, Spinner } from '../components/ui';
import { useToast } from '../context/ToastContext';
import { api, downloadMarkdownNote } from '../lib/api';
import { cn } from '../lib/utils';
import type { Note } from '../types';

export default function Notes() {
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [notes, setNotes] = useState<Note[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [query, setQuery] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [preview, setPreview] = useState<'edit' | 'split' | 'preview'>('preview');
  const [listCollapsed, setListCollapsed] = useState(false);
  const [mobileList, setMobileList] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [draggedId, setDraggedId] = useState<number | null>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const handledQuery = useRef<string | null>(null);
  const latestDraft = useRef({ activeId, title, content });
  latestDraft.current = { activeId, title, content };
  const activeNote = notes.find((note) => note.id === activeId) || null;

  useEffect(() => {
    api<Note[]>('/notes').then((result) => {
      setNotes(result);
      setLoaded(true);
    }).catch((error) => toast(error instanceof Error ? error.message : 'Could not load notes', 'error'));
  }, [toast]);

  const createNote = useCallback(async () => {
    try {
      const note = await api<Note>('/notes', { method: 'POST', body: JSON.stringify({ title: 'Untitled', content: '' }) });
      setNotes((current) => [...current, note]);
      setActiveId(note.id);
      setMobileList(false);
      setSearchParams({ note: String(note.id) }, { replace: true });
      window.setTimeout(() => textarea.current?.focus(), 100);
    } catch (error) { toast(error instanceof Error ? error.message : 'Could not create a note', 'error'); }
  }, [setSearchParams, toast]);

  useEffect(() => {
    if (!loaded) return;
    const key = searchParams.toString();
    if (handledQuery.current === key) return;
    handledQuery.current = key;
    if (searchParams.get('new') === '1') { createNote(); return; }
    const requested = Number(searchParams.get('note'));
    if (requested && notes.some((note) => note.id === requested)) setActiveId(requested);
    else if (!activeId && notes.length) setActiveId(notes[0].id);
  }, [loaded, searchParams, notes, activeId, createNote]);

  useEffect(() => {
    if (!activeNote) { setTitle(''); setContent(''); return; }
    setTitle(activeNote.title);
    setContent(activeNote.content);
    setDirty(false);
    setMenuOpen(false);
    setConfirmDelete(false);
    setPreview('preview');
  }, [activeId]); // Drafts intentionally reset only when changing notes.

  const persist = useCallback(async () => {
    if (!activeId || !dirty) return;
    const snapshot = { title: title.trim() || 'Untitled', content };
    setSaving(true);
    try {
      const updated = await api<Note>(`/notes/${activeId}`, { method: 'PATCH', body: JSON.stringify(snapshot) });
      setNotes((current) => current.map((note) => note.id === updated.id ? { ...updated, title: snapshot.title, content: snapshot.content } : note));
      const latest = latestDraft.current;
      if (latest.activeId === activeId && latest.title === title && latest.content === content) setDirty(false);
    } catch (error) { toast(error instanceof Error ? error.message : 'Could not save note', 'error'); }
    finally { setSaving(false); }
  }, [activeId, dirty, title, content, toast]);

  useEffect(() => {
    if (!dirty || !activeId) return;
    const timer = window.setTimeout(persist, 800);
    return () => clearTimeout(timer);
  }, [dirty, activeId, title, content, persist]);

  const togglePreview = useCallback(() => setPreview(current => current === 'preview' ? 'edit' : 'preview'), []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (activeId && (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'e') {
        event.preventDefault();
        if (!event.repeat) togglePreview();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeId, togglePreview]);

  useEffect(() => {
    if (preview !== 'edit') return;
    const frame = requestAnimationFrame(() => textarea.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [preview]);

  const selectNote = (id: number) => {
    if (id === activeId) { setMobileList(false); return; }
    if (dirty) void persist();
    setActiveId(id);
    setSearchParams({ note: String(id) }, { replace: true });
    setMobileList(false);
  };

  const updateDraft = (field: 'title' | 'content', value: string) => {
    if (field === 'title') setTitle(value); else setContent(value);
    setDirty(true);
  };

  const toggleFavorite = async () => {
    if (!activeNote) return;
    try {
      const updated = await api<Note>(`/notes/${activeNote.id}`, { method: 'PATCH', body: JSON.stringify({ is_favorite: !activeNote.is_favorite }) });
      setNotes((current) => current.map((note) => note.id === updated.id ? { ...updated, title, content } : note));
    } catch (error) { toast(error instanceof Error ? error.message : 'Could not update note', 'error'); }
  };

  const deleteNote = async () => {
    if (!activeNote) return;
    try {
      await api(`/notes/${activeNote.id}`, { method: 'DELETE' });
      const remaining = notes.filter((note) => note.id !== activeNote.id);
      setNotes(remaining);
      setActiveId(remaining[0]?.id || null);
      setSearchParams({}, { replace: true });
      setMenuOpen(false);
      toast('Note moved out of your workspace');
    } catch (error) { toast(error instanceof Error ? error.message : 'Could not delete note', 'error'); }
  };

  const reorder = async (targetId: number) => {
    if (!draggedId || draggedId === targetId || query) return;
    const ordered = [...notes];
    const from = ordered.findIndex((note) => note.id === draggedId);
    const to = ordered.findIndex((note) => note.id === targetId);
    const [moved] = ordered.splice(from, 1);
    ordered.splice(to, 0, moved);
    setNotes(ordered);
    setDraggedId(null);
    try { await Promise.all(ordered.map((note, position) => api(`/notes/${note.id}`, { method: 'PATCH', body: JSON.stringify({ position }) }))); }
    catch { toast('Could not save the new note order', 'error'); }
  };

  const insertMarkdown = (before: string, after = '', placeholder = '') => {
    const field = textarea.current;
    if (!field) return;
    const start = field.selectionStart;
    const end = field.selectionEnd;
    const selected = content.slice(start, end) || placeholder;
    updateDraft('content', content.slice(0, start) + before + selected + after + content.slice(end));
    window.setTimeout(() => { field.focus(); field.setSelectionRange(start + before.length, start + before.length + selected.length); }, 0);
  };

  const filtered = useMemo(() => notes.filter((note) => `${note.title} ${note.content}`.toLowerCase().includes(query.toLowerCase())), [notes, query]);
  const words = content.trim() ? content.trim().split(/\s+/).length : 0;
  const tools = [
    { label: 'Heading', icon: Heading2, action: () => insertMarkdown('\n## ', '', 'Heading') },
    { label: 'Bold', icon: Bold, action: () => insertMarkdown('**', '**', 'bold text') },
    { label: 'Italic', icon: Italic, action: () => insertMarkdown('_', '_', 'italic text') },
    { label: 'Bullet list', icon: List, action: () => insertMarkdown('\n- ', '', 'List item') },
    { label: 'Quote', icon: Quote, action: () => insertMarkdown('\n> ', '', 'Quote') },
    { label: 'Code', icon: Code2, action: () => insertMarkdown('`', '`', 'code') },
    { label: 'Link', icon: Link2, action: () => insertMarkdown('[', '](https://)', 'link text') },
  ];

  return (
    <div className="relative flex h-full min-h-[620px]">
      {mobileList && <button className="fixed inset-0 z-30 bg-black/30 md:hidden" onClick={() => setMobileList(false)} aria-label="Close notes list" />}
      <aside className={cn('z-40 w-[290px] shrink-0 flex-col border-r border-line bg-sidebar', mobileList ? 'fixed inset-y-0 left-0 flex shadow-float' : listCollapsed ? 'hidden' : 'hidden md:flex')}>
        <div className="border-b border-line p-3.5">
          <div className="mb-3 flex items-center justify-between"><div><h2 className="text-sm font-semibold">All notes</h2><p className="mt-0.5 text-[10px] text-muted">{notes.length} {notes.length === 1 ? 'page' : 'pages'}</p></div><button className="icon-btn bg-surface shadow-sm" onClick={createNote} aria-label="New note"><Plus size={17} /></button></div>
          <div className="relative"><Search size={14} className="absolute left-3 top-2.5 text-muted" /><input className="field h-9 bg-surface pl-8 pr-3 text-xs" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search notes…" aria-label="Search notes" /></div>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {filtered.map((note) => <div key={note.id} draggable={!query} onDragStart={() => setDraggedId(note.id)} onDragOver={(e) => e.preventDefault()} onDrop={() => reorder(note.id)} onClick={() => selectNote(note.id)} className={cn('group mb-1 cursor-pointer rounded-xl border border-transparent p-3 transition', activeId === note.id ? 'border-line bg-surface shadow-sm' : 'hover:bg-surface/70')}>
            <div className="flex items-start gap-2"><GripVertical size={13} className="mt-0.5 shrink-0 text-muted opacity-0 group-hover:opacity-50" /><div className="min-w-0 flex-1"><div className="flex items-center gap-1.5"><p className="truncate text-xs font-semibold">{note.title || 'Untitled'}</p>{note.is_favorite && <Star size={11} className="shrink-0 fill-amber-400 text-amber-400" />}</div><p className="mt-1.5 line-clamp-2 text-[11px] leading-4 text-muted">{note.content || 'No additional text'}</p><p className="mt-2 text-[9px] text-muted/80">{formatDistanceToNow(parseISO(note.updated_at), { addSuffix: true })}</p></div></div>
          </div>)}
          {!filtered.length && <div className="px-4 py-10 text-center"><FileText size={20} className="mx-auto text-muted" /><p className="mt-2 text-xs text-muted">{query ? 'No notes match your search.' : 'Your thoughts belong here.'}</p></div>}
        </div>
        <div className="border-t border-line p-3 text-center text-[10px] text-muted">Drag notes to reorder your workspace</div>
      </aside>

      {activeNote ? <section className="flex min-w-0 flex-1 flex-col bg-surface">
        <div className="flex min-h-14 flex-wrap items-center gap-1 border-b border-line px-3 py-2 sm:px-5">
          <button className="icon-btn md:hidden" onClick={() => setMobileList(true)} aria-label="Show all notes"><ChevronLeft size={18} /></button>
          <button className="icon-btn hidden md:inline-flex" onClick={() => setListCollapsed(value => !value)} aria-label={listCollapsed ? "Expand notes panel" : "Collapse notes panel"}>{listCollapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}</button>
          <div className="mr-auto flex items-center gap-1.5 text-[11px] text-muted">{saving ? <><Spinner className="h-3 w-3" />Saving…</> : dirty ? <><Clock3 size={12} />Unsaved changes</> : <><Check size={12} className="text-accent" />Saved</>}</div>
          <div className={cn("hidden items-center rounded-lg border border-line p-0.5 sm:flex", preview === 'preview' && 'sm:hidden')}>{tools.map(({ label, icon: Icon, action }) => <button key={label} type="button" className="icon-btn h-7 w-7 rounded-md" onClick={action} title={label} aria-label={label}><Icon size={14} /></button>)}</div>
          <span className="mx-1 hidden h-5 w-px bg-line sm:block" />
          <button className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-canvas px-2 text-xs font-medium text-accent" onClick={togglePreview} title="Toggle preview (⌘/Ctrl+E)" aria-label={preview === 'preview' ? 'Edit Markdown' : 'Preview Markdown'} aria-keyshortcuts="Control+e Meta+e">{preview === 'preview' ? <PencilLine size={15} /> : <Eye size={15} />}{preview === 'preview' ? 'Edit' : 'Preview'}</button>
          <button className="icon-btn h-8 w-8" onClick={() => downloadMarkdownNote(title, content)} title="Download Markdown (.md)" aria-label="Download Markdown note"><Download size={16} /></button>
          <button className={cn('hidden h-8 rounded-lg px-2 text-[11px] font-medium lg:block', preview === 'split' ? 'bg-canvas text-accent' : 'text-muted')} onClick={() => setPreview(preview === 'split' ? 'edit' : 'split')}>Split</button>
          <button className="icon-btn h-8 w-8" onClick={toggleFavorite} aria-label={activeNote.is_favorite ? 'Remove from favorites' : 'Add to favorites'}><Star size={16} className={activeNote.is_favorite ? 'fill-amber-400 text-amber-400' : ''} /></button>
          <div className="relative"><button className="icon-btn h-8 w-8" onClick={() => setMenuOpen(!menuOpen)} aria-label="More note actions"><MoreHorizontal size={17} /></button>{menuOpen && <><button className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} aria-label="Close menu" /><div className="absolute right-0 top-10 z-20 w-52 rounded-xl border border-line bg-surface p-2 shadow-float">{confirmDelete ? <div className="p-1"><p className="text-xs font-medium">Delete this note permanently?</p><div className="mt-3 flex gap-2"><Button variant="danger" className="h-8 flex-1 px-2 text-xs" onClick={deleteNote}>Delete</Button><Button variant="ghost" className="h-8 px-2 text-xs" onClick={() => setConfirmDelete(false)}>Keep</Button></div></div> : <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30" onClick={() => setConfirmDelete(true)}><Trash2 size={14} />Delete note</button>}</div></>}</div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className={cn('mx-auto min-h-full max-w-[1200px] px-5 py-7 sm:px-10 lg:px-14', preview === 'split' && 'grid max-w-none grid-cols-2 gap-0 px-0 py-0 lg:px-0')}>
            <div className={cn(preview === 'preview' && 'hidden', preview === 'split' && 'min-w-0 border-r border-line px-7 py-7')}>
              <textarea className="field h-auto min-h-14 resize-none overflow-hidden border-transparent bg-transparent px-0 py-1 text-3xl font-bold tracking-[-.04em] placeholder:text-muted/40 focus:border-transparent focus:ring-0 sm:text-4xl" rows={1} value={title} onChange={(e) => updateDraft('title', e.target.value)} onInput={(e) => { const target = e.currentTarget; target.style.height = 'auto'; target.style.height = `${target.scrollHeight}px`; }} placeholder="Untitled" aria-label="Note title" maxLength={255} />
              <textarea ref={textarea} className="mt-4 min-h-[calc(100vh-270px)] w-full resize-none bg-transparent text-[15px] leading-7 text-ink outline-none placeholder:text-muted/45" value={content} onChange={(e) => updateDraft('content', e.target.value)} placeholder="Start writing, or use the toolbar to add structure…" aria-label="Note content" />
            </div>
            {preview !== 'edit' && <div className={cn('min-w-0', preview === 'split' ? 'overflow-y-auto bg-canvas/40 px-7 py-7' : '')}><h1 className="mb-8 text-4xl font-bold tracking-[-.04em]">{title || 'Untitled'}</h1>{content ? <Markdown>{content}</Markdown> : <p className="text-sm italic text-muted">Choose Edit or press ⌘/Ctrl+E to start writing. Use $...$ for inline math and $$...$$ for display equations.</p>}</div>}
          </div>
        </div>
        <footer className="flex h-8 shrink-0 items-center justify-between border-t border-line px-5 text-[10px] text-muted"><span>{words} {words === 1 ? 'word' : 'words'} · Markdown + LaTeX</span><button className="hidden items-center gap-1 hover:text-ink sm:flex" onClick={togglePreview}><PencilLine size={11} />{preview === 'preview' ? 'Edit Markdown' : 'Preview document'} · ⌘/Ctrl+E</button></footer>
      </section> : <section className="flex flex-1 items-center justify-center bg-surface"><EmptyState icon={<FileText size={23} />} title="A blank page, full of possibility" description="Capture lecture notes, connect ideas, or write a helpful summary for your future self." action={<Button onClick={createNote} icon={<Plus size={16} />}>Create your first note</Button>} /></section>}
    </div>
  );
}
