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
    <div className="flex h-screen overflow-hidden bg-canvas">
      <Sidebar collapsed={collapsed} onCollapse={toggleCollapsed} mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile only: the sidebar is hidden below lg, so keep a way to open it. */}
        <button className="icon-btn fixed left-3 top-3 z-30 border border-line bg-surface/90 shadow-sm backdrop-blur lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><Menu size={20} /></button>
        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto pt-14 lg:pt-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
