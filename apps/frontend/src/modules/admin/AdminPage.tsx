import React, { useState, useEffect } from 'react';
import {
  Settings,
  Building2,
  Users,
  ShieldCheck,
  ChevronRight,
  Home,
  ShieldAlert,
  Layers,
} from 'lucide-react';
import {
  SessionContext,
  fetchSessionContext,
  hasAnyPermission,
  broadcastSessionContextInvalidation,
} from '../../auth/session.js';
import { CompanyAdminView } from './CompanyAdminView.js';
import { UsersAdminView } from './UsersAdminView.js';
import { RolesAdminView } from './RolesAdminView.js';
import { NichesAdminView } from './NichesAdminView.js';

interface AdminPageProps {
  sessionContext: SessionContext;
  onUpdateSessionContext: (ctx: SessionContext | null) => void;
  onGoHome: () => void;
}

type AdminTab = 'company' | 'users' | 'roles' | 'niches';

export const AdminPage: React.FC<AdminPageProps> = ({
  sessionContext,
  onUpdateSessionContext,
  onGoHome,
}) => {
  const canViewCompany = hasAnyPermission(['company.view', 'company.manage']);
  const canViewUsers = hasAnyPermission(['users.view', 'users.manage']);
  const canViewRoles = hasAnyPermission(['roles.view', 'roles.manage']);
  const canViewNiches = hasAnyPermission(['niches.view', 'niches.manage', 'elements.view', 'elements.manage']);

  const getDefaultTab = (): AdminTab => {
    if (canViewCompany) return 'company';
    if (canViewUsers) return 'users';
    if (canViewRoles) return 'roles';
    if (canViewNiches) return 'niches';
    return 'company';
  };

  const [activeTab, setActiveTab] = useState<AdminTab>(getDefaultTab);

  // Ajusta a aba se as permissões mudarem
  useEffect(() => {
    if (activeTab === 'company' && !canViewCompany) {
      if (canViewUsers) setActiveTab('users');
      else if (canViewRoles) setActiveTab('roles');
      else if (canViewNiches) setActiveTab('niches');
    } else if (activeTab === 'users' && !canViewUsers) {
      if (canViewRoles) setActiveTab('roles');
      else if (canViewCompany) setActiveTab('company');
      else if (canViewNiches) setActiveTab('niches');
    } else if (activeTab === 'roles' && !canViewRoles) {
      if (canViewCompany) setActiveTab('company');
      else if (canViewUsers) setActiveTab('users');
      else if (canViewNiches) setActiveTab('niches');
    } else if (activeTab === 'niches' && !canViewNiches) {
      if (canViewCompany) setActiveTab('company');
      else if (canViewUsers) setActiveTab('users');
      else if (canViewRoles) setActiveTab('roles');
    }
  }, [canViewCompany, canViewUsers, canViewRoles, canViewNiches, activeTab]);

  // REQUISITO P0: SELF-PERMISSION REFRESH & SESSION SYNC
  // Invalida e recarrega imediatamente o contexto canônico
  const handleSelfAffected = async () => {
    console.log('[AdminShell] Alteração de configuração/perfil detectada. Recarregando contexto canônico...');
    broadcastSessionContextInvalidation();
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
    const stillCanViewNiches =
      refreshed.permissions.includes('*') ||
      refreshed.permissions.includes('niches.view') ||
      refreshed.permissions.includes('niches.manage') ||
      refreshed.permissions.includes('elements.view') ||
      refreshed.permissions.includes('elements.manage');

    if (!stillCanViewCompany && !stillCanViewUsers && !stillCanViewRoles && !stillCanViewNiches) {
      console.warn('[AdminShell] Permissões administrativas revogadas por completo. Redirecionando para rota autorizada...');
      onGoHome();
    } else if (activeTab === 'company' && !stillCanViewCompany) {
      if (stillCanViewUsers) setActiveTab('users');
      else if (stillCanViewRoles) setActiveTab('roles');
      else if (stillCanViewNiches) setActiveTab('niches');
      else onGoHome();
    } else if (activeTab === 'users' && !stillCanViewUsers) {
      if (stillCanViewRoles) setActiveTab('roles');
      else if (stillCanViewCompany) setActiveTab('company');
      else if (stillCanViewNiches) setActiveTab('niches');
      else onGoHome();
    } else if (activeTab === 'roles' && !stillCanViewRoles) {
      if (stillCanViewCompany) setActiveTab('company');
      else if (stillCanViewUsers) setActiveTab('users');
      else if (stillCanViewNiches) setActiveTab('niches');
      else onGoHome();
    } else if (activeTab === 'niches' && !stillCanViewNiches) {
      if (stillCanViewCompany) setActiveTab('company');
      else if (stillCanViewUsers) setActiveTab('users');
      else if (stillCanViewRoles) setActiveTab('roles');
      else onGoHome();
    }
  };

  const hasAnyAdminAccess = canViewCompany || canViewUsers || canViewRoles || canViewNiches;

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
            {activeTab === 'niches' && 'Nichos & Elementos'}
          </span>
        </div>
      </div>

      <div className="admin-page-header">
        <div className="admin-page-title-group">
          <h2 className="admin-page-title">Administração</h2>
          <p className="admin-page-subtitle">
            Gerenciamento de dados cadastrais da organização, catálogo de usuários, matriz RBAC de perfis e parametrização de nichos, elementos visuais e campos canônicos.
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

        {canViewNiches && (
          <button
            type="button"
            className={`admin-tab-btn ${activeTab === 'niches' ? 'active' : ''}`}
            onClick={() => setActiveTab('niches')}
          >
            <Layers size={16} />
            <span>Nichos & Elementos</span>
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

        {activeTab === 'niches' && canViewNiches && (
          <NichesAdminView onConfigChanged={handleSelfAffected} />
        )}
      </div>
    </div>
  );
};
