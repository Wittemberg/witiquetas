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
  Tag,
} from 'lucide-react';

export interface NavItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string; size?: number }>;
  description: string;
  path: string;
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
    description: 'Central de Impressão — Em desenvolvimento',
    path: '/print-center',
  },
  {
    id: 'printers',
    label: 'Impressoras',
    icon: Printer,
    description: 'Impressoras — Em desenvolvimento',
    path: '/printers',
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
    description: 'Integrações — Em desenvolvimento',
    path: '/integrations',
  },
  {
    id: 'admin',
    label: 'Administração',
    icon: Settings,
    description: 'Administração — Em desenvolvimento',
    path: '/admin',
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
          {collapsed ? (
            <div
              className="brand-logo"
              onClick={onToggleCollapse}
              title="Expandir menu"
              aria-label="Expandir menu"
              style={{ cursor: 'pointer' }}
            >
              <div className="brand-icon-wrapper">
                <Tag size={20} className="brand-icon-svg" />
              </div>
            </div>
          ) : (
            <>
              <div className="brand-logo" onClick={() => onSelectModule('home')}>
                <div className="brand-icon-wrapper">
                  <Tag size={20} className="brand-icon-svg" />
                </div>
                <span className="brand-title">Witiquetas</span>
              </div>
              <button
                type="button"
                className="sidebar-toggle-btn"
                onClick={onToggleCollapse}
                title="Recolher menu"
                aria-label="Recolher menu"
              >
                <ChevronLeft size={16} />
              </button>
            </>
          )}
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
              </button>
            );
          })}
        </nav>
      </aside>
    </>
  );
};

