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
  study: 'border-l-emerald-500 bg-emerald-50/80 text-emerald-950 dark:bg-emerald-950/30 dark:text-emerald-100',
  review: 'border-l-amber-500 bg-amber-50/80 text-amber-950 dark:bg-amber-950/30 dark:text-amber-100',
  practice: 'border-l-violet-500 bg-violet-50/80 text-violet-950 dark:bg-violet-950/30 dark:text-violet-100',
};
