import React, { useState, useEffect, useMemo } from 'react';
import {
  Users,
  UserPlus,
  Search,
  KeyRound,
  Edit2,
  Trash2,
  Shield,
  CheckCircle2,
  AlertCircle,
  X,
  Lock,
} from 'lucide-react';
import { AdminApi, UserDTO, RoleDTO } from '../../services/adminApi.js';
import { hasPermission } from '../../auth/session.js';

interface UsersAdminViewProps {
  currentUserId: string;
  onSelfAffected: () => Promise<void>;
}

export const UsersAdminView: React.FC<UsersAdminViewProps> = ({
  currentUserId,
  onSelfAffected,
}) => {
  const [users, setUsers] = useState<UserDTO[]>([]);
  const [roles, setRoles] = useState<RoleDTO[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Modais
  const [isCreateOpen, setIsCreateOpen] = useState<boolean>(false);
  const [editingUser, setEditingUser] = useState<UserDTO | null>(null);
  const [resettingUser, setResettingUser] = useState<UserDTO | null>(null);
  const [deletingUser, setDeletingUser] = useState<UserDTO | null>(null);

  // Form states - Create
  const [createName, setCreateName] = useState<string>('');
  const [createEmail, setCreateEmail] = useState<string>('');
  const [createPassword, setCreatePassword] = useState<string>('');
  const [createStatus, setCreateStatus] = useState<'ACTIVE' | 'INACTIVE'>('ACTIVE');
  const [createRoleIds, setCreateRoleIds] = useState<string[]>([]);
  const [modalSubmitting, setModalSubmitting] = useState<boolean>(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Form states - Edit
  const [editName, setEditName] = useState<string>('');
  const [editEmail, setEditEmail] = useState<string>('');
  const [editStatus, setEditStatus] = useState<'ACTIVE' | 'INACTIVE'>('ACTIVE');
  const [editRoleIds, setEditRoleIds] = useState<string[]>([]);

  // Form states - Reset Password
  const [newPassword, setNewPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');

  const canManage = hasPermission('users.manage');

  const loadData = async () => {
    setLoading(true);
    setFeedback(null);
    try {
      const [usersData, rolesData] = await Promise.all([
        AdminApi.listUsers(),
        AdminApi.listRoles(),
      ]);
      setUsers(usersData);
      setRoles(rolesData);
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Falha ao carregar lista de usuários.',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const matchesSearch =
        u.name.toLowerCase().includes(search.toLowerCase()) ||
        u.email.toLowerCase().includes(search.toLowerCase());
      const matchesStatus =
        statusFilter === 'ALL' || u.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [users, search, statusFilter]);

  // Abertura do Modal de Criação
  const openCreateModal = () => {
    setCreateName('');
    setCreateEmail('');
    setCreatePassword('');
    setCreateStatus('ACTIVE');
    const defaultOperatorRole = roles.find((r) => r.code === 'OPERATOR');
    setCreateRoleIds(defaultOperatorRole ? [defaultOperatorRole.id] : []);
    setModalError(null);
    setIsCreateOpen(true);
  };

  // Submit Criação
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createName.trim() || !createEmail.trim() || !createPassword) {
      setModalError('Preencha todos os campos obrigatórios.');
      return;
    }

    if (createPassword.length < 8) {
      setModalError('A senha deve conter no mínimo 8 caracteres.');
      return;
    }

    setModalSubmitting(true);
    setModalError(null);

    try {
      await AdminApi.createUser({
        name: createName.trim(),
        email: createEmail.trim(),
        password: createPassword,
        status: createStatus,
        roleIds: createRoleIds,
      });

      setIsCreateOpen(false);
      setFeedback({ type: 'success', message: 'Usuário cadastrado com sucesso.' });
      await loadData();
    } catch (err: any) {
      setModalError(err.message || 'Erro ao criar usuário.');
    } finally {
      setModalSubmitting(false);
    }
  };

  // Abertura do Modal de Edição
  const openEditModal = (u: UserDTO) => {
    setEditingUser(u);
    setEditName(u.name);
    setEditEmail(u.email);
    setEditStatus(u.status);
    setEditRoleIds(u.roles.map((r) => r.id));
    setModalError(null);
  };

  // Submit Edição
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    if (!editName.trim() || !editEmail.trim()) {
      setModalError('Nome e e-mail são obrigatórios.');
      return;
    }

    setModalSubmitting(true);
    setModalError(null);

    const isSelf = editingUser.id === currentUserId;

    try {
      await AdminApi.updateUser(editingUser.id, {
        name: editName.trim(),
        email: editEmail.trim(),
        status: editStatus,
        roleIds: editRoleIds,
      });

      setEditingUser(null);
      setFeedback({ type: 'success', message: 'Usuário atualizado com sucesso.' });
      await loadData();

      // REQUISITO P0: SELF-PERMISSION REFRESH
      if (isSelf) {
        await onSelfAffected();
      }
    } catch (err: any) {
      if (err.code === 'CANNOT_DEACTIVATE_LAST_ADMIN') {
        setModalError('Não é permitido inativar o único administrador ativo da organização.');
      } else if (err.code === 'CANNOT_REMOVE_LAST_ADMIN_ROLE') {
        setModalError('Não é permitido remover o perfil de Administrador do único administrador ativo da organização.');
      } else {
        setModalError(err.message || 'Erro ao atualizar usuário.');
      }
    } finally {
      setModalSubmitting(false);
    }
  };

  // Abertura do Modal de Redefinição de Senha
  const openResetPasswordModal = (u: UserDTO) => {
    setResettingUser(u);
    setNewPassword('');
    setConfirmPassword('');
    setModalError(null);
  };

  // Submit Redefinição de Senha
  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resettingUser) return;

    if (newPassword.length < 8) {
      setModalError('A nova senha deve ter no mínimo 8 caracteres.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setModalError('A confirmação de senha não confere com a nova senha digitada.');
      return;
    }

    setModalSubmitting(true);
    setModalError(null);

    const isSelf = resettingUser.id === currentUserId;

    try {
      await AdminApi.resetUserPassword(resettingUser.id, newPassword);
      setResettingUser(null);
      setFeedback({ type: 'success', message: `Senha do usuário ${resettingUser.name} redefinida com sucesso.` });

      // Se redefiniu a própria senha
      if (isSelf) {
        await onSelfAffected();
      }
    } catch (err: any) {
      setModalError(err.message || 'Erro ao redefinir senha do usuário.');
    } finally {
      setModalSubmitting(false);
    }
  };

  // Confirmação e Submit de Exclusão
  const handleDeleteSubmit = async () => {
    if (!deletingUser) return;

    setModalSubmitting(true);
    setModalError(null);

    try {
      await AdminApi.deleteUser(deletingUser.id);
      setDeletingUser(null);
      setFeedback({ type: 'success', message: 'Usuário removido com sucesso.' });
      await loadData();
    } catch (err: any) {
      setModalError(err.message || 'Erro ao excluir usuário.');
    } finally {
      setModalSubmitting(false);
    }
  };

  const toggleCreateRole = (roleId: string) => {
    setCreateRoleIds((prev) =>
      prev.includes(roleId) ? prev.filter((id) => id !== roleId) : [...prev, roleId]
    );
  };

  const toggleEditRole = (roleId: string) => {
    setEditRoleIds((prev) =>
      prev.includes(roleId) ? prev.filter((id) => id !== roleId) : [...prev, roleId]
    );
  };

  if (loading) {
    return (
      <div className="admin-loading-container">
        <div className="btn-spinner" />
        <span>Carregando usuários da empresa...</span>
      </div>
    );
  }

  return (
    <div className="admin-users-view">
      <div className="admin-header-toolbar">
        <div>
          <h3 className="admin-section-title">Gerenciamento de Usuários</h3>
          <p className="admin-section-subtitle">
            Cadastre novos operadores, configure papéis de acesso e gerencie o ciclo de vida das credenciais.
          </p>
        </div>

        {canManage && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={openCreateModal}
          >
            <UserPlus size={16} />
            <span>Novo Usuário</span>
          </button>
        )}
      </div>

      {feedback && (
        <div className={`admin-feedback-banner ${feedback.type}`}>
          {feedback.type === 'success' ? (
            <CheckCircle2 size={18} color="var(--status-success)" />
          ) : (
            <AlertCircle size={18} color="var(--status-danger)" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Barra de Filtro e Busca */}
      <div className="admin-filter-bar">
        <div className="admin-search-wrapper">
          <Search size={16} className="admin-search-icon" />
          <input
            type="text"
            className="admin-search-input"
            placeholder="Buscar por nome ou e-mail..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="admin-filter-tabs">
          <button
            type="button"
            className={`admin-filter-tab ${statusFilter === 'ALL' ? 'active' : ''}`}
            onClick={() => setStatusFilter('ALL')}
          >
            Todos ({users.length})
          </button>
          <button
            type="button"
            className={`admin-filter-tab ${statusFilter === 'ACTIVE' ? 'active' : ''}`}
            onClick={() => setStatusFilter('ACTIVE')}
          >
            Ativos ({users.filter((u) => u.status === 'ACTIVE').length})
          </button>
          <button
            type="button"
            className={`admin-filter-tab ${statusFilter === 'INACTIVE' ? 'active' : ''}`}
            onClick={() => setStatusFilter('INACTIVE')}
          >
            Inativos ({users.filter((u) => u.status === 'INACTIVE').length})
          </button>
        </div>
      </div>

      {/* Tabela de Usuários */}
      <div className="admin-table-container">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Usuário</th>
              <th>E-mail</th>
              <th>Perfis / Papéis</th>
              <th>Status</th>
              <th>Data de Cadastro</th>
              <th style={{ textAlign: 'right' }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.length === 0 ? (
              <tr>
                <td colSpan={6} className="admin-table-empty">
                  Nenhum usuário encontrado com os critérios informados.
                </td>
              </tr>
            ) : (
              filteredUsers.map((u) => {
                const isSelf = u.id === currentUserId;
                const isAdmin = u.roles.some((r) => r.code === 'ADMIN');
                return (
                  <tr key={u.id} className={isSelf ? 'admin-row-self' : ''}>
                    <td>
                      <div className="admin-user-cell">
                        <div className="admin-user-avatar">
                          {u.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div className="admin-user-name">
                            {u.name}
                            {isSelf && <span className="admin-self-tag">(Você)</span>}
                          </div>
                          <div className="admin-user-id">{u.id}</div>
                        </div>
                      </div>
                    </td>
                    <td>{u.email}</td>
                    <td>
                      <div className="admin-role-badges">
                        {u.roles.length === 0 ? (
                          <span className="admin-role-badge none">Sem papel</span>
                        ) : (
                          u.roles.map((r) => (
                            <span
                              key={r.id}
                              className={`admin-role-badge ${r.code === 'ADMIN' ? 'admin' : 'standard'}`}
                            >
                              <Shield size={12} />
                              {r.name}
                            </span>
                          ))
                        )}
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${u.status === 'ACTIVE' ? 'badge-success' : 'badge-danger'}`}>
                        {u.status === 'ACTIVE' ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.825rem', color: 'var(--text-muted)' }}>
                      {new Date(u.createdAt).toLocaleDateString('pt-BR')}
                    </td>
                    <td>
                      <div className="admin-row-actions">
                        {canManage && (
                          <>
                            <button
                              type="button"
                              className="admin-action-btn"
                              title="Editar Usuário"
                              onClick={() => openEditModal(u)}
                            >
                              <Edit2 size={16} />
                            </button>
                            <button
                              type="button"
                              className="admin-action-btn"
                              title="Redefinir Senha"
                              onClick={() => openResetPasswordModal(u)}
                            >
                              <KeyRound size={16} />
                            </button>
                            {!isSelf && (
                              <button
                                type="button"
                                className="admin-action-btn danger"
                                title="Excluir Usuário"
                                onClick={() => {
                                  setDeletingUser(u);
                                  setModalError(null);
                                }}
                              >
                                <Trash2 size={16} />
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* MODAL: NOVO USUÁRIO */}
      {isCreateOpen && (
        <div className="admin-modal-overlay">
          <div className="admin-modal">
            <div className="admin-modal-header">
              <h3>Novo Usuário</h3>
              <button
                type="button"
                className="admin-modal-close"
                onClick={() => setIsCreateOpen(false)}
              >
                <X size={18} />
              </button>
            </div>

            {modalError && (
              <div className="admin-feedback-banner error">
                <AlertCircle size={16} />
                <span>{modalError}</span>
              </div>
            )}

            <form onSubmit={handleCreateSubmit} className="admin-modal-form">
              <div className="admin-form-group">
                <label className="admin-label">Nome Completo *</label>
                <input
                  type="text"
                  className="admin-input"
                  placeholder="Ex: João da Silva"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  required
                />
              </div>

              <div className="admin-form-group">
                <label className="admin-label">Endereço de E-mail *</label>
                <input
                  type="email"
                  className="admin-input"
                  placeholder="Ex: joao@empresa.com.br"
                  value={createEmail}
                  onChange={(e) => setCreateEmail(e.target.value)}
                  required
                />
              </div>

              <div className="admin-form-group">
                <label className="admin-label">Senha Inicial (Mínimo 8 caracteres) *</label>
                <input
                  type="password"
                  className="admin-input"
                  placeholder="••••••••"
                  value={createPassword}
                  onChange={(e) => setCreatePassword(e.target.value)}
                  required
                />
              </div>

              <div className="admin-form-group">
                <label className="admin-label">Status Inicial</label>
                <select
                  className="admin-select"
                  value={createStatus}
                  onChange={(e) => setCreateStatus(e.target.value as any)}
                >
                  <option value="ACTIVE">Ativo (Permitir login)</option>
                  <option value="INACTIVE">Inativo (Bloquear acesso)</option>
                </select>
              </div>

              <div className="admin-form-group">
                <label className="admin-label">Atribuição de Perfis</label>
                <div className="admin-roles-checklist">
                  {roles.map((r) => (
                    <label key={r.id} className="admin-checkbox-label">
                      <input
                        type="checkbox"
                        checked={createRoleIds.includes(r.id)}
                        onChange={() => toggleCreateRole(r.id)}
                      />
                      <span>
                        <strong>{r.name}</strong> ({r.code})
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="admin-modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setIsCreateOpen(false)}
                  disabled={modalSubmitting}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={modalSubmitting}
                >
                  {modalSubmitting ? 'Salvando...' : 'Cadastrar Usuário'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: EDITAR USUÁRIO */}
      {editingUser && (
        <div className="admin-modal-overlay">
          <div className="admin-modal">
            <div className="admin-modal-header">
              <h3>Editar Usuário</h3>
              <button
                type="button"
                className="admin-modal-close"
                onClick={() => setEditingUser(null)}
              >
                <X size={18} />
              </button>
            </div>

            {modalError && (
              <div className="admin-feedback-banner error">
                <AlertCircle size={16} />
                <span>{modalError}</span>
              </div>
            )}

            <form onSubmit={handleEditSubmit} className="admin-modal-form">
              <div className="admin-form-group">
                <label className="admin-label">Nome Completo *</label>
                <input
                  type="text"
                  className="admin-input"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  required
                />
              </div>

              <div className="admin-form-group">
                <label className="admin-label">Endereço de E-mail *</label>
                <input
                  type="email"
                  className="admin-input"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  required
                />
              </div>

              <div className="admin-form-group">
                <label className="admin-label">Status da Conta</label>
                <select
                  className="admin-select"
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as any)}
                >
                  <option value="ACTIVE">Ativo</option>
                  <option value="INACTIVE">Inativo (Revoga sessões e bloqueia login)</option>
                </select>
              </div>

              <div className="admin-form-group">
                <label className="admin-label">Perfis de Acesso</label>
                <div className="admin-roles-checklist">
                  {roles.map((r) => (
                    <label key={r.id} className="admin-checkbox-label">
                      <input
                        type="checkbox"
                        checked={editRoleIds.includes(r.id)}
                        onChange={() => toggleEditRole(r.id)}
                      />
                      <span>
                        <strong>{r.name}</strong> ({r.code})
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="admin-modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setEditingUser(null)}
                  disabled={modalSubmitting}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={modalSubmitting}
                >
                  {modalSubmitting ? 'Salvando...' : 'Salvar Alterações'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: REDEFINIR SENHA */}
      {resettingUser && (
        <div className="admin-modal-overlay">
          <div className="admin-modal">
            <div className="admin-modal-header">
              <h3>Redefinir Senha</h3>
              <button
                type="button"
                className="admin-modal-close"
                onClick={() => setResettingUser(null)}
              >
                <X size={18} />
              </button>
            </div>

            <p className="admin-modal-description">
              Definindo nova senha para <strong>{resettingUser.name}</strong> ({resettingUser.email}).
              Todas as sessões ativas do usuário serão revogadas.
            </p>

            {modalError && (
              <div className="admin-feedback-banner error">
                <AlertCircle size={16} />
                <span>{modalError}</span>
              </div>
            )}

            <form onSubmit={handleResetPasswordSubmit} className="admin-modal-form">
              <div className="admin-form-group">
                <label className="admin-label">Nova Senha (Mínimo 8 caracteres) *</label>
                <input
                  type="password"
                  className="admin-input"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                />
              </div>

              <div className="admin-form-group">
                <label className="admin-label">Confirmar Nova Senha *</label>
                <input
                  type="password"
                  className="admin-input"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                />
              </div>

              <div className="admin-modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setResettingUser(null)}
                  disabled={modalSubmitting}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={modalSubmitting}
                >
                  {modalSubmitting ? 'Redefinindo...' : 'Confirmar Nova Senha'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: EXCLUIR USUÁRIO */}
      {deletingUser && (
        <div className="admin-modal-overlay">
          <div className="admin-modal">
            <div className="admin-modal-header">
              <h3 style={{ color: 'var(--status-danger)' }}>Excluir Usuário</h3>
              <button
                type="button"
                className="admin-modal-close"
                onClick={() => setDeletingUser(null)}
              >
                <X size={18} />
              </button>
            </div>

            <p className="admin-modal-description">
              Tem certeza de que deseja remover permanentemente o usuário{' '}
              <strong>{deletingUser.name}</strong> ({deletingUser.email})?
              Esta ação revogará todas as sessões e removerá suas permissões.
            </p>

            {modalError && (
              <div className="admin-feedback-banner error">
                <AlertCircle size={16} />
                <span>{modalError}</span>
              </div>
            )}

            <div className="admin-modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setDeletingUser(null)}
                disabled={modalSubmitting}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={handleDeleteSubmit}
                disabled={modalSubmitting}
              >
                {modalSubmitting ? 'Excluindo...' : 'Sim, Excluir Usuário'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
