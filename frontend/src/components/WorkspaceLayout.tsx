import { Bot, Menu } from 'lucide-react';
import { useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { format } from 'date-fns';
import Sidebar from './Sidebar';

const pageTitles: Record<string, { title: string; subtitle: string }> = {
  '/': { title: 'Dashboard', subtitle: 'Your learning at a glance' },
  '/schedule': { title: 'Schedule', subtitle: 'Plan with intention' },
  '/notes': { title: 'Notes & docs', subtitle: 'Think, write, connect' },
  '/files': { title: 'Files & resources', subtitle: 'Your study library' },
  '/integrations': { title: 'Agent connections', subtitle: 'Connect Telegram and external agents' },
  '/tutor': { title: 'AI study tutor', subtitle: 'Answers grounded in your materials' },
};

export default function WorkspaceLayout() {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('studyos.sidebar') === 'collapsed');
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const page = pageTitles[location.pathname] || (location.pathname.startsWith('/files') ? pageTitles['/files'] : pageTitles['/']);
  const toggleCollapsed = () => setCollapsed((value) => {
    localStorage.setItem('studyos.sidebar', value ? 'expanded' : 'collapsed');
    return !value;
  });

  return (
    <div className="flex h-screen overflow-hidden bg-canvas">
      <Sidebar collapsed={collapsed} onCollapse={toggleCollapsed} mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-[68px] shrink-0 items-center gap-3 border-b border-line bg-surface/80 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
          <button className="icon-btn lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><Menu size={20} /></button>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold tracking-tight">{page.title}</h1>
            <p className="hidden truncate text-[11px] text-muted sm:block">{page.subtitle}</p>
          </div>
          <div className="ml-auto flex items-center gap-2 sm:gap-4">
            <span className="hidden text-xs text-muted md:block">{format(new Date(), 'EEEE, MMMM d')}</span>
            <span className="hidden h-5 w-px bg-line md:block" />
            <Link to="/tutor" className="inline-flex h-9 items-center gap-2 rounded-xl bg-accent px-3 text-xs font-semibold text-white shadow-sm transition hover:bg-accent-hover active:scale-95 sm:px-3.5"><Bot size={16} /><span className="hidden sm:inline">Ask study tutor</span><span className="sm:hidden">Tutor</span></Link>
          </div>
        </header>
        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
