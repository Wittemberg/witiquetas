import React from 'react';
import {
  Home,
  LayoutTemplate,
  PlusSquare,
  ListOrdered,
  Printer,
  Cpu,
  Plug,
  Settings,
  ChevronLeft,
  ChevronRight,
  Tag,
} from 'lucide-react';

export interface NavItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string; size?: number }>;
  description: string;
  path: string;
  badge?: string;
}

export const NAV_ITEMS: NavItem[] = [
  {
    id: 'home',
    label: 'Início',
    icon: Home,
    description: 'Painel principal e visões gerais',
    path: '/',
  },
  {
    id: 'models',
    label: 'Meus Modelos',
    icon: LayoutTemplate,
    description: 'Gerenciador de modelos de etiquetas',
    path: '/models',
  },
  {
    id: 'new',
    label: 'Nova Etiqueta',
    icon: PlusSquare,
    description: 'Criar novo modelo assistido pelo Wizard',
    path: '/new',
  },
  {
    id: 'print-center',
    label: 'Central de Impressão',
    icon: ListOrdered,
    description: 'Fila de trabalhos e ordens de impressão',
    path: '/print-center',
    badge: 'Em Breve',
  },
  {
    id: 'printers',
    label: 'Impressoras',
    icon: Printer,
    description: 'Impressoras locais e de rede homologadas',
    path: '/printers',
    badge: 'Em Breve',
  },
  {
    id: 'agents',
    label: 'Agents de Impressão',
    icon: Cpu,
    description: 'Status e gerenciamento de agentes locais',
    path: '/agents',
  },
  {
    id: 'integrations',
    label: 'Integrações',
    icon: Plug,
    description: 'Conectores REST e APIs de ERPs',
    path: '/integrations',
    badge: 'Em Breve',
  },
  {
    id: 'admin',
    label: 'Administração',
    icon: Settings,
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
        />
      )}

      <aside
        className={`app-sidebar ${collapsed ? 'collapsed' : ''} ${isMobileOpen ? 'mobile-open' : ''}`}
        aria-label="Navegação principal"
      >
        <div className="sidebar-header">
          <div className="brand-logo" onClick={() => onSelectModule('home')}>
            <div className="brand-icon-wrapper">
              <Tag size={20} className="brand-icon-svg" />
            </div>
            {!collapsed && <span className="brand-title">Witiquetas</span>}
          </div>
          <button
            type="button"
            className="sidebar-toggle-btn"
            onClick={onToggleCollapse}
            title={collapsed ? 'Expandir menu' : 'Recolher menu'}
            aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
          >
            {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
        </div>

        <nav className="sidebar-nav">
          {NAV_ITEMS.map((item) => {
            const isActive = currentModule === item.id;
            const IconComponent = item.icon;
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
                  <IconComponent size={20} />
                </span>
                {!collapsed && <span className="nav-label">{item.label}</span>}
                {!collapsed && item.badge && <span className="nav-badge">{item.badge}</span>}
              </button>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          {!collapsed ? (
            <div className="sidebar-version-info">
              <span className="version-name">Witiquetas Enterprise</span>
              <span className="version-details">v0.1.0 • Multi-tenant</span>
            </div>
          ) : (
            <div className="sidebar-version-compact" title="Witiquetas Enterprise v0.1.0">
              <small>v0.1</small>
            </div>
          )}
        </div>
      </aside>
    </>
  );
};

