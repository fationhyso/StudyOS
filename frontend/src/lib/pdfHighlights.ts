export type HighlightRect = { x: number; y: number; width: number; height: number };
export type PdfHighlight = { id: number; document_id: number; page: number; text: string; rects: HighlightRect[]; created_at: string };
export type HighlightDraft = Pick<PdfHighlight, 'page' | 'text' | 'rects'>;

// Store page coordinates independent of current zoom and rotation.
export function rotateRect(rect: HighlightRect, rotation: number): HighlightRect {
  const turns = ((rotation % 360) + 360) % 360;
  if (turns === 90) return { x: 1 - rect.y - rect.height, y: rect.x, width: rect.height, height: rect.width };
  if (turns === 180) return { x: 1 - rect.x - rect.width, y: 1 - rect.y - rect.height, width: rect.width, height: rect.height };
  if (turns === 270) return { x: rect.y, y: 1 - rect.x - rect.width, width: rect.height, height: rect.width };
  return rect;
}

export function captureHighlights(root: HTMLElement, rotation: number): HighlightDraft[] {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || !selection.rangeCount || !selection.toString().trim()) return [];
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return [];
  const text = selection.toString().trim().slice(0, 10000);
  const result: HighlightDraft[] = [];
  for (const page of root.querySelectorAll<HTMLElement>('[data-pdf-page]')) {
    const layer = page.querySelector('.react-pdf__Page__textContent');
    if (!layer || !range.intersectsNode(layer)) continue;
    const bounds = page.getBoundingClientRect();
    const rects: HighlightRect[] = [];
    const seen = new Set<string>();
    // Use text-node fragments only: a cross-page range can otherwise include
    // complete page/canvas element rectangles and paint an entire page yellow.
    const fragments: DOMRect[] = [];
    const walker = document.createTreeWalker(layer, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      if (!range.intersectsNode(node)) continue;
      const fragment = document.createRange();
      fragment.selectNodeContents(node);
      if (range.compareBoundaryPoints(Range.START_TO_START, fragment) > 0) fragment.setStart(range.startContainer, range.startOffset);
      if (range.compareBoundaryPoints(Range.END_TO_END, fragment) < 0) fragment.setEnd(range.endContainer, range.endOffset);
      fragments.push(...fragment.getClientRects());
    }
    for (const client of fragments) {
      const left = Math.max(client.left, bounds.left), top = Math.max(client.top, bounds.top);
      const right = Math.min(client.right, bounds.right), bottom = Math.min(client.bottom, bounds.bottom);
      if (right - left < 1 || bottom - top < 1) continue;
      const raw = rotateRect({ x: (left - bounds.left) / bounds.width, y: (top - bounds.top) / bounds.height,
        width: (right - left) / bounds.width, height: (bottom - top) / bounds.height }, -rotation);
      const normalized = { ...raw, x: Math.max(0, raw.x), y: Math.max(0, raw.y) };
      const key = Object.values(normalized).map(value => value.toFixed(4)).join(',');
      if (!seen.has(key)) { seen.add(key); rects.push(normalized); }
    }
    if (rects.length) result.push({ page: Number(page.dataset.pdfPage), text, rects: rects.slice(0, 1000) });
  }
  return result;
}
