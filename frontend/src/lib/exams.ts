import { useEffect, useState } from 'react';
import { isValid, parseISO } from 'date-fns';

export type Exam = { id: string; name: string; date: string };

function readExams(key: string): Exam[] {
  try {
    const value = JSON.parse(localStorage.getItem(key) || 'null');
    const items = Array.isArray(value) ? value : value ? [value] : [];
    return items.filter(item => item && typeof item.name === 'string' && item.name.trim() && typeof item.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(item.date) && isValid(parseISO(item.date)))
      .map((item, index) => ({ id: typeof item.id === 'string' ? item.id : `legacy-${index}`, name: item.name, date: item.date }));
  } catch { return []; }
}

export function useExams(userId: number) {
  const key = `studyos.exam.${userId}`;
  const [exams, setExams] = useState<Exam[]>(() => readExams(key));
  useEffect(() => {
    const refresh = () => setExams(readExams(key));
    refresh();
    window.addEventListener('storage', refresh);
    window.addEventListener('studyos:exams', refresh);
    window.addEventListener('focus', refresh);
    return () => { window.removeEventListener('storage', refresh); window.removeEventListener('studyos:exams', refresh); window.removeEventListener('focus', refresh); };
  }, [key]);
  const saveExams = (next: Exam[]) => {
    localStorage.setItem(key, JSON.stringify(next));
    setExams(next);
    window.dispatchEvent(new Event('studyos:exams'));
  };
  return { exams, saveExams };
}
