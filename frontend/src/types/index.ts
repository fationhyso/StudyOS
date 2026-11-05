export interface User {
  id: number;
  email: string;
  name: string;
  created_at: string;
}

export interface Note {
  id: number;
  title: string;
  content: string;
  is_favorite: boolean;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface SubjectFolder {
  parent_id: number | null;
  id: number;
  name: string;
  created_at: string;
}

export interface StudyDocument {
  folder_id: number | null;
  id: number;
  name: string;
  mime_type: string;
  extension: string;
  size: number;
  status: 'processing' | 'ready' | 'error';
  error: string | null;
  page_count: number;
  created_at: string;
  updated_at: string;
}

export interface DocumentContent {
  id: number;
  name: string;
  extension: string;
  text: string;
  pages: string[];
}

export type SessionKind = 'study' | 'review' | 'practice' | string;

export interface StudySession {
  id: number;
  title: string;
  topic: SessionKind;
  notes: string;
  date: string;
  start_minutes: number;
  duration_minutes: number;
  completed: boolean;
  source: string;
  document_id: number | null;
  created_at: string;
  completed_at: string | null;
}

export interface SessionInput {
  title: string;
  topic: string;
  notes: string;
  date: string;
  start_minutes: number;
  duration_minutes: number;
  document_id: number | null;
}

export interface DashboardData {
  date: string;
  stats: {
    completed_minutes: number;
    planned_minutes: number;
    today_sessions: number;
    today_completed: number;
    streak: number;
    notes: number;
    documents: number;
  };
  weekly: { date: string; planned: number; completed: number }[];
  today_sessions: StudySession[];
  upcoming: StudySession[];
  recent_notes: Note[];
  recent_documents: StudyDocument[];
}

export interface Source {
  document_id: number;
  document_name: string;
  page: number;
  snippet: string;
}

export interface Conversation {
  id: number;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: number | string;
  role: 'user' | 'assistant';
  content: string;
  sources: Source[];
  created_at: string;
  pending?: boolean;
  note_id?: number | null;
}

export interface ChatResponse {
  message_id: number;
  note: Note | null;
  conversation_id: number;
  answer: string;
  sources: Source[];
  mode: string;
}

export interface AiStatus {
  connected: boolean;
  mode: string;
  model: string | null;
}
