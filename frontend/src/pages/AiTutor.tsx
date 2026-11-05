import {
  ArrowUp, BookOpen, Bot, Check, ChevronDown, FileText, History, Library,
  MessageSquarePlus, PanelLeftClose, Plus, Sparkles, Trash2, User, FilePlus2, ArrowUpRight, CalendarPlus,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { Markdown, Spinner } from '../components/ui';
import { useToast } from '../context/ToastContext';
import { tutorRequest, type TutorMode } from '../lib/tutorAction';
import { api } from '../lib/api';
import { cn, localDateString, formatTime } from '../lib/utils';
import type { AiStatus, ChatMessage, ChatResponse, Conversation, Source, StudyDocument, Note } from '../types';

const suggestions = [
  { title: 'Make it clear', prompt: 'Explain the most difficult concept in my materials with a simple example.', icon: Sparkles },
  { title: 'Active recall', prompt: 'Create 10 active-recall questions from my study materials, without answers.', icon: BookOpen },
  { title: 'Add a calendar session', prompt: '/session Review biology tomorrow at 18:00 for 45 minutes', icon: CalendarPlus },
  { title: 'Create a study note', prompt: '/note Create a structured Markdown study note from my materials, with key concepts, worked examples, and recall questions.', icon: FilePlus2 },
  { title: 'Find the essentials', prompt: 'Summarize the key ideas I should know for an exam, with citations.', icon: Library },
  { title: 'Test my understanding', prompt: 'Quiz me one question at a time on the selected documents. Wait for my answer before giving feedback.', icon: MessageSquarePlus },
];

function Sources({ sources }: { sources: Source[] }) {
  const [open, setOpen] = useState(false);
  if (!sources.length) return null;
  return <div className="mt-3 border-t border-line/70 pt-3"><button className="flex items-center gap-1.5 text-[11px] font-semibold text-muted transition hover:text-ink" onClick={() => setOpen(!open)}><Library size={12} />{sources.length} {sources.length === 1 ? 'source' : 'sources'}<ChevronDown size={12} className={cn('transition', open && 'rotate-180')} /></button>{open && <div className="mt-2 grid gap-2 sm:grid-cols-2">{sources.map((source, index) => <Link to={`/files/${source.document_id}`} key={`${source.document_id}-${source.page}-${index}`} className="rounded-xl border border-line bg-canvas/70 p-3 transition hover:border-accent/40"><div className="flex items-center gap-2"><span className="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-accent text-[9px] font-bold text-white">{index + 1}</span><span className="truncate text-[11px] font-semibold">{source.document_name}</span><span className="ml-auto shrink-0 text-[9px] text-muted">p. {source.page}</span></div><p className="mt-2 line-clamp-3 text-[10px] leading-4 text-muted">{source.snippet}</p></Link>)}</div>}</div>;
}

export default function AiTutor() {
  const { toast } = useToast();
  const [documents, setDocuments] = useState<StudyDocument[]>([]);
  const [selectedDocuments, setSelectedDocuments] = useState<number[]>([]);
  const [documentMenu, setDocumentMenu] = useState(false);
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<TutorMode>('chat');
  const [sessionDate, setSessionDate] = useState('');
  const [sessionTime, setSessionTime] = useState('');
  const [sessionMinutes, setSessionMinutes] = useState('');
  const [savingNote, setSavingNote] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const readyDocuments = documents.filter((doc) => doc.status === 'ready');

  const loadConversations = useCallback(() => api<Conversation[]>('/ai/conversations').then(setConversations).catch(() => {}), []);
  useEffect(() => {
    api<StudyDocument[]>('/documents').then(setDocuments).catch(() => {});
    api<AiStatus>('/ai/status').then(setStatus).catch(() => {});
    loadConversations();
  }, [loadConversations]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages, loading]);

  const newChat = () => { setMode('chat'); setSessionDate(''); setSessionTime(''); setSessionMinutes(''); setActiveId(null); setMessages([]); setInput(''); setHistoryOpen(false); inputRef.current?.focus(); };
  const selectConversation = async (id: number) => {
    setActiveId(id);
    setHistoryOpen(false);
    setLoading(true);
    try { setMessages(await api<ChatMessage[]>(`/ai/conversations/${id}/messages`)); }
    catch (error) { toast(error instanceof Error ? error.message : 'Could not open conversation', 'error'); }
    finally { setLoading(false); }
  };
  const deleteConversation = async (id: number) => {
    try {
      await api(`/ai/conversations/${id}`, { method: 'DELETE' });
      setConversations((current) => current.filter((conversation) => conversation.id !== id));
      if (activeId === id) newChat();
      toast('Conversation deleted');
    } catch (error) { toast(error instanceof Error ? error.message : 'Could not delete conversation', 'error'); }
  };

  const send = async (text = input, requestedMode = mode) => {
    const { action, message } = tutorRequest(text, requestedMode);
    if (!message || loading) return;
    setMode(action);
    const optimistic: ChatMessage = { id: `user-${Date.now()}`, role: 'user', content: message, sources: [], created_at: new Date().toISOString() };
    setMessages((current) => [...current, optimistic]);
    setInput('');
    if (inputRef.current) inputRef.current.style.height = 'auto';
    setLoading(true);
    try {
      const response = await api<ChatResponse>('/ai/chat', { method: 'POST', body: JSON.stringify({ message, conversation_id: activeId, document_ids: selectedDocuments, create_note: action === 'note', create_session: action === 'session', reference_date: localDateString(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, session_details: action === 'session' ? { date: sessionDate || null, start_time: sessionTime || null, duration_minutes: sessionMinutes ? Number(sessionMinutes) : null } : null }) });
      setActiveId(response.conversation_id);
      setMessages((current) => [...current, { id: response.message_id, note_id: response.note?.id, calendar_session: response.calendar_session, role: 'assistant', content: response.answer, sources: response.sources, created_at: new Date().toISOString() }]);
      loadConversations();
      if (response.note) toast('Markdown note created in Notes & docs');
      if (response.calendar_session) { toast('Calendar session created'); setSessionDate(''); setSessionTime(''); setSessionMinutes(''); }
    } catch (error) {
      setMessages((current) => current.filter((item) => item.id !== optimistic.id));
      setInput(message);
      toast(error instanceof Error ? error.message : 'Your tutor could not answer right now', 'error');
    } finally { setLoading(false); inputRef.current?.focus(); }
  };

  const saveAnswer = async (message: ChatMessage) => {
    if (typeof message.id !== 'number') return;
    setSavingNote(message.id);
    try {
      const note = await api<Note>(`/ai/messages/${message.id}/note`, { method: 'POST' });
      setMessages(current => current.map(item => item.id === message.id ? { ...item, note_id: note.id } : item));
      toast('Saved to Notes & docs');
    } catch (error) { toast(error instanceof Error ? error.message : 'Could not save note', 'error'); }
    finally { setSavingNote(null); }
  };

  const selectedLabel = selectedDocuments.length === 0 ? 'All study materials' : `${selectedDocuments.length} selected ${selectedDocuments.length === 1 ? 'file' : 'files'}`;

  return (
    <div className="relative flex h-full min-h-[580px] bg-surface">
      {historyOpen && <button className="fixed inset-0 z-30 bg-black/30 md:hidden" onClick={() => setHistoryOpen(false)} aria-label="Close chat history" />}
      <aside className={cn('z-40 w-[260px] shrink-0 flex-col border-r border-line bg-sidebar', historyOpen ? 'fixed inset-y-0 left-0 flex shadow-float' : 'hidden md:flex')}>
        <div className="p-3"><button onClick={newChat} className="flex h-10 w-full items-center gap-2 rounded-xl border border-line bg-surface px-3 text-xs font-semibold shadow-sm transition hover:border-accent/40"><Plus size={15} />New conversation</button></div>
        <div className="px-4 pb-2 pt-3 text-[10px] font-semibold uppercase tracking-[.13em] text-muted">Recent conversations</div>
        <div className="flex-1 overflow-y-auto px-2 pb-4">{conversations.map((conversation) => <div key={conversation.id} className={cn('group mb-1 flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2.5 transition', activeId === conversation.id ? 'bg-surface shadow-sm ring-1 ring-line' : 'hover:bg-surface/60')} onClick={() => selectConversation(conversation.id)}><History size={13} className="shrink-0 text-muted" /><div className="min-w-0 flex-1"><p className="truncate text-[11px] font-medium">{conversation.title}</p><p className="mt-0.5 text-[9px] text-muted">{formatDistanceToNow(parseISO(conversation.updated_at), { addSuffix: true })}</p></div><button className="hidden h-6 w-6 shrink-0 items-center justify-center rounded text-muted hover:bg-red-50 hover:text-red-600 group-hover:flex dark:hover:bg-red-950/30" onClick={(event) => { event.stopPropagation(); deleteConversation(conversation.id); }} aria-label="Delete conversation"><Trash2 size={12} /></button></div>)}{!conversations.length && <p className="px-3 py-8 text-center text-[11px] leading-5 text-muted">Your study conversations will appear here.</p>}</div>
        <div className="border-t border-line p-4"><div className="flex items-center gap-2 text-[11px] font-medium"><span className={cn('h-2 w-2 rounded-full', status?.connected ? 'bg-emerald-500' : 'bg-amber-500')} />{status?.connected ? status.mode : 'Local retrieval mode'}</div><p className="mt-1.5 text-[9px] leading-4 text-muted">{status?.connected ? 'Provider configured. Requests use this model when available.' : 'Works offline with cited passages. Add an API key for synthesized answers.'}</p></div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex min-h-[60px] shrink-0 items-center gap-2 border-b border-line px-3 sm:px-5">
          <button className="icon-btn md:hidden" onClick={() => setHistoryOpen(true)} aria-label="Conversation history"><History size={18} /></button>
          <span className="hidden h-9 w-9 items-center justify-center rounded-xl bg-accent-soft text-accent dark:bg-accent-dark/40 sm:flex"><Bot size={18} /></span>
          <div className="min-w-0 flex-1"><h2 className="text-sm font-semibold">Study tutor</h2><p className="hidden text-[10px] text-muted sm:block">Thoughtful answers, grounded in your library</p></div>
          <div className="relative"><button onClick={() => setDocumentMenu(!documentMenu)} className="flex h-9 max-w-[180px] items-center gap-2 rounded-xl border border-line bg-surface px-3 text-[11px] font-medium text-muted transition hover:text-ink sm:max-w-xs"><BookOpen size={14} className="shrink-0" /><span className="truncate">{selectedLabel}</span><ChevronDown size={12} /></button>{documentMenu && <><button className="fixed inset-0 z-10" onClick={() => setDocumentMenu(false)} aria-label="Close document selection" /><div className="absolute right-0 top-11 z-20 w-72 rounded-xl border border-line bg-surface p-2 shadow-float animate-slide-up"><div className="flex items-center justify-between px-2 py-2"><p className="text-xs font-semibold">Ground answers in</p>{selectedDocuments.length > 0 && <button className="text-[10px] text-accent" onClick={() => setSelectedDocuments([])}>Use all</button>}</div><div className="max-h-64 overflow-y-auto">{readyDocuments.map((doc) => { const selected = selectedDocuments.includes(doc.id); return <label key={doc.id} className="flex cursor-pointer items-center gap-2 rounded-lg p-2.5 hover:bg-canvas"><span className={cn('flex h-4 w-4 shrink-0 items-center justify-center rounded border', selected ? 'border-accent bg-accent text-white' : 'border-muted/40')}>{selected && <Check size={11} />}</span><input type="checkbox" className="sr-only" checked={selected} onChange={() => setSelectedDocuments((current) => selected ? current.filter((id) => id !== doc.id) : [...current, doc.id])} /><span className="truncate text-xs">{doc.name}</span></label>; })}</div>{!readyDocuments.length && <div className="p-4 text-center"><FileText size={18} className="mx-auto text-muted" /><p className="mt-2 text-[11px] leading-5 text-muted">Upload and index a file to begin.</p><Link to="/files" className="mt-2 inline-block text-xs font-semibold text-accent">Open library</Link></div>}<p className="border-t border-line px-2 pb-1 pt-2 text-[9px] leading-4 text-muted">With no selection, your tutor searches every ready document.</p></div></>}</div>
          <button className="icon-btn hidden md:inline-flex" onClick={newChat} title="New conversation"><PanelLeftClose size={17} /></button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {!messages.length && !loading ? <div className="mx-auto flex min-h-full max-w-3xl flex-col items-center justify-center px-5 py-10 text-center">
            <div className="relative"><span className="flex h-16 w-16 items-center justify-center rounded-[22px] bg-accent text-white shadow-float"><Sparkles size={27} /></span><span className="absolute -right-1 -top-1 h-4 w-4 rounded-full border-4 border-surface bg-emerald-400" /></div>
            <h2 className="mt-6 text-2xl font-semibold tracking-[-.04em] sm:text-3xl">What shall we understand today?</h2>
            <p className="mt-3 max-w-lg text-sm leading-6 text-muted">Ask questions, request a quiz, or turn dense material into clear explanations. Every answer starts with your own resources.</p>
            <div className="mt-8 grid w-full gap-3 sm:grid-cols-2">{suggestions.map(({ title, prompt, icon: Icon }) => <button key={title} onClick={() => send(prompt, 'chat')} className="group rounded-2xl border border-line bg-surface p-4 text-left shadow-soft transition hover:-translate-y-0.5 hover:border-accent/35 hover:shadow-md"><div className="flex items-center gap-2 text-xs font-semibold"><Icon size={15} className="text-accent" />{title}<ArrowUp size={13} className="ml-auto rotate-45 text-muted opacity-0 transition group-hover:opacity-100" /></div><p className="mt-2 line-clamp-2 text-[11px] leading-5 text-muted">{prompt}</p></button>)}</div>
            {!readyDocuments.length && <Link to="/files" className="mt-6 flex items-center gap-2 rounded-xl bg-amber-50 px-4 py-3 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-200"><Library size={15} />Upload a document for answers grounded in your course.<ArrowUp size={13} className="rotate-45" /></Link>}
          </div> : <div className="mx-auto max-w-3xl space-y-7 px-4 py-7 sm:px-7 sm:py-9">
            {messages.map((message) => <div key={message.id} className={cn('flex gap-3 animate-slide-up', message.role === 'user' && 'justify-end')}>
              {message.role === 'assistant' && <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-accent text-white"><Bot size={15} /></span>}
              <div className={cn('min-w-0', message.role === 'user' ? 'max-w-[85%] rounded-2xl rounded-br-md bg-accent px-4 py-3 text-white' : 'flex-1')}>
                {message.role === 'user' ? <p className="whitespace-pre-wrap text-sm leading-6">{message.content}</p> : <><Markdown className="text-sm leading-6 [&_p]:my-2">{message.content}</Markdown><Sources sources={message.sources} />{message.calendar_session && <Link to={`/schedule?date=${message.calendar_session.date}&session=${message.calendar_session.id}`} className="mt-3 flex items-center gap-2 rounded-xl border border-line bg-canvas px-3 py-3 text-xs font-semibold text-accent"><CalendarPlus size={16} /><span className="min-w-0 flex-1"><span className="block truncate">{message.calendar_session.title}</span><span className="mt-1 block text-[10px] font-normal text-muted">{message.calendar_session.date} · {formatTime(message.calendar_session.start_minutes)} · {message.calendar_session.duration_minutes} min</span></span>Open calendar<ArrowUpRight size={13} /></Link>}{message.note_id ? <Link to={`/notes?note=${message.note_id}`} className="mt-3 inline-flex items-center gap-2 rounded-xl border border-line bg-canvas px-3 py-2 text-xs font-semibold text-accent"><FileText size={14} />Open saved Markdown note<ArrowUpRight size={13} /></Link> : <button disabled={typeof message.id !== 'number' || savingNote === message.id} onClick={() => saveAnswer(message)} className="mt-3 inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-muted hover:bg-canvas hover:text-accent disabled:opacity-40">{savingNote === message.id ? <Spinner className="h-3 w-3" /> : <FilePlus2 size={13} />}Save as note</button>}</>}
              </div>
              {message.role === 'user' && <span className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-full bg-canvas text-muted sm:flex"><User size={15} /></span>}
            </div>)}
            {loading && <div className="flex gap-3"><span className="flex h-8 w-8 items-center justify-center rounded-xl bg-accent text-white"><Bot size={15} /></span><div className="flex h-10 items-center gap-1.5 rounded-2xl bg-canvas px-4"><i className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted" /><i className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted [animation-delay:150ms]" /><i className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted [animation-delay:300ms]" /><span className="ml-2 text-[11px] text-muted">{mode === 'note' ? 'Writing your note…' : mode === 'session' ? 'Preparing your session…' : 'Reading your materials…'}</span></div></div>}
            <div ref={endRef} />
          </div>}
        </div>

        <div className="shrink-0 bg-gradient-to-t from-surface via-surface to-transparent px-4 pb-4 pt-2 sm:px-7 sm:pb-5">
          <div className="mx-auto max-w-3xl"><div className="mb-2 flex flex-wrap items-center justify-between gap-2"><div className="flex rounded-lg border border-line p-0.5">{([['chat', 'Ask tutor'], ['note', 'Create note'], ['session', 'Create session']] as const).map(([value, label]) => <button key={value} className={cn('inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium', mode === value ? 'bg-canvas text-accent' : 'text-muted')} aria-pressed={mode === value} disabled={loading} onClick={() => setMode(value)}>{value === 'note' && <FilePlus2 size={13} />}{value === 'session' && <CalendarPlus size={13} />}{label}</button>)}</div><span className="hidden text-[10px] text-muted sm:block">{mode === 'note' ? 'Saves to Notes & docs' : mode === 'session' ? 'Creates one calendar session' : 'Shortcuts: /note or /session'}</span></div>
          {mode === 'session' && <fieldset disabled={loading} className="mb-2 rounded-xl border border-line bg-canvas/50 p-3"><legend className="px-1 text-[10px] font-semibold text-muted">Optional details · override dates and times in your message</legend><div className="grid grid-cols-3 gap-2"><label className="text-[10px] text-muted">Date<input aria-label="Tutor session date" type="date" className="field mt-1 h-9 px-2 text-xs" value={sessionDate} onChange={event => setSessionDate(event.target.value)} /></label><label className="text-[10px] text-muted">Start time<input aria-label="Tutor session start time" type="time" className="field mt-1 h-9 px-2 text-xs" value={sessionTime} onChange={event => setSessionTime(event.target.value)} /></label><label className="text-[10px] text-muted">Minutes<input aria-label="Tutor session duration" type="number" min={5} max={480} placeholder="e.g. 45" className="field mt-1 h-9 px-2 text-xs" value={sessionMinutes} onChange={event => setSessionMinutes(event.target.value)} /></label></div><p className="mt-2 text-[9px] text-muted">Local time: {Intl.DateTimeFormat().resolvedOptions().timeZone}. Include a title, date, time, and duration.</p></fieldset>}
          <div className="flex items-end gap-2 rounded-2xl border border-line bg-surface p-2 shadow-float transition focus-within:border-accent/50 focus-within:ring-2 focus-within:ring-accent/10"><textarea ref={inputRef} rows={1} className="max-h-36 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-sm leading-6 outline-none placeholder:text-muted/65" value={input} onChange={(event) => { setInput(event.target.value); event.target.style.height = 'auto'; event.target.style.height = `${Math.min(event.target.scrollHeight, 144)}px`; }} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send(); } }} placeholder={mode === 'note' ? "Describe the study note you want to create…" : mode === 'session' ? "Review biology tomorrow at 18:00 for 45 minutes…" : "Ask about your materials, or use /note or /session…"} maxLength={12000} aria-label="Message your study tutor" /><button onClick={() => send()} disabled={!input.trim() || loading} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-white transition hover:bg-accent-hover active:scale-95 disabled:opacity-30" aria-label="Send message">{loading ? <Spinner /> : <ArrowUp size={18} />}</button></div><p className="mt-2 text-center text-[9px] leading-4 text-muted">Enter to send · Shift + Enter for a new line · Verify important details with the cited sources.</p></div>
        </div>
      </section>
    </div>
  );
}
