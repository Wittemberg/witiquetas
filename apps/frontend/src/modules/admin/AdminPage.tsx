import React, { useState, useEffect } from 'react';
import {
  Settings,
  Building2,
  Users,
  ShieldCheck,
  ChevronRight,
  Home,
  ShieldAlert,
} from 'lucide-react';
import { SessionContext, fetchSessionContext, hasAnyPermission } from '../../auth/session.js';
import { CompanyAdminView } from './CompanyAdminView.js';
import { UsersAdminView } from './UsersAdminView.js';
import { RolesAdminView } from './RolesAdminView.js';

interface AdminPageProps {
  sessionContext: SessionContext;
  onUpdateSessionContext: (ctx: SessionContext | null) => void;
  onGoHome: () => void;
}

type AdminTab = 'company' | 'users' | 'roles';

export const AdminPage: React.FC<AdminPageProps> = ({
  sessionContext,
  onUpdateSessionContext,
  onGoHome,
}) => {
  const canViewCompany = hasAnyPermission(['company.view', 'company.manage']);
  const canViewUsers = hasAnyPermission(['users.view', 'users.manage']);
  const canViewRoles = hasAnyPermission(['roles.view', 'roles.manage']);

  const getDefaultTab = (): AdminTab => {
    if (canViewCompany) return 'company';
    if (canViewUsers) return 'users';
    if (canViewRoles) return 'roles';
    return 'company';
  };

  const [activeTab, setActiveTab] = useState<AdminTab>(getDefaultTab);

  // Ajusta a aba se as permissões mudarem
  useEffect(() => {
    if (activeTab === 'company' && !canViewCompany) {
      if (canViewUsers) setActiveTab('users');
      else if (canViewRoles) setActiveTab('roles');
    } else if (activeTab === 'users' && !canViewUsers) {
      if (canViewRoles) setActiveTab('roles');
      else if (canViewCompany) setActiveTab('company');
    } else if (activeTab === 'roles' && !canViewRoles) {
      if (canViewCompany) setActiveTab('company');
      else if (canViewUsers) setActiveTab('users');
    }
  }, [canViewCompany, canViewUsers, canViewRoles, activeTab]);

  // REQUISITO P0: SELF-PERMISSION REFRESH
  // Invalida e recarrega imediatamente o contexto canônico
  const handleSelfAffected = async () => {
    console.log('[AdminShell] Alteração cadastral/perfil detectada no usuário logado. Recarregando contexto canônico...');
    const refreshed = await fetchSessionContext();

    if (!refreshed || refreshed.user.status !== 'ACTIVE') {
      console.warn('[AdminShell] Usuário desativado ou sessão invalidada após alteração. Encerrando sessão...');
      onUpdateSessionContext(null);
      return;
    }

    onUpdateSessionContext(refreshed);

    // Se a alteração removeu acesso à área atual, redirecionar
    const stillCanViewCompany =
      refreshed.permissions.includes('*') ||
      refreshed.permissions.includes('company.view') ||
      refreshed.permissions.includes('company.manage');
    const stillCanViewUsers =
      refreshed.permissions.includes('*') ||
      refreshed.permissions.includes('users.view') ||
      refreshed.permissions.includes('users.manage');
    const stillCanViewRoles =
      refreshed.permissions.includes('*') ||
      refreshed.permissions.includes('roles.view') ||
      refreshed.permissions.includes('roles.manage');

    if (!stillCanViewCompany && !stillCanViewUsers && !stillCanViewRoles) {
      console.warn('[AdminShell] Permissões administrativas revogadas por completo. Redirecionando para rota autorizada...');
      onGoHome();
    } else if (activeTab === 'company' && !stillCanViewCompany) {
      if (stillCanViewUsers) setActiveTab('users');
      else if (stillCanViewRoles) setActiveTab('roles');
      else onGoHome();
    } else if (activeTab === 'users' && !stillCanViewUsers) {
      if (stillCanViewRoles) setActiveTab('roles');
      else if (stillCanViewCompany) setActiveTab('company');
      else onGoHome();
    } else if (activeTab === 'roles' && !stillCanViewRoles) {
      if (stillCanViewCompany) setActiveTab('company');
      else if (stillCanViewUsers) setActiveTab('users');
      else onGoHome();
    }
  };

  const hasAnyAdminAccess = canViewCompany || canViewUsers || canViewRoles;

  if (!hasAnyAdminAccess) {
    return (
      <div className="admin-page-container">
        <div className="admin-error-card">
          <ShieldAlert size={32} color="var(--status-danger)" />
          <h3>Acesso Não Autorizado</h3>
          <p>Você não possui permissões administrativas para visualizar esta área da plataforma.</p>
          <button type="button" className="btn btn-primary" onClick={onGoHome}>
            <Home size={16} />
            <span>Voltar ao Início</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-page-container">
      {/* Breadcrumb e Cabeçalho */}
      <div className="admin-breadcrumb-bar">
        <div className="admin-breadcrumb">
          <span className="breadcrumb-item clickable" onClick={onGoHome}>
            <Home size={14} />
            <span>Início</span>
          </span>
          <ChevronRight size={14} className="breadcrumb-sep" />
          <span className="breadcrumb-item active">
            <Settings size={14} />
            <span>Administração</span>
          </span>
          <ChevronRight size={14} className="breadcrumb-sep" />
          <span className="breadcrumb-item current">
            {activeTab === 'company' && 'Empresa'}
            {activeTab === 'users' && 'Usuários'}
            {activeTab === 'roles' && 'Perfis e Permissões'}
          </span>
        </div>
      </div>

      <div className="admin-page-header">
        <div className="admin-page-title-group">
          <h2 className="admin-page-title">Administração</h2>
          <p className="admin-page-subtitle">
            Gerenciamento de dados cadastrais da organização, catálogo de usuários e matriz RBAC de perfis e permissões.
          </p>
        </div>
      </div>

      {/* Tabs de Navegação da Administração */}
      <div className="admin-tabs-nav">
        {canViewCompany && (
          <button
            type="button"
            className={`admin-tab-btn ${activeTab === 'company' ? 'active' : ''}`}
            onClick={() => setActiveTab('company')}
          >
            <Building2 size={16} />
            <span>Empresa</span>
          </button>
        )}

        {canViewUsers && (
          <button
            type="button"
            className={`admin-tab-btn ${activeTab === 'users' ? 'active' : ''}`}
            onClick={() => setActiveTab('users')}
          >
            <Users size={16} />
            <span>Usuários</span>
          </button>
        )}

        {canViewRoles && (
          <button
            type="button"
            className={`admin-tab-btn ${activeTab === 'roles' ? 'active' : ''}`}
            onClick={() => setActiveTab('roles')}
          >
            <ShieldCheck size={16} />
            <span>Perfis e Permissões</span>
          </button>
        )}
      </div>

      {/* Conteúdo da Aba Ativa */}
      <div className="admin-tab-content">
        {activeTab === 'company' && canViewCompany && (
          <CompanyAdminView onSelfAffected={handleSelfAffected} />
        )}

        {activeTab === 'users' && canViewUsers && (
          <UsersAdminView
            currentUserId={sessionContext.user.id}
            onSelfAffected={handleSelfAffected}
          />
        )}

        {activeTab === 'roles' && canViewRoles && (
          <RolesAdminView
            currentUserRoles={sessionContext.roles}
            onSelfAffected={handleSelfAffected}
          />
        )}
      </div>
    </div>
  );
};
