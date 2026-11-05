import { ChevronLeft, ChevronRight, Download, Maximize2, Minus, Plus, RotateCw, Search, X, Highlighter, Trash2, BookMarked, Undo2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import 'react-pdf/dist/esm/Page/TextLayer.css';
import { api, downloadDocument } from '../lib/api';
import { Spinner } from './ui';
import { captureHighlights, rotateRect, type HighlightDraft, type PdfHighlight } from '../lib/pdfHighlights';
import { useToast } from '../context/ToastContext';

pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character] || character);
}

function ScrollPage({ number, scale, rotation, root, textRenderer, highlights }: {
  number: number; scale: number; rotation: number;
  root: RefObject<HTMLDivElement | null>;
  highlights: PdfHighlight[];
  textRenderer: ({ str }: { str: string }) => string;
}) {
  const element = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(number === 1);
  const [size, setSize] = useState({ width: 612, height: 792 });
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), {
      root: root.current, rootMargin: '1000px 0px',
    });
    if (element.current) observer.observe(element.current);
    return () => observer.disconnect();
  }, [root]);
  const sideways = rotation % 180 !== 0;
  return <div ref={element} data-pdf-page={number} aria-label={`PDF page ${number}`} className="relative mx-auto mb-6 bg-white shadow-float" style={{ width: (sideways ? size.height : size.width) * scale, height: (sideways ? size.width : size.height) * scale }}>
    {visible ? <Page pageNumber={number} scale={scale} rotate={rotation} renderAnnotationLayer renderTextLayer customTextRenderer={textRenderer}
      onLoadSuccess={pdfPage => { const viewport = pdfPage.getViewport({ scale: 1, rotation: 0 }); setSize({ width: viewport.width, height: viewport.height }); }}
      loading={<div className="flex h-full items-center justify-center text-muted"><Spinner /></div>} />
      : <div className="flex h-full items-center justify-center text-xs text-gray-400">Page {number}</div>}
    <div className="pointer-events-none absolute inset-0 z-[2] mix-blend-multiply" aria-hidden="true">{highlights.flatMap(highlight => highlight.rects.map((rect, index) => {
      const display = rotateRect(rect, rotation);
      return <span key={`${highlight.id}-${index}`} className="absolute bg-yellow-300/45" style={{ left: `${display.x * 100}%`, top: `${display.y * 100}%`, width: `${display.width * 100}%`, height: `${display.height * 100}%` }} />;
    }))}</div>
  </div>;
}

export default function PdfViewer({ blob, documentId, filename, pageTexts }: {
  blob: Blob;
  documentId: number;
  filename: string;
  pageTexts: string[];
}) {
  const { toast } = useToast();
  const [highlights, setHighlights] = useState<PdfHighlight[]>([]);
  const [draft, setDraft] = useState<HighlightDraft[]>([]);
  const [savingHighlight, setSavingHighlight] = useState(false);
  const [undoStack, setUndoStack] = useState<number[][]>([]);
  const [undoing, setUndoing] = useState(false);
  const [showHighlights, setShowHighlights] = useState(false);
  useEffect(() => {
    let cancelled = false;
    api<PdfHighlight[]>(`/documents/${documentId}/highlights`).then(items => { if (!cancelled) setHighlights(items); }).catch(error => { if (!cancelled) toast(error instanceof Error ? error.message : 'Could not load highlights', 'error'); });
    return () => { cancelled = true; };
  }, [documentId, toast]);
  const saveHighlight = async () => {
    setSavingHighlight(true);
    const pending = [...draft];
    const savedIds: number[] = [];
    try {
      // Save sequentially so a failed multi-page selection can retry only unsaved pages.
      while (pending.length) {
        const item = await api<PdfHighlight>(`/documents/${documentId}/highlights`, { method: 'POST', body: JSON.stringify(pending[0]) });
        setHighlights(current => [...current, item]); savedIds.push(item.id); pending.shift(); setDraft([...pending]);
      }
      window.getSelection()?.removeAllRanges(); toast('Highlight saved');
    } catch (error) { toast(error instanceof Error ? error.message : 'Could not save highlight', 'error'); }
    finally { if (savedIds.length) setUndoStack(current => [...current, savedIds]); setSavingHighlight(false); }
  };
  const removeHighlight = async (id: number) => {
    try { await api(`/documents/${documentId}/highlights/${id}`, { method: 'DELETE' }); setHighlights(current => current.filter(item => item.id !== id)); setUndoStack(current => current.map(group => group.filter(value => value !== id)).filter(group => group.length)); }
    catch (error) { toast(error instanceof Error ? error.message : 'Could not remove highlight', 'error'); }
  };
  const undoHighlight = useCallback(async () => {
    if (!undoStack.length || savingHighlight || undoing) return;
    const remaining = [...undoStack[undoStack.length - 1]];
    setUndoing(true);
    try {
      while (remaining.length) {
        const id = remaining[remaining.length - 1];
        await api(`/documents/${documentId}/highlights/${id}`, { method: 'DELETE' });
        setHighlights(current => current.filter(item => item.id !== id));
        remaining.pop();
        setUndoStack(current => [...current.slice(0, -1), ...(remaining.length ? [[...remaining]] : [])]);
      }
      toast('Last highlight undone');
    } catch (error) { toast(error instanceof Error ? error.message : 'Could not undo highlight', 'error'); }
    finally { setUndoing(false); }
  }, [undoStack, savingHighlight, undoing, documentId, toast]);
  const [url, setUrl] = useState<string | null>(null);
  const [pages, setPages] = useState(0);
  const [page, setPage] = useState(1);
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [query, setQuery] = useState('');
  const [matchIndex, setMatchIndex] = useState(0);
  const [error, setError] = useState('');
  const container = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const scrollFrame = useRef<number | null>(null);
  const goToPage = useCallback((number: number) => {
    setPage(number);
    const root = viewport.current;
    const target = root?.querySelector<HTMLElement>(`[data-pdf-page="${number}"]`);
    if (root && target) root.scrollTo({ top: root.scrollTop + target.getBoundingClientRect().top - root.getBoundingClientRect().top - 16, behavior: 'instant' });
  }, []);
  useEffect(() => () => { if (scrollFrame.current !== null) cancelAnimationFrame(scrollFrame.current); }, []);
  const trackPage = () => {
    if (scrollFrame.current !== null) return;
    scrollFrame.current = requestAnimationFrame(() => {
      scrollFrame.current = null;
      const root = viewport.current;
      if (!root) return;
      const top = root.getBoundingClientRect().top + 40;
      const nodes = root.querySelectorAll<HTMLElement>('[data-pdf-page]');
      for (const node of nodes) {
        if (node.getBoundingClientRect().bottom > top) { setPage(Number(node.dataset.pdfPage)); break; }
      }
    });
  };
  const searchInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onUndo = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest('input, textarea, [contenteditable="true"]')) return;
      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 'z' && undoStack.length) {
        event.preventDefault(); void undoHighlight();
      }
    };
    const element = container.current;
    element?.addEventListener('keydown', onUndo);
    return () => element?.removeEventListener('keydown', onUndo);
  }, [undoHighlight, undoStack.length]);
  useEffect(() => {
    const selected = () => {
      if (viewport.current && !savingHighlight) setDraft(captureHighlights(viewport.current, rotation));
    };
    document.addEventListener('selectionchange', selected);
    return () => document.removeEventListener('selectionchange', selected);
  }, [rotation, savingHighlight]);

  useEffect(() => {
    const objectUrl = URL.createObjectURL(blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [blob]);

  const matches = useMemo(() => {
    if (!query.trim()) return [] as { page: number; index: number }[];
    const needle = query.trim().toLowerCase();
    const found: { page: number; index: number }[] = [];
    pageTexts.forEach((text, pageIndex) => {
      const haystack = text.toLowerCase();
      let start = 0;
      while ((start = haystack.indexOf(needle, start)) !== -1) {
        found.push({ page: pageIndex + 1, index: start });
        start += needle.length;
      }
    });
    return found;
  }, [query, pageTexts]);

  useEffect(() => {
    setMatchIndex(0);
    if (matches.length) goToPage(matches[0].page);
  }, [matches, goToPage]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        searchInput.current?.focus();
      }
    };
    const element = container.current;
    element?.addEventListener('keydown', onKey);
    return () => element?.removeEventListener('keydown', onKey);
  }, []);

  const textRenderer = useCallback(({ str }: { str: string }): string => {
    const needle = query.trim();
    if (!needle) return escapeHtml(str);
    const parts = str.split(new RegExp(`(${escapeRegExp(needle)})`, 'gi'));
    return parts.map((part) => part.toLowerCase() === needle.toLowerCase()
      ? `<mark class="pdf-highlight">${escapeHtml(part)}</mark>`
      : escapeHtml(part)).join('');
  }, [query]);

  const goToMatch = (next: number) => {
    if (!matches.length) return;
    const normalized = (next + matches.length) % matches.length;
    setMatchIndex(normalized);
    goToPage(matches[normalized].page);
  };

  return (
    <div ref={container} tabIndex={-1} className="flex min-h-0 flex-1 flex-col bg-[#e9ebe7] outline-none dark:bg-[#11130f]">
      <div className="flex min-h-14 flex-wrap items-center gap-1 border-b border-line bg-surface px-2 py-2 sm:px-3">
        <div className="relative order-first w-full sm:order-none sm:w-auto sm:flex-1 sm:max-w-xs">
          <Search size={14} className="absolute left-3 top-2.5 text-muted" />
          <input ref={searchInput} className="field h-9 bg-canvas pl-8 pr-20 text-xs" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search in document…" aria-label="Search PDF text" />
          {query && <div className="absolute right-1 top-1 flex items-center"><span className="mr-1 text-[9px] text-muted">{matches.length ? `${matchIndex + 1}/${matches.length}` : '0/0'}</span><button className="icon-btn h-7 w-6" disabled={!matches.length} onClick={() => goToMatch(matchIndex - 1)} aria-label="Previous search result"><ChevronLeft size={13} /></button><button className="icon-btn h-7 w-6" disabled={!matches.length} onClick={() => goToMatch(matchIndex + 1)} aria-label="Next search result"><ChevronRight size={13} /></button></div>}
        </div>
        <div className="flex items-center rounded-lg border border-line p-0.5"><button className="icon-btn h-7 w-7" disabled={page <= 1} onClick={() => goToPage(Math.max(1, page - 1))} aria-label="Previous page"><ChevronLeft size={15} /></button><div className="flex items-center gap-1 px-1 text-[11px] text-muted"><input className="w-7 rounded bg-canvas py-0.5 text-center text-ink outline-none" value={page} onChange={(e) => { const value = Number(e.target.value); if (value >= 1 && value <= pages) goToPage(value); }} aria-label="Current page" /><span>/ {pages || '—'}</span></div><button className="icon-btn h-7 w-7" disabled={!pages || page >= pages} onClick={() => goToPage(Math.min(pages, page + 1))} aria-label="Next page"><ChevronRight size={15} /></button></div>
        <span className="mx-1 hidden h-5 w-px bg-line md:block" />
        <div className="flex items-center rounded-lg border border-line p-0.5"><button className="icon-btn h-7 w-7" disabled={scale <= 0.5} onClick={() => setScale((value) => Math.max(0.5, value - 0.15))} aria-label="Zoom out"><Minus size={14} /></button><button className="h-7 min-w-12 px-1 text-[10px] font-medium text-muted hover:text-ink" onClick={() => setScale(1)} title="Reset zoom">{Math.round(scale * 100)}%</button><button className="icon-btn h-7 w-7" disabled={scale >= 2.5} onClick={() => setScale((value) => Math.min(2.5, value + 0.15))} aria-label="Zoom in"><Plus size={14} /></button></div>
        <button className={`icon-btn ${draft.length ? 'bg-yellow-100 text-amber-700 dark:bg-yellow-950 dark:text-yellow-200' : ''}`} disabled={!draft.length || savingHighlight || undoing} onMouseDown={event => event.preventDefault()} onClick={saveHighlight} aria-label="Save selected text as highlight" title="Select text, then save highlight">{savingHighlight ? <Spinner /> : <Highlighter size={16} />}</button>
        <button className="icon-btn" disabled={!undoStack.length || savingHighlight || undoing} onClick={undoHighlight} title="Undo last highlight (⌘/Ctrl+Z)" aria-label="Undo last highlight" aria-keyshortcuts="Control+z Meta+z">{undoing ? <Spinner /> : <Undo2 size={16} />}</button>
        <button className="icon-btn" onClick={() => setShowHighlights(value => !value)} aria-label="Show saved highlights" aria-pressed={showHighlights} title={`${highlights.length} saved highlights`}><BookMarked size={16} /></button>
        <button className="icon-btn hidden sm:inline-flex" onClick={() => setRotation((value) => (value + 90) % 360)} aria-label="Rotate page"><RotateCw size={16} /></button>
        <button className="icon-btn" onClick={() => downloadDocument(documentId, filename)} aria-label="Download document"><Download size={16} /></button>
        <button className="icon-btn hidden sm:inline-flex" onClick={() => container.current?.requestFullscreen?.()} aria-label="Full screen"><Maximize2 size={16} /></button>
        {query && <button className="icon-btn sm:hidden" onClick={() => setQuery('')} aria-label="Clear search"><X size={15} /></button>}
      </div>
      {draft.length > 0 && <div className="flex shrink-0 items-center gap-3 border-b border-line bg-surface px-4 py-2 text-xs"><Highlighter size={14} className="text-amber-500" /><span className="min-w-0 flex-1 truncate">{draft[0].text}</span><button className="font-semibold text-accent" disabled={savingHighlight} onMouseDown={event => event.preventDefault()} onClick={saveHighlight}>Save highlight</button><button className="icon-btn h-6 w-6" disabled={savingHighlight} aria-label="Cancel highlight" onClick={() => { setDraft([]); window.getSelection()?.removeAllRanges(); }}><X size={13} /></button></div>}
      <div className="flex min-h-0 flex-1">
      <div ref={viewport} onScroll={trackPage} onPointerUp={() => { if (viewport.current && !savingHighlight) setDraft(captureHighlights(viewport.current, rotation)); }} onKeyUp={event => { if (event.shiftKey && viewport.current) setDraft(captureHighlights(viewport.current, rotation)); }} tabIndex={0} aria-label="Scrollable PDF pages" className="subtle-scrollbar min-h-0 flex-1 overflow-auto overscroll-contain p-4 outline-none sm:p-7">
        <div className="flex min-h-full w-max min-w-full items-start justify-center">
          {url && <Document file={url} onLoadSuccess={({ numPages }) => { setPages(numPages); setError(''); }} onLoadError={() => setError('This PDF could not be opened. It may be encrypted or damaged.')} loading={<div className="flex h-64 items-center gap-2 text-sm text-muted"><Spinner />Opening PDF…</div>} error={<div className="card max-w-md p-6 text-center text-sm text-red-600">{error || 'Unable to load PDF.'}</div>}>
            {Array.from({ length: pages }, (_, index) => <ScrollPage key={index + 1} number={index + 1} scale={scale} rotation={rotation} root={viewport} textRenderer={textRenderer} highlights={highlights.filter(item => item.page === index + 1)} />)}
          </Document>}
        </div>
      </div>
      {showHighlights && <aside className="flex w-56 shrink-0 flex-col overflow-y-auto border-l border-line bg-surface p-3 max-sm:w-40"><div className="mb-3 flex items-center justify-between"><h3 className="text-xs font-semibold">Highlights ({highlights.length})</h3><button className="icon-btn h-6 w-6" aria-label="Close highlights" onClick={() => setShowHighlights(false)}><X size={13} /></button></div>{highlights.length ? [...highlights].sort((a, b) => a.page - b.page).map(item => <div key={item.id} className="mb-2 rounded-lg border border-line p-2"><button className="w-full text-left" onClick={() => goToPage(item.page)}><span className="text-[10px] font-semibold text-accent">Page {item.page}</span><span className="mt-1 block line-clamp-3 text-xs text-muted">{item.text}</span></button><button className="icon-btn mt-1 h-6 w-6 hover:text-red-500" disabled={undoing || savingHighlight} aria-label={`Remove highlight on page ${item.page}`} onClick={() => removeHighlight(item.id)}><Trash2 size={12} /></button></div>) : <p className="text-xs leading-5 text-muted">Select text in a page, then choose Save highlight.</p>}</aside>}
      </div>
      <div className="flex h-7 shrink-0 items-center justify-between border-t border-line bg-surface px-4 text-[9px] text-muted"><span>{filename}</span><span className="hidden sm:inline">Scroll through pages · Ctrl / ⌘ + F to search</span></div>
    </div>
  );
}
