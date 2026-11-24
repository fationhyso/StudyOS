import {
  CalendarDays, ChevronsLeft, ChevronsRight, FileStack,
  LayoutDashboard, LogOut, Moon, Settings, Sun, UserRound, X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { cn, initials } from '../lib/utils';
import { Logo } from './ui';

const navigation = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/schedule', label: 'Schedule', icon: CalendarDays },
  { to: '/files', label: 'Files & resources', icon: FileStack },
];

const itemBase = 'flex h-10 w-full items-center gap-3 rounded-xl px-3 text-[13px] font-medium text-muted transition hover:bg-canvas hover:text-ink';
const itemActive = 'bg-raised text-ink shadow-sm ring-1 ring-[rgb(var(--rim))] hover:bg-raised';

export default function Sidebar({ collapsed, onCollapse, mobileOpen, onMobileClose }: {
  collapsed: boolean;
  onCollapse: () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}) {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [profileOpen, setProfileOpen] = useState(false);
  const profile = useRef<HTMLDivElement>(null);
  // The pane's backdrop-filter traps `position: fixed` children, so close the menu with a document listener instead of a full-screen scrim.
  useEffect(() => {
    if (!profileOpen) return;
    const close = (event: MouseEvent) => { if (!profile.current?.contains(event.target as Node)) setProfileOpen(false); };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setProfileOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', onKey); };
  }, [profileOpen]);

  return (
    <>
      {mobileOpen && <button aria-label="Close navigation" className="fixed inset-0 z-30 bg-[rgb(var(--shade)/.2)] backdrop-blur-[6px] lg:hidden" onClick={onMobileClose} />}
      {/* A floating pane: inset from the window edge so the light field shows around it. */}
      <aside className={cn(
        'glass fixed inset-y-3 left-3 z-40 flex shrink-0 flex-col rounded-[22px] transition-[width,transform] duration-300 lg:relative lg:inset-auto lg:z-50 lg:m-3 lg:mr-0 lg:translate-x-0',
        collapsed ? 'lg:w-[72px]' : 'lg:w-[240px]',
        'w-[268px]', mobileOpen ? 'translate-x-0' : '-translate-x-[110%]',
      )}>
        <div className={cn('flex h-16 items-center justify-between px-3', collapsed && 'lg:justify-center lg:px-0')}>
          <Link to="/" className="rounded-xl px-1 lg:hidden" aria-label="StudyOS dashboard" onClick={onMobileClose}><Logo /></Link>
          <Link to="/" aria-label="StudyOS dashboard" className="hidden rounded-xl px-1 lg:block"><Logo compact={collapsed} /></Link>
          <button className="icon-btn lg:hidden" onClick={onMobileClose} aria-label="Close sidebar"><X size={19} /></button>
        </div>

        <div className="mx-3 h-px bg-line" />

        <div className="flex-1 overflow-y-auto px-3 py-4">
          <nav className="space-y-1" aria-label="Main navigation">
            {navigation.map(({ to, label, icon: Icon, end }) => (
              <NavLink key={to} to={to} end={end} onClick={onMobileClose} title={collapsed ? label : undefined} className={({ isActive }) => cn(itemBase, collapsed && 'lg:justify-center lg:px-0', isActive && itemActive)}>
                {({ isActive }) => <><Icon size={18} strokeWidth={isActive ? 2.2 : 1.8} className={cn('shrink-0', isActive && 'text-accent')} /><span className={cn('truncate', collapsed && 'lg:hidden')}>{label}</span></>}
              </NavLink>
            ))}
          </nav>
          <div className={cn('mt-6 rounded-2xl bg-canvas p-3.5', collapsed && 'lg:hidden')}>
            <div className="flex items-center gap-2 text-xs font-semibold"><span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_0_3px_rgb(16_185_129/.18)]" />Private by design</div>
            <p className="mt-1.5 text-[11px] leading-4 text-muted">Your files and study data stay on your server.</p>
          </div>
        </div>

        <div className="space-y-0.5 p-3">
          <div className="mb-2 h-px bg-line" />
          <NavLink to="/settings" onClick={onMobileClose} title={collapsed ? 'Settings' : undefined} className={({ isActive }) => cn(itemBase, collapsed && 'lg:justify-center lg:px-0', isActive && itemActive)}>
            <Settings size={18} /><span className={cn(collapsed && 'lg:hidden')}>Settings</span>
          </NavLink>
          <button onClick={toggleTheme} className={cn(itemBase, collapsed && 'lg:justify-center lg:px-0')} title={collapsed ? `Use ${theme === 'dark' ? 'light' : 'dark'} mode` : undefined}>
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}<span className={cn(collapsed && 'lg:hidden')}>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
          </button>
          <div ref={profile} className="relative pt-1">
            <button onClick={() => setProfileOpen(!profileOpen)} aria-expanded={profileOpen} className={cn('relative z-20 flex h-12 w-full items-center gap-3 rounded-xl px-2 text-left transition hover:bg-canvas', profileOpen && 'bg-canvas', collapsed && 'lg:justify-center lg:px-0')}>
              <span className="chip h-8 w-8 rounded-full bg-accent-soft text-xs font-bold text-accent-dark dark:text-emerald-100">{initials(user?.name || 'User')}</span>
              <span className={cn('min-w-0 flex-1', collapsed && 'lg:hidden')}><span className="block truncate text-xs font-semibold">{user?.name}</span><span className="block truncate text-[10px] text-muted">{user?.email}</span></span>
              <UserRound size={14} className={cn('text-muted', collapsed && 'lg:hidden')} />
            </button>
            {profileOpen && (
              <div className="glass-raised absolute bottom-14 left-0 z-30 w-full min-w-52 rounded-2xl p-1.5 animate-slide-up">
                <button className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm transition hover:bg-canvas" onClick={() => { setProfileOpen(false); onMobileClose(); navigate('/settings'); }}><Settings size={16} />Settings</button>
                <button className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm text-red-600 transition hover:bg-red-500/10 dark:text-red-400" onClick={() => { logout(); navigate('/login'); }}><LogOut size={16} />Sign out</button>
              </div>
            )}
          </div>
        </div>
        <button onClick={onCollapse} className="glass-raised absolute -right-3 top-[76px] z-50 hidden h-6 w-6 items-center justify-center rounded-full text-muted transition hover:text-ink lg:flex" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
          {collapsed ? <ChevronsRight size={13} /> : <ChevronsLeft size={13} />}
        </button>
      </aside>
    </>
  );
}
