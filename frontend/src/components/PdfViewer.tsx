import { ChevronLeft, ChevronRight, Download, Maximize2, Minus, Plus, RotateCw, Search, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import 'react-pdf/dist/esm/Page/TextLayer.css';
import { downloadDocument } from '../lib/api';
import { Spinner } from './ui';

pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character] || character);
}

export default function PdfViewer({ blob, documentId, filename, pageTexts }: {
  blob: Blob;
  documentId: number;
  filename: string;
  pageTexts: string[];
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [pages, setPages] = useState(0);
  const [page, setPage] = useState(1);
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [query, setQuery] = useState('');
  const [matchIndex, setMatchIndex] = useState(0);
  const [error, setError] = useState('');
  const container = useRef<HTMLDivElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);

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
    if (matches.length) setPage(matches[0].page);
  }, [matches]);

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
    setPage(matches[normalized].page);
  };

  return (
    <div ref={container} tabIndex={-1} className="flex min-h-0 flex-1 flex-col bg-[#e9ebe7] outline-none dark:bg-[#11130f]">
      <div className="flex min-h-14 flex-wrap items-center gap-1 border-b border-line bg-surface px-2 py-2 sm:px-3">
        <div className="relative order-first w-full sm:order-none sm:w-auto sm:flex-1 sm:max-w-xs">
          <Search size={14} className="absolute left-3 top-2.5 text-muted" />
          <input ref={searchInput} className="field h-9 bg-canvas pl-8 pr-20 text-xs" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search in document…" aria-label="Search PDF text" />
          {query && <div className="absolute right-1 top-1 flex items-center"><span className="mr-1 text-[9px] text-muted">{matches.length ? `${matchIndex + 1}/${matches.length}` : '0/0'}</span><button className="icon-btn h-7 w-6" disabled={!matches.length} onClick={() => goToMatch(matchIndex - 1)} aria-label="Previous search result"><ChevronLeft size={13} /></button><button className="icon-btn h-7 w-6" disabled={!matches.length} onClick={() => goToMatch(matchIndex + 1)} aria-label="Next search result"><ChevronRight size={13} /></button></div>}
        </div>
        <div className="flex items-center rounded-lg border border-line p-0.5"><button className="icon-btn h-7 w-7" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} aria-label="Previous page"><ChevronLeft size={15} /></button><div className="flex items-center gap-1 px-1 text-[11px] text-muted"><input className="w-7 rounded bg-canvas py-0.5 text-center text-ink outline-none" value={page} onChange={(e) => { const value = Number(e.target.value); if (value >= 1 && value <= pages) setPage(value); }} aria-label="Current page" /><span>/ {pages || '—'}</span></div><button className="icon-btn h-7 w-7" disabled={!pages || page >= pages} onClick={() => setPage((value) => Math.min(pages, value + 1))} aria-label="Next page"><ChevronRight size={15} /></button></div>
        <span className="mx-1 hidden h-5 w-px bg-line md:block" />
        <div className="flex items-center rounded-lg border border-line p-0.5"><button className="icon-btn h-7 w-7" disabled={scale <= 0.5} onClick={() => setScale((value) => Math.max(0.5, value - 0.15))} aria-label="Zoom out"><Minus size={14} /></button><button className="h-7 min-w-12 px-1 text-[10px] font-medium text-muted hover:text-ink" onClick={() => setScale(1)} title="Reset zoom">{Math.round(scale * 100)}%</button><button className="icon-btn h-7 w-7" disabled={scale >= 2.5} onClick={() => setScale((value) => Math.min(2.5, value + 0.15))} aria-label="Zoom in"><Plus size={14} /></button></div>
        <button className="icon-btn hidden sm:inline-flex" onClick={() => setRotation((value) => (value + 90) % 360)} aria-label="Rotate page"><RotateCw size={16} /></button>
        <button className="icon-btn" onClick={() => downloadDocument(documentId, filename)} aria-label="Download document"><Download size={16} /></button>
        <button className="icon-btn hidden sm:inline-flex" onClick={() => container.current?.requestFullscreen?.()} aria-label="Full screen"><Maximize2 size={16} /></button>
        {query && <button className="icon-btn sm:hidden" onClick={() => setQuery('')} aria-label="Clear search"><X size={15} /></button>}
      </div>
      <div className="subtle-scrollbar min-h-0 flex-1 overflow-auto p-4 sm:p-7">
        <div className="flex min-h-full w-max min-w-full items-start justify-center">
          {url && <Document file={url} onLoadSuccess={({ numPages }) => { setPages(numPages); setError(''); }} onLoadError={() => setError('This PDF could not be opened. It may be encrypted or damaged.')} loading={<div className="flex h-64 items-center gap-2 text-sm text-muted"><Spinner />Opening PDF…</div>} error={<div className="card max-w-md p-6 text-center text-sm text-red-600">{error || 'Unable to load PDF.'}</div>}>
            <Page key={`${page}-${scale}-${rotation}`} pageNumber={page} scale={scale} rotate={rotation} renderAnnotationLayer renderTextLayer customTextRenderer={textRenderer} loading={<div className="pdf-page-loading"><Spinner /></div>} />
          </Document>}
        </div>
      </div>
      <div className="flex h-7 shrink-0 items-center justify-between border-t border-line bg-surface px-4 text-[9px] text-muted"><span>{filename}</span><span className="hidden sm:inline">Ctrl / ⌘ + F to search · Text selection supported</span></div>
    </div>
  );
}
