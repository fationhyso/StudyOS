import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';

/** Account settings stored on the server so they follow the user to every device.
 *  localStorage keeps a per-device copy so the dashboard renders instantly and
 *  values saved before server sync existed are uploaded on first load. */
export type PreferenceKey = 'semester-courses' | 'exams' | 'exam-period';

const localKeys: Record<PreferenceKey, (userId: number) => string> = {
  'semester-courses': userId => `studyos.semester-courses.${userId}`,
  exams: userId => `studyos.exam.${userId}`,
  'exam-period': userId => `studyos.exam-period.${userId}`,
};

const CHANGE_EVENT = 'studyos:preference';
let loaded: { userId: number; promise: Promise<Record<string, unknown>> } | null = null;

function fetchAll(userId: number, fresh = false) {
  if (fresh || !loaded || loaded.userId !== userId) {
    const promise = api<Record<string, unknown>>('/preferences');
    loaded = { userId, promise };
    promise.catch(() => { if (loaded?.promise === promise) loaded = null; });
  }
  return loaded.promise;
}

function readLocal(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return undefined;
    try { return JSON.parse(raw); } catch { return raw; } // older exam-period values were stored as plain strings
  } catch { return undefined; }
}

function writeLocal(key: string, value: unknown) {
  try {
    if (value === null || value === undefined) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch { /* The server copy is the source of truth. */ }
}

export function usePreference<T>(userId: number, key: PreferenceKey, parse: (value: unknown) => T) {
  const localKey = localKeys[key](userId);
  const parseRef = useRef(parse);
  parseRef.current = parse;
  const [value, setValue] = useState<T>(() => parse(readLocal(localKey)));

  useEffect(() => {
    let active = true;
    const apply = (raw: unknown) => { if (active) setValue(parseRef.current(raw)); };
    const sync = (fresh: boolean) => fetchAll(userId, fresh).then(all => {
      if (key in all) {
        writeLocal(localKey, all[key]);
        apply(all[key]);
      } else {
        const local = readLocal(localKey);
        if (local !== undefined && local !== null) {
          // Upload data saved on this device before syncing existed.
          void api(`/preferences/${key}`, { method: 'PATCH', body: JSON.stringify({ value: local }) }).then(() => { all[key] = local; }).catch(() => undefined);
        }
      }
    }).catch(() => undefined);
    const onChange = (event: Event) => { if ((event as CustomEvent).detail === localKey) apply(readLocal(localKey)); };
    const onFocus = () => { void sync(true); };
    void sync(false);
    window.addEventListener(CHANGE_EVENT, onChange);
    window.addEventListener('focus', onFocus);
    return () => { active = false; window.removeEventListener(CHANGE_EVENT, onChange); window.removeEventListener('focus', onFocus); };
  }, [userId, key, localKey]);

  const save = useCallback(async (next: T | null) => {
    writeLocal(localKey, next);
    setValue(parseRef.current(next));
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: localKey }));
    await api(`/preferences/${key}`, { method: 'PATCH', body: JSON.stringify({ value: next }) });
    if (loaded?.userId === userId) loaded.promise.then(all => { if (next === null) delete all[key]; else all[key] = next; }).catch(() => undefined);
  }, [userId, key, localKey]);

  return [value, save] as const;
}
