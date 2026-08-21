import React, { useState, useEffect } from 'react';
import { Sidebar, NAV_ITEMS } from './Sidebar.js';
import { GlobalHeader } from './GlobalHeader.js';

interface ApplicationShellProps {
  currentModule: string;
  onSelectModule: (id: string) => void;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  children: React.ReactNode;
}

const SIDEBAR_STORAGE_KEY = 'witiquetas_sidebar_collapsed';

export const ApplicationShell: React.FC<ApplicationShellProps> = ({
  currentModule,
  onSelectModule,
  theme,
  onToggleTheme,
  children,
}) => {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(SIDEBAR_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const [isMobileOpen, setIsMobileOpen] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, String(collapsed));
    } catch {}
  }, [collapsed]);

  // Se estiver no Editor, recolhe automaticamente por padrão para modo foco
  useEffect(() => {
    if (currentModule === 'editor') {
      setCollapsed(true);
    }
  }, [currentModule]);

  const activeItem = NAV_ITEMS.find((item) => item.id === currentModule);
  const moduleTitle = activeItem ? activeItem.label : currentModule === 'editor' ? 'Editor de Etiquetas' : 'Início';

  const isEditor = currentModule === 'editor';

  return (
    <div className={`app-shell-container theme-${theme}`}>
      {!isEditor && (
        <GlobalHeader
          currentModuleName={moduleTitle}
          theme={theme}
          onToggleTheme={onToggleTheme}
          onOpenMobileMenu={() => setIsMobileOpen(true)}
        />
      )}

      <div className={`app-shell-body ${isEditor ? 'full-height' : ''}`}>
        <Sidebar
          currentModule={currentModule}
          onSelectModule={onSelectModule}
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed(!collapsed)}
          isMobileOpen={isMobileOpen}
          onCloseMobile={() => setIsMobileOpen(false)}
        />

        <main className="app-main-content" id="main-content">
          {children}
        </main>
      </div>
    </div>
  );
};
