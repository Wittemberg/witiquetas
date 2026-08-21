import React from 'react';
import { Menu, Building2, Sun, Moon, Bell } from 'lucide-react';

interface GlobalHeaderProps {
  currentModuleName: string;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  onOpenMobileMenu?: () => void;
}

export const GlobalHeader: React.FC<GlobalHeaderProps> = ({
  currentModuleName,
  theme,
  onToggleTheme,
  onOpenMobileMenu,
}) => {
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
        <div className="tenant-badge" title="Empresa / Tenant ativo">
          <Building2 size={16} className="tenant-icon" />
          <span className="tenant-name">Empresa Padrão</span>
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

        {/* Elemento Estrutural Discreto: Notificações (Desativado / Sem ação falsa) */}
        <div
          className="header-icon-placeholder disabled"
          title="Notificações do sistema — em breve"
          aria-disabled="true"
        >
          <Bell size={18} />
        </div>

        {/* Elemento Estrutural Discreto: Perfil do Usuário (Desativado / Sem ação falsa) */}
        <div
          className="header-profile-placeholder disabled"
          title="Perfil do Usuário (Sessão Ativa)"
          aria-disabled="true"
        >
          <span className="user-avatar">US</span>
        </div>
      </div>
    </header>
  );
};

