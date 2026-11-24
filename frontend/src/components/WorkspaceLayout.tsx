import { Menu } from 'lucide-react';
import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';

export default function WorkspaceLayout() {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('studyos.sidebar') === 'collapsed');
  const [mobileOpen, setMobileOpen] = useState(false);
  const toggleCollapsed = () => setCollapsed((value) => {
    localStorage.setItem('studyos.sidebar', value ? 'expanded' : 'collapsed');
    return !value;
  });

  return (
    <div className="relative flex h-screen overflow-hidden">
      <div className="backdrop-light" aria-hidden="true" />
      <Sidebar collapsed={collapsed} onCollapse={toggleCollapsed} mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} />
      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        {/* Mobile only: the sidebar is hidden below lg, so keep a way to open it. */}
        <button className="icon-btn glass fixed left-3 top-3 z-30 h-10 w-10 rounded-2xl text-ink lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><Menu size={19} /></button>
        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto pb-6 pt-16 lg:pt-3">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
