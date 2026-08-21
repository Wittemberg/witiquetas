import React from 'react';

export interface NavItem {
  id: string;
  label: string;
  icon: string;
  description: string;
  path: string;
  badge?: string;
}

export const NAV_ITEMS: NavItem[] = [
  {
    id: 'home',
    label: 'Início',
    icon: '🏠',
    description: 'Painel principal e visões gerais',
    path: '/',
  },
  {
    id: 'models',
    label: 'Meus Modelos',
    icon: '📄',
    description: 'Gerenciador de modelos de etiquetas',
    path: '/models',
  },
  {
    id: 'new',
    label: 'Nova Etiqueta',
    icon: '✨',
    description: 'Criar novo modelo assistido pelo Wizard',
    path: '/new',
  },
  {
    id: 'print-center',
    label: 'Central de Impressão',
    icon: '📋',
    description: 'Fila de trabalhos e ordens de impressão',
    path: '/print-center',
    badge: 'Em Breve',
  },
  {
    id: 'printers',
    label: 'Impressoras',
    icon: '🖨️',
    description: 'Impressoras locais e de rede homologadas',
    path: '/printers',
    badge: 'Em Breve',
  },
  {
    id: 'agents',
    label: 'Agents de Impressão',
    icon: '🖥️',
    description: 'Status e gerenciamento de agentes locais',
    path: '/agents',
  },
  {
    id: 'integrations',
    label: 'Integrações',
    icon: '🔌',
    description: 'Conectores REST e APIs de ERPs',
    path: '/integrations',
    badge: 'Em Breve',
  },
  {
    id: 'admin',
    label: 'Administração',
    icon: '⚙️',
    description: 'Configurações gerais do tenant e logs',
    path: '/admin',
    badge: 'Em Breve',
  },
];

interface SidebarProps {
  currentModule: string;
  onSelectModule: (id: string) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentModule,
  onSelectModule,
  collapsed,
  onToggleCollapse,
  isMobileOpen,
  onCloseMobile,
}) => {
  return (
    <>
      {/* Overlay para mobile drawer */}
      {isMobileOpen && (
        <div
          className="sidebar-mobile-overlay"
          onClick={onCloseMobile}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.5)',
            backdropFilter: 'blur(4px)',
            zIndex: 40,
          }}
        />
      )}

      <aside
        className={`app-sidebar ${collapsed ? 'collapsed' : ''} ${isMobileOpen ? 'mobile-open' : ''}`}
        aria-label="Navegação principal"
      >
        <div className="sidebar-header">
          <div className="brand-logo" onClick={() => onSelectModule('home')}>
            <span className="brand-icon">🏷️</span>
            {!collapsed && <span className="brand-title">Witiquetas</span>}
          </div>
          <button
            type="button"
            className="sidebar-toggle-btn"
            onClick={onToggleCollapse}
            title={collapsed ? 'Expandir menu' : 'Recolher menu'}
            aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
          >
            {collapsed ? '❯' : '❮'}
          </button>
        </div>

        <nav className="sidebar-nav">
          {NAV_ITEMS.map((item) => {
            const isActive = currentModule === item.id;
            return (
              <button
                key={item.id}
                type="button"
                className={`sidebar-nav-item ${isActive ? 'active' : ''}`}
                onClick={() => {
                  onSelectModule(item.id);
                  if (onCloseMobile) onCloseMobile();
                }}
                title={collapsed ? `${item.label}: ${item.description}` : item.description}
              >
                <span className="nav-icon" aria-hidden="true">
                  {item.icon}
                </span>
                {!collapsed && <span className="nav-label">{item.label}</span>}
                {!collapsed && item.badge && <span className="nav-badge">{item.badge}</span>}
              </button>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          {!collapsed && (
            <div className="sidebar-version-info">
              <span>Witiquetas Enterprise</span>
              <small>v0.1.0 • Multi-tenant</small>
            </div>
          )}
        </div>
      </aside>
    </>
  );
};
