import React from 'react';
import { Menu, Building2, Sun, Moon, LogOut, User as UserIcon } from 'lucide-react';
import type { SessionContext } from '../auth/session.js';

interface GlobalHeaderProps {
  currentModuleName: string;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  onOpenMobileMenu?: () => void;
  sessionContext?: SessionContext | null;
  onLogout?: () => void;
}

export const GlobalHeader: React.FC<GlobalHeaderProps> = ({
  currentModuleName,
  theme,
  onToggleTheme,
  onOpenMobileMenu,
  sessionContext,
  onLogout,
}) => {
  const companyName = sessionContext?.company?.name || 'Empresa Padrão';
  const userName = sessionContext?.user?.name || sessionContext?.user?.email || 'Usuário';
  const userInitials = sessionContext?.user?.name
    ? sessionContext.user.name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()
    : 'US';

  return (
    <header className="global-app-header">
      <div className="header-left">
        <button
          type="button"
          className="mobile-menu-trigger btn-icon"
          onClick={onOpenMobileMenu}
          aria-label="Abrir menu principal"
        >
          <Menu size={20} />
        </button>

        <nav className="header-breadcrumb" aria-label="Navegação hierárquica">
          <span className="breadcrumb-root">Witiquetas</span>
          <span className="breadcrumb-separator">/</span>
          <span className="breadcrumb-current">{currentModuleName}</span>
        </nav>
      </div>

      <div className="header-right">
        {/* Tenant/Company Badge */}
        <div className="tenant-badge" title={`Empresa / Tenant ativo: ${companyName}`}>
          <Building2 size={16} className="tenant-icon" />
          <span className="tenant-name">{companyName}</span>
        </div>

        {/* Theme Toggle Button */}
        <button
          type="button"
          className="btn-theme-toggle"
          onClick={onToggleTheme}
          title={theme === 'dark' ? 'Alternar para Modo Claro' : 'Alternar para Modo Escuro'}
          aria-label="Alternar Tema"
        >
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>

        {/* Perfil do Usuário e Logout */}
        <div className="header-profile-badge" title={`Usuário: ${userName}`}>
          <div className="user-avatar" title={userName}>
            {userInitials}
          </div>
        </div>

        {onLogout && (
          <button
            type="button"
            className="header-logout-btn"
            onClick={onLogout}
            title="Sair do sistema (Logout)"
            aria-label="Sair"
          >
            <LogOut size={15} />
            <span>Sair</span>
          </button>
        )}
      </div>
    </header>
  );
};


