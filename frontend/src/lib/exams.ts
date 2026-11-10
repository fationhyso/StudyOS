import { isValid, parseISO } from 'date-fns';
import { usePreference } from './preferences';

export type Exam = { id: string; name: string; date: string };

const isIsoDate = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && isValid(parseISO(value));

function parseExams(value: unknown): Exam[] {
  const items: unknown[] = Array.isArray(value) ? value : value ? [value] : [];
  return items.filter((item): item is { id?: unknown; name: string; date: string } => !!item && typeof item === 'object' && typeof (item as Exam).name === 'string' && !!(item as Exam).name.trim() && isIsoDate((item as Exam).date))
    .map((item, index) => ({ id: typeof item.id === 'string' ? item.id : `legacy-${index}`, name: item.name, date: item.date }));
}

const parsePeriod = (value: unknown): string | null => isIsoDate(value) ? value : null;

/** Exams are saved to the account, so they appear on every device. */
export function useExams(userId: number) {
  const [exams, save] = usePreference(userId, 'exams', parseExams);
  return { exams, saveExams: (next: Exam[]) => save(next) };
}

export function useExamPeriod(userId: number) {
  const [startDate, save] = usePreference(userId, 'exam-period', parsePeriod);
  return { startDate, saveStartDate: (value: string | null) => save(value) };
}
