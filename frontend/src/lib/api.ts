const TOKEN_KEY = 'studyos.token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (token: string | null) => {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
};

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function parseError(response: Response) {
  try {
    const data = await response.json();
    if (typeof data.detail === 'string') return data.detail;
    if (Array.isArray(data.detail)) return data.detail.map((item: { msg: string }) => item.msg).join(', ');
    return 'Something went wrong. Please try again.';
  } catch {
    return response.statusText || 'Unable to connect to StudyOS.';
  }
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers = new Headers(options.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  const response = await fetch(`/api${path}`, { ...options, headers });
  if (response.status === 401 && !path.startsWith('/auth/login') && !path.startsWith('/auth/signup')) {
    setToken(null);
    window.dispatchEvent(new Event('studyos:unauthorized'));
  }
  if (!response.ok) throw new ApiError(await parseError(response), response.status);
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export async function getDocumentBlob(documentId: number): Promise<Blob> {
  const token = getToken();
  const response = await fetch(`/api/documents/${documentId}/file`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) throw new ApiError(await parseError(response), response.status);
  return response.blob();
}

export async function downloadDocument(documentId: number, filename: string) {
  const blob = await getDocumentBlob(documentId);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}


export function downloadMarkdownNote(title: string, content: string) {
  const name = title.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').trim().slice(0, 120) || 'Untitled';
  const url = URL.createObjectURL(new Blob([content], { type: 'text/markdown;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name.toLowerCase().endsWith('.md') ? name : `${name}.md`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
