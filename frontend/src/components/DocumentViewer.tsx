import { AlertCircle, ArrowLeft, Download, FileText, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { downloadDocument, getDocumentBlob } from '../lib/api';
import { api } from '../lib/api';
import type { DocumentContent, StudyDocument } from '../types';
import PdfViewer from './PdfViewer';
import { Button, Markdown, Spinner } from './ui';
import { useToast } from '../context/ToastContext';

function ImagePreview({ blob, name }: { blob: Blob; name: string }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    const objectUrl = URL.createObjectURL(blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [blob]);
  return <div className="flex flex-1 items-center justify-center overflow-auto bg-[#e9ebe7] p-6 dark:bg-[#11130f]">{url && <img src={url} alt={name} className="max-h-full max-w-full rounded-lg object-contain shadow-float" />}</div>;
}

export default function DocumentViewer({ document, onClose, onDelete, onRefresh }: {
  document: StudyDocument;
  onClose: () => void;
  onDelete: () => void;
  onRefresh: () => void;
}) {
  const { toast } = useToast();
  const [content, setContent] = useState<DocumentContent | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [error, setError] = useState('');
  const isVisual = document.extension === '.pdf' || ['.png', '.jpg', '.jpeg', '.webp'].includes(document.extension);

  useEffect(() => {
    setContent(null);
    setBlob(null);
    setError('');
    if (document.status !== 'ready') return;
    let cancelled = false;
    const load = async () => {
      try {
        const [documentContent, documentBlob] = await Promise.all([
          api<DocumentContent>(`/documents/${document.id}/content`),
          isVisual ? getDocumentBlob(document.id) : Promise.resolve(null),
        ]);
        if (!cancelled) { setContent(documentContent); setBlob(documentBlob); }
      } catch (reason) { if (!cancelled) setError(reason instanceof Error ? reason.message : 'Could not open this file'); }
    };
    load();
    return () => { cancelled = true; };
  }, [document.id, document.status, isVisual]);

  return (
    <div className="flex h-full min-h-[560px] flex-col bg-surface">
      <header className="flex min-h-[62px] shrink-0 items-center gap-3 border-b border-line px-3 sm:px-5">
        <button className="icon-btn" onClick={onClose} aria-label="Back to library"><ArrowLeft size={18} /></button>
        <span className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-300 sm:flex"><FileText size={18} /></span>
        <div className="min-w-0 flex-1"><h2 className="truncate text-sm font-semibold">{document.name}</h2><p className="mt-0.5 text-[10px] uppercase text-muted">{document.extension.replace('.', '')} {document.page_count > 1 ? `· ${document.page_count} pages` : ''}</p></div>
        <button className="icon-btn" onClick={onRefresh} title="Refresh file"><RefreshCw size={16} /></button>
        {!isVisual && <button className="icon-btn" onClick={() => downloadDocument(document.id, document.name)} aria-label="Download document"><Download size={17} /></button>}
        <button className="icon-btn hover:text-red-600" onClick={onDelete} aria-label="Delete document"><Trash2 size={17} /></button>
      </header>

      {document.status === 'processing' ? <div className="flex flex-1 flex-col items-center justify-center p-8 text-center"><span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-soft text-accent dark:bg-accent-dark/40"><Loader2 size={25} className="animate-spin" /></span><h3 className="mt-5 text-base font-semibold">Making this document searchable</h3><p className="mt-2 max-w-sm text-sm leading-6 text-muted">We're extracting text so you can search it. Larger files may take a moment.</p><Button variant="secondary" className="mt-5" onClick={onRefresh} icon={<RefreshCw size={15} />}>Check status</Button></div>
        : document.status === 'error' ? <div className="flex flex-1 flex-col items-center justify-center p-8 text-center"><AlertCircle size={32} className="text-red-500" /><h3 className="mt-4 text-base font-semibold">We couldn't read this file</h3><p className="mt-2 max-w-md text-sm leading-6 text-muted">{document.error}</p><Button variant="secondary" className="mt-5" onClick={() => downloadDocument(document.id, document.name)} icon={<Download size={15} />}>Download original</Button></div>
        : error ? <div className="flex flex-1 flex-col items-center justify-center p-8 text-center"><AlertCircle size={30} className="text-red-500" /><p className="mt-4 text-sm text-muted">{error}</p><Button variant="secondary" className="mt-4" onClick={onRefresh}>Try again</Button></div>
        : !content || (isVisual && !blob) ? <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted"><Spinner />Loading your document…</div>
        : document.extension === '.pdf' && blob ? <PdfViewer blob={blob} documentId={document.id} filename={document.name} pageTexts={content.pages} />
        : isVisual && blob ? <ImagePreview blob={blob} name={document.name} />
        : <div className="min-h-0 flex-1 overflow-y-auto bg-canvas/40"><article className="mx-auto my-5 max-w-4xl rounded-2xl border border-line bg-surface p-6 shadow-soft sm:my-8 sm:p-12">{content.text ? document.extension === '.md' ? <Markdown>{content.text}</Markdown> : <div className="whitespace-pre-wrap text-[14px] leading-7 text-ink">{content.pages.map((page, index) => <section key={index} className="mb-8 last:mb-0">{content.pages.length > 1 && <div className="mb-4 border-b border-line pb-2 text-[10px] font-semibold uppercase tracking-wider text-muted">Page / section {index + 1}</div>}{page}</section>)}</div> : <div className="py-16 text-center"><FileText size={30} className="mx-auto text-muted" /><h3 className="mt-4 text-sm font-semibold">No selectable text found</h3><p className="mx-auto mt-2 max-w-sm text-xs leading-5 text-muted">You can still download the original. For scanned PDFs, add an OCR-readable version to enable search and AI references.</p></div>}</article></div>}
      <button className="sr-only" onClick={() => toast('Document refreshed')}>Refresh notification</button>
    </div>
  );
}
