import {
  BookOpenText, Bot, CalendarDays, ChevronsLeft, ChevronsRight, FileStack,
  KeyRound, LayoutDashboard, LogOut, Moon, Plus, Sun, UserRound, X,
} from 'lucide-react';
import { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { cn, initials } from '../lib/utils';
import { Logo } from './ui';

const navigation = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/schedule', label: 'Schedule', icon: CalendarDays },
  { to: '/notes', label: 'Notes & docs', icon: BookOpenText },
  { to: '/files', label: 'Files & resources', icon: FileStack },
  { to: '/tutor', label: 'AI study tutor', icon: Bot },
  { to: '/integrations', label: 'Agent connections', icon: KeyRound },
];

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

  return (
    <>
      {mobileOpen && <button aria-label="Close navigation" className="fixed inset-0 z-30 bg-black/30 backdrop-blur-sm lg:hidden" onClick={onMobileClose} />}
      <aside className={cn(
        'fixed inset-y-0 left-0 z-40 flex shrink-0 flex-col border-r border-line bg-sidebar transition-[width,transform] duration-300 lg:static lg:translate-x-0',
        collapsed ? 'lg:w-[76px]' : 'lg:w-[248px]',
        'w-[270px]', mobileOpen ? 'translate-x-0' : '-translate-x-full',
      )}>
        <div className={cn('flex h-[68px] items-center border-b border-line/70', collapsed ? 'lg:justify-center lg:px-0' : 'px-5', 'justify-between px-5')}>
          <Link to="/" aria-label="StudyOS dashboard" onClick={onMobileClose}><Logo compact={collapsed} className="lg:hidden" /></Link>
          <Link to="/" aria-label="StudyOS dashboard" className="hidden lg:block"><Logo compact={collapsed} /></Link>
          <button className="icon-btn lg:hidden" onClick={onMobileClose} aria-label="Close sidebar"><X size={19} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-4">
          <button onClick={() => { navigate('/notes?new=1'); onMobileClose(); }} className={cn('mb-5 flex h-10 w-full items-center gap-2.5 rounded-xl border border-line bg-surface text-sm font-medium shadow-sm transition hover:border-accent/40 hover:text-accent', collapsed ? 'lg:justify-center lg:px-0' : 'px-3', 'justify-start px-3')}>
            <Plus size={17} /><span className={cn(collapsed && 'lg:hidden')}>New note</span>
          </button>
          <p className={cn('mb-2 px-3 text-[10px] font-semibold uppercase tracking-[.14em] text-muted', collapsed && 'lg:hidden')}>Workspace</p>
          <nav className="space-y-1" aria-label="Main navigation">
            {navigation.map(({ to, label, icon: Icon, end }) => (
              <NavLink key={to} to={to} end={end} onClick={onMobileClose} title={collapsed ? label : undefined} className={({ isActive }) => cn(
                'group flex h-10 items-center gap-3 rounded-xl px-3 text-[13px] font-medium text-muted transition hover:bg-surface hover:text-ink',
                collapsed && 'lg:justify-center lg:px-0',
                isActive && 'bg-surface text-ink shadow-sm ring-1 ring-line/70',
              )}>
                {({ isActive }) => <><Icon size={18} strokeWidth={isActive ? 2.2 : 1.8} className={cn('shrink-0', isActive && 'text-accent')} /><span className={cn(collapsed && 'lg:hidden')}>{label}</span>{isActive && !collapsed && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-accent" />}</>}
              </NavLink>
            ))}
          </nav>
          <div className={cn('mt-7 rounded-xl border border-line/80 bg-surface/60 p-3.5', collapsed && 'lg:hidden')}>
            <div className="flex items-center gap-2 text-xs font-semibold"><span className="h-2 w-2 rounded-full bg-emerald-500" />Private by design</div>
            <p className="mt-1.5 text-[11px] leading-4 text-muted">Your files and study data stay on your server.</p>
          </div>
        </div>

        <div className="border-t border-line p-3">
          <button onClick={toggleTheme} className={cn('flex h-10 w-full items-center gap-3 rounded-xl px-3 text-[13px] font-medium text-muted transition hover:bg-surface hover:text-ink', collapsed && 'lg:justify-center lg:px-0')} title={collapsed ? `Use ${theme === 'dark' ? 'light' : 'dark'} mode` : undefined}>
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}<span className={cn(collapsed && 'lg:hidden')}>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
          </button>
          <div className="relative mt-1">
            {profileOpen && <button className="fixed inset-0 z-10 cursor-default" aria-label="Close profile menu" onClick={() => setProfileOpen(false)} />}
            <button onClick={() => setProfileOpen(!profileOpen)} className={cn('relative z-20 flex h-12 w-full items-center gap-3 rounded-xl px-2 text-left transition hover:bg-surface', collapsed && 'lg:justify-center lg:px-0')}>
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-bold text-accent-dark dark:bg-accent-dark dark:text-emerald-100">{initials(user?.name || 'User')}</span>
              <span className={cn('min-w-0 flex-1', collapsed && 'lg:hidden')}><span className="block truncate text-xs font-semibold">{user?.name}</span><span className="block truncate text-[10px] text-muted">{user?.email}</span></span>
              <UserRound size={14} className={cn('text-muted', collapsed && 'lg:hidden')} />
            </button>
            {profileOpen && (
              <div className="absolute bottom-14 left-0 z-30 w-full min-w-52 rounded-xl border border-line bg-surface p-1.5 shadow-float animate-slide-up">
                <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-red-600 transition hover:bg-red-50 dark:hover:bg-red-950/30" onClick={() => { logout(); navigate('/login'); }}><LogOut size={16} />Sign out</button>
              </div>
            )}
          </div>
        </div>
        <button onClick={onCollapse} className={cn('absolute -right-3 top-[86px] hidden h-6 w-6 items-center justify-center rounded-full border border-line bg-surface text-muted shadow-sm transition hover:text-ink lg:flex')} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
          {collapsed ? <ChevronsRight size={13} /> : <ChevronsLeft size={13} />}
        </button>
      </aside>
    </>
  );
}
