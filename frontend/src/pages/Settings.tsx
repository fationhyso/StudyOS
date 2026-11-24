import { Moon, Sun, UserRound } from 'lucide-react';
import AgentConnections from '../components/AgentConnections';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

export default function Settings() {
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  return <div className="mx-auto max-w-3xl space-y-8 px-4 py-2 sm:px-6 lg:px-7">
    <div className="mt-1"><h2 className="page-title">Settings</h2><p className="page-sub">Your account, appearance and agent connections.</p></div>

    <section className="card divide-y divide-line overflow-hidden">
      <div className="flex items-center gap-3 p-5">
        <span className="chip h-9 w-9 bg-accent-soft text-accent dark:text-emerald-300"><UserRound size={18} /></span>
        <div className="min-w-0"><h3 className="text-sm font-semibold">{user?.name}</h3><p className="truncate text-xs text-muted">{user?.email}</p></div>
      </div>
      <div className="flex items-center justify-between gap-3 p-5">
        <div><h3 className="text-sm font-semibold">Appearance</h3><p className="mt-0.5 text-xs text-muted">Choose light or dark mode.</p></div>
        <div className="segmented" role="group" aria-label="Theme">
          {(['light', 'dark'] as const).map(option => <button key={option} aria-pressed={theme === option} onClick={() => theme !== option && toggleTheme()} className="segment capitalize">{option === 'light' ? <Sun size={13} /> : <Moon size={13} />}{option}</button>)}
        </div>
      </div>
    </section>

    <AgentConnections />
  </div>;
}
