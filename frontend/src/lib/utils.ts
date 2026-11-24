import { format, isToday, isTomorrow, parseISO } from 'date-fns';

export function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}

export function formatMinutes(minutes: number) {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

export function formatTime(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60) % 24;
  const minutes = totalMinutes % 60;
  const date = new Date(2000, 0, 1, hours, minutes);
  return format(date, 'h:mm a');
}

export function localDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function friendlyDate(value: string) {
  const date = parseISO(value);
  if (isToday(date)) return 'Today';
  if (isTomorrow(date)) return 'Tomorrow';
  return format(date, 'EEE, MMM d');
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((word) => word[0]).join('').toUpperCase();
}

export function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export const sessionColors: Record<string, string> = {
  study: 'border-l-emerald-500 bg-emerald-500/[.11] text-emerald-950 ring-emerald-600/15 dark:bg-emerald-400/[.10] dark:text-emerald-50 dark:ring-emerald-300/10',
  review: 'border-l-amber-500 bg-amber-500/[.12] text-amber-950 ring-amber-600/15 dark:bg-amber-400/[.10] dark:text-amber-50 dark:ring-amber-300/10',
  practice: 'border-l-violet-500 bg-violet-500/[.11] text-violet-950 ring-violet-600/15 dark:bg-violet-400/[.11] dark:text-violet-50 dark:ring-violet-300/10',
};
