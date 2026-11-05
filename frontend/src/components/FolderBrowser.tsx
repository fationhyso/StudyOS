import { ChevronDown, ChevronRight, Folder, FolderOpen, FolderPlus, Search, X } from 'lucide-react';
import { useEffect, useMemo, useState, type DragEvent } from 'react';
import type { SubjectFolder } from '../types';
import { cn } from '../lib/utils';

export type FolderSelection = number | 'root' | 'unfiled';
const folderColors = ['bg-emerald-500', 'bg-sky-500', 'bg-violet-500', 'bg-amber-500', 'bg-rose-500', 'bg-teal-500', 'bg-indigo-500', 'bg-orange-500'];

export function FolderDot({ id }: { id: number | null }) {
  return <span aria-hidden="true" className={cn('inline-block h-2 w-2 shrink-0 rounded-full', id === null ? 'bg-slate-400' : folderColors[id % folderColors.length])} />;
}

export function folderTrail(folders: SubjectFolder[], id: number | null): SubjectFolder[] {
  const byId = new Map(folders.map(folder => [folder.id, folder]));
  const trail: SubjectFolder[] = [];
  const seen = new Set<number>();
  while (id !== null && !seen.has(id)) {
    seen.add(id);
    const folder = byId.get(id);
    if (!folder) break;
    trail.unshift(folder); id = folder.parent_id;
  }
  return trail;
}
export function folderPath(folders: SubjectFolder[], folder: SubjectFolder) {
  return folderTrail(folders, folder.id).map(item => item.name).join(' / ');
}
export function descendantIds(folders: SubjectFolder[], id: number): Set<number> {
  const result = new Set([id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const folder of folders) if (folder.parent_id !== null && result.has(folder.parent_id) && !result.has(folder.id)) { result.add(folder.id); changed = true; }
  }
  return result;
}

type FileDropProps = { onDropFiles?: (destination: number | null) => void; canDropFiles?: () => boolean };

export function FolderTree({ onDropFiles, canDropFiles, folders, selected, onSelect, showRoot = true, rootLabel = 'Unfiled', excluded = new Set<number>() }: {
  folders: SubjectFolder[]; selected: FolderSelection; onSelect: (value: FolderSelection) => void;
  showRoot?: boolean; rootLabel?: string; excluded?: Set<number>;
} & FileDropProps) {
  const [query, setQuery] = useState('');
  const [dropTarget, setDropTarget] = useState<number | 'unfiled' | undefined>();
  const dropProps = (destination: number | 'unfiled') => ({
    onDragOver: (event: DragEvent) => { if (onDropFiles && canDropFiles?.()) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setDropTarget(destination); } },
    onDragLeave: (event: DragEvent) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDropTarget(undefined); },
    onDrop: (event: DragEvent) => { if (onDropFiles && canDropFiles?.()) { event.preventDefault(); onDropFiles(destination === 'unfiled' ? null : destination); } setDropTarget(undefined); },
  });
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  useEffect(() => {
    if (typeof selected === 'number') setExpanded(current => new Set([...current, ...folderTrail(folders, selected).map(folder => folder.id)]));
  }, [selected, folders]);
  const children = useMemo(() => {
    const grouped = new Map<number | null, SubjectFolder[]>();
    for (const folder of folders) {
      const list = grouped.get(folder.parent_id) || []; list.push(folder); grouped.set(folder.parent_id, list);
    }
    for (const list of grouped.values()) list.sort((a, b) => a.name.localeCompare(b.name));
    return grouped;
  }, [folders]);
  const rows: { folder: SubjectFolder; depth: number }[] = [];
  if (query.trim()) {
    for (const folder of folders) if (!excluded.has(folder.id) && folderPath(folders, folder).toLowerCase().includes(query.trim().toLowerCase())) rows.push({ folder, depth: 0 });
  } else {
    const stack = (children.get(null) || []).map(folder => ({ folder, depth: 0 })).reverse();
    const visited = new Set<number>();
    while (stack.length) {
      const row = stack.pop()!;
      if (visited.has(row.folder.id) || excluded.has(row.folder.id)) continue;
      visited.add(row.folder.id); rows.push(row);
      if (expanded.has(row.folder.id)) for (const folder of [...children.get(row.folder.id) || []].reverse()) stack.push({ folder, depth: row.depth + 1 });
    }
  }
  return <div className="flex min-h-0 flex-1 flex-col">
    <div className="relative m-3"><Search size={14} className="absolute left-3 top-3 text-muted" /><input aria-label="Find a subject" className="field h-10 pl-8 pr-8 text-xs" placeholder="Find a subject…" value={query} onChange={event => setQuery(event.target.value)} />{query && <button type="button" className="icon-btn absolute right-1 top-1 h-8 w-7" aria-label="Clear subject search" onClick={() => setQuery('')}><X size={13} /></button>}</div>
    <nav aria-label="Subject navigation" className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
      {showRoot && <button type="button" className={cn('mb-1 flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-xs font-medium', selected === 'root' ? 'bg-accent-soft text-accent-dark dark:bg-accent-dark dark:text-white' : 'text-muted hover:bg-canvas')} onClick={() => onSelect('root')}><FolderOpen size={15} />Subjects</button>}
      <button type="button" {...dropProps('unfiled')} className={cn(dropTarget === 'unfiled' && 'ring-2 ring-inset ring-accent', 'mb-2 flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-xs font-medium', selected === 'unfiled' ? 'bg-accent-soft text-accent-dark dark:bg-accent-dark dark:text-white' : 'text-muted hover:bg-canvas')} title={rootLabel === 'Unfiled' ? 'Files without an assigned subject' : rootLabel} onClick={() => onSelect('unfiled')}><FolderDot id={null} /><Folder size={15} />{rootLabel}</button>
      {rows.map(({ folder, depth }) => <div key={folder.id} {...dropProps(folder.id)} className={cn(dropTarget === folder.id && 'ring-2 ring-inset ring-accent', 'mb-0.5 flex items-center rounded-lg', selected === folder.id ? 'bg-accent-soft text-accent-dark dark:bg-accent-dark dark:text-white' : 'text-muted hover:bg-canvas')} style={{ paddingLeft: Math.min(depth, 12) * 14 }}>
        <button type="button" className="icon-btn h-8 w-7" disabled={!children.has(folder.id) || !!query} aria-label={`${expanded.has(folder.id) ? 'Collapse' : 'Expand'} ${folder.name}`} aria-expanded={expanded.has(folder.id)} onClick={() => setExpanded(current => { const next = new Set(current); if (next.has(folder.id)) next.delete(folder.id); else next.add(folder.id); return next; })}>{children.has(folder.id) ? expanded.has(folder.id) ? <ChevronDown size={13} /> : <ChevronRight size={13} /> : <span className="h-1 w-1 rounded-full bg-muted/40" />}</button>
        <button type="button" className="flex min-w-0 flex-1 items-center gap-2 py-2 pr-2 text-left text-xs" title={folderPath(folders, folder)} aria-current={selected === folder.id ? 'location' : undefined} onClick={() => onSelect(folder.id)}><FolderDot id={folder.id} /><Folder size={14} className="shrink-0" /><span className="min-w-0"><span className="block truncate">{folder.name}</span>{query && <span className="mt-1 block truncate text-[10px] opacity-60">{folderPath(folders, folder)}</span>}</span></button>
      </div>)}
      {query && !rows.length && <p className="p-4 text-center text-xs text-muted">No matching subjects</p>}
    </nav>
  </div>;
}

export default function FolderBrowser({ folders, selected, onSelect, onNew, onDropFiles, canDropFiles }: {
  folders: SubjectFolder[]; selected: FolderSelection; onSelect: (value: FolderSelection) => void; onNew: () => void;
} & FileDropProps) {
  return <aside className="flex h-full min-h-0 flex-col border-r border-line bg-sidebar">
    <div className="flex h-14 shrink-0 items-center justify-between border-b border-line px-4"><h2 className="text-xs font-semibold uppercase tracking-wider text-muted">Subjects <span className="ml-1 opacity-60">{folders.length}</span></h2><button type="button" className="icon-btn h-8 w-8" aria-label="New root subject" onClick={onNew}><FolderPlus size={16} /></button></div>
    <FolderTree folders={folders} selected={selected} onSelect={onSelect} onDropFiles={onDropFiles} canDropFiles={canDropFiles} />
  </aside>;
}
