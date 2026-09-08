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
  Gauge,
} from 'lucide-react';
import { isDevControlCenterEnabled } from '../services/devControlApi.js';
import { hasAnyPermission } from '../auth/session.js';

import {
  getEffectiveNavigation,
  type NavItem,
  BASE_NAV_ITEMS,
} from './navigation.js';
import type { SessionContext } from '../auth/session.js';
import { getCachedSessionContext } from '../auth/session.js';

export type { NavItem };
export { BASE_NAV_ITEMS };

export const getNavItems = (): NavItem[] => {
  return getEffectiveNavigation(getCachedSessionContext());
};

export const NAV_ITEMS = getNavItems();

interface SidebarProps {
  currentModule: string;
  onSelectModule: (id: string) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
  sessionContext?: SessionContext | null;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentModule,
  onSelectModule,
  collapsed,
  onToggleCollapse,
  isMobileOpen,
  onCloseMobile,
  sessionContext,
}) => {
  const effectiveItems = getEffectiveNavigation(sessionContext ?? getCachedSessionContext());
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
              <div
                className="brand-logo"
                onClick={onToggleCollapse}
                title="Recolher menu"
                aria-label="Recolher menu"
                style={{ cursor: 'pointer' }}
              >
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
          {effectiveItems.map((item) => {
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

