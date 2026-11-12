import { Moon, Sun, UserRound } from 'lucide-react';
import AgentConnections from '../components/AgentConnections';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { cn } from '../lib/utils';

export default function Settings() {
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  return <div className="mx-auto max-w-3xl space-y-8 p-5 sm:p-8">
    <h2 className="text-2xl font-semibold tracking-[-.04em]">Settings</h2>

    <section className="card divide-y divide-line">
      <div className="flex items-center gap-3 p-5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent dark:bg-accent-dark/40"><UserRound size={18} /></span>
        <div className="min-w-0"><h3 className="text-sm font-semibold">{user?.name}</h3><p className="truncate text-xs text-muted">{user?.email}</p></div>
      </div>
      <div className="flex items-center justify-between gap-3 p-5">
        <div><h3 className="text-sm font-semibold">Appearance</h3><p className="mt-0.5 text-xs text-muted">Choose light or dark mode.</p></div>
        <div className="flex h-9 items-center rounded-xl border border-line bg-canvas p-1" role="group" aria-label="Theme">
          {(['light', 'dark'] as const).map(option => <button key={option} aria-pressed={theme === option} onClick={() => theme !== option && toggleTheme()} className={cn('flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium capitalize', theme === option ? 'bg-surface text-ink shadow-sm' : 'text-muted')}>{option === 'light' ? <Sun size={13} /> : <Moon size={13} />}{option}</button>)}
        </div>
      </div>
    </section>

    <AgentConnections />
  </div>;
}
