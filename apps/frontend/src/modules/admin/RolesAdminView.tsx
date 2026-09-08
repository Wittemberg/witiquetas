import React, { useState, useEffect, useMemo } from 'react';
import {
  Shield,
  Plus,
  Edit2,
  Key,
  Trash2,
  CheckCircle2,
  AlertCircle,
  X,
  Lock,
  CheckSquare,
  Square,
  Users,
} from 'lucide-react';
import {
  AdminApi,
  RoleDTO,
  PermissionCatalogItem,
} from '../../services/adminApi.js';
import { hasPermission } from '../../auth/session.js';

interface RolesAdminViewProps {
  currentUserRoles: string[];
  onSelfAffected: () => Promise<void>;
}

const ESSENTIAL_ADMIN_PERMISSIONS = [
  'company.view',
  'company.manage',
  'users.view',
  'users.manage',
  'roles.view',
  'roles.manage',
];

export const RolesAdminView: React.FC<RolesAdminViewProps> = ({
  currentUserRoles,
  onSelfAffected,
}) => {
  const [roles, setRoles] = useState<RoleDTO[]>([]);
  const [permissionsCatalog, setPermissionsCatalog] = useState<PermissionCatalogItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Modais
  const [isCreateOpen, setIsCreateOpen] = useState<boolean>(false);
  const [editingRole, setEditingRole] = useState<RoleDTO | null>(null);
  const [permissionRole, setPermissionRole] = useState<RoleDTO | null>(null);
  const [deletingRole, setDeletingRole] = useState<RoleDTO | null>(null);

  // Form states - Create
  const [createCode, setCreateCode] = useState<string>('');
  const [createName, setCreateName] = useState<string>('');
  const [createDescription, setCreateDescription] = useState<string>('');
  const [modalSubmitting, setModalSubmitting] = useState<boolean>(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Form states - Edit
  const [editName, setEditName] = useState<string>('');
  const [editDescription, setEditDescription] = useState<string>('');

  // Form states - Permissions Matrix
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);

  const canManage = hasPermission('roles.manage');

  const loadData = async () => {
    setLoading(true);
    setFeedback(null);
    try {
      const [rolesData, permsData] = await Promise.all([
        AdminApi.listRoles(),
        AdminApi.fetchPermissions(),
      ]);
      setRoles(rolesData);
      setPermissionsCatalog(permsData);
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Falha ao carregar perfis e catálogo de permissões.',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Agrupamento das permissões por categoria
  const groupedPermissions = useMemo(() => {
    const map = new Map<string, PermissionCatalogItem[]>();
    for (const item of permissionsCatalog) {
      const list = map.get(item.category) || [];
      list.push(item);
      map.set(item.category, list);
    }
    return Array.from(map.entries());
  }, [permissionsCatalog]);

  // Abertura do Modal de Criação
  const openCreateModal = () => {
    setCreateCode('');
    setCreateName('');
    setCreateDescription('');
    setModalError(null);
    setIsCreateOpen(true);
  };

  // Submit Criação
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createCode.trim() || !createName.trim()) {
      setModalError('Código e nome do perfil são obrigatórios.');
      return;
    }

    setModalSubmitting(true);
    setModalError(null);

    try {
      await AdminApi.createRole({
        code: createCode.trim().toUpperCase(),
        name: createName.trim(),
        description: createDescription ? createDescription.trim() : undefined,
      });

      setIsCreateOpen(false);
      setFeedback({ type: 'success', message: 'Perfil criado com sucesso.' });
      await loadData();
    } catch (err: any) {
      setModalError(err.message || 'Erro ao criar perfil.');
    } finally {
      setModalSubmitting(false);
    }
  };

  // Abertura do Modal de Edição
  const openEditModal = (r: RoleDTO) => {
    setEditingRole(r);
    setEditName(r.name);
    setEditDescription(r.description || '');
    setModalError(null);
  };

  // Submit Edição
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRole) return;

    if (!editName.trim()) {
      setModalError('O nome do perfil não pode estar em branco.');
      return;
    }

    setModalSubmitting(true);
    setModalError(null);

    try {
      await AdminApi.updateRole(editingRole.id, {
        name: editName.trim(),
        description: editDescription.trim(),
      });

      setEditingRole(null);
      setFeedback({ type: 'success', message: 'Perfil atualizado com sucesso.' });
      await loadData();
    } catch (err: any) {
      setModalError(err.message || 'Erro ao atualizar dados do perfil.');
    } finally {
      setModalSubmitting(false);
    }
  };

  // Abertura do Modal de Permissões
  const openPermissionModal = (r: RoleDTO) => {
    setPermissionRole(r);
    setSelectedPermissions(r.permissions || []);
    setModalError(null);
  };

  // Toggle de permissão individual
  const togglePermission = (code: string) => {
    if (!permissionRole) return;

    // Se for ADMIN, permissões essenciais são fixas
    if (permissionRole.code === 'ADMIN' && ESSENTIAL_ADMIN_PERMISSIONS.includes(code)) {
      return;
    }

    setSelectedPermissions((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  // Batch: Marcar todas
  const handleSelectAll = () => {
    setSelectedPermissions(permissionsCatalog.map((p) => p.code));
  };

  // Batch: Desmarcar todas (mantendo essenciais se for ADMIN)
  const handleDeselectAll = () => {
    if (permissionRole?.code === 'ADMIN') {
      setSelectedPermissions([...ESSENTIAL_ADMIN_PERMISSIONS]);
    } else {
      setSelectedPermissions([]);
    }
  };

  // Batch por categoria
  const handleSelectCategory = (categoryItems: PermissionCatalogItem[]) => {
    const codes = categoryItems.map((c) => c.code);
    setSelectedPermissions((prev) => Array.from(new Set([...prev, ...codes])));
  };

  const handleDeselectCategory = (categoryItems: PermissionCatalogItem[]) => {
    const codes = new Set(categoryItems.map((c) => c.code));
    setSelectedPermissions((prev) =>
      prev.filter((c) => {
        if (permissionRole?.code === 'ADMIN' && ESSENTIAL_ADMIN_PERMISSIONS.includes(c)) {
          return true;
        }
        return !codes.has(c);
      })
    );
  };

  // Submit Permissões
  const handlePermissionsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!permissionRole) return;

    setModalSubmitting(true);
    setModalError(null);

    const isCurrentRole = currentUserRoles.includes(permissionRole.code);

    try {
      await AdminApi.updateRolePermissions(permissionRole.id, selectedPermissions);

      setPermissionRole(null);
      setFeedback({
        type: 'success',
        message: `Permissões do perfil '${permissionRole.name}' atualizadas com sucesso.`,
      });
      await loadData();

      // REQUISITO P0: SELF-PERMISSION REFRESH
      if (isCurrentRole) {
        await onSelfAffected();
      }
    } catch (err: any) {
      if (err.code === 'CANNOT_STRIP_ESSENTIAL_ADMIN_PERMISSIONS') {
        setModalError('Não é permitido remover as permissões administrativas essenciais do perfil de Administrador.');
      } else {
        setModalError(err.message || 'Erro ao salvar permissões do perfil.');
      }
    } finally {
      setModalSubmitting(false);
    }
  };

  // Exclusão de Perfil
  const handleDeleteSubmit = async () => {
    if (!deletingRole) return;

    setModalSubmitting(true);
    setModalError(null);

    try {
      await AdminApi.deleteRole(deletingRole.id);
      setDeletingRole(null);
      setFeedback({ type: 'success', message: 'Perfil removido com sucesso.' });
      await loadData();
    } catch (err: any) {
      setModalError(err.message || 'Erro ao excluir perfil.');
    } finally {
      setModalSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="admin-loading-container">
        <div className="btn-spinner" />
        <span>Carregando perfis e matriz de permissões...</span>
      </div>
    );
  }

  return (
    <div className="admin-roles-view">
      <div className="admin-header-toolbar">
        <div>
          <h3 className="admin-section-title">Perfis de Acesso e Permissões</h3>
          <p className="admin-section-subtitle">
            Configure as regras de autorização RBAC e defina com precisão quais ações cada perfil pode executar.
          </p>
        </div>

        {canManage && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={openCreateModal}
          >
            <Plus size={16} />
            <span>Novo Perfil</span>
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

      {/* Tabela de Perfis */}
      <div className="admin-table-container">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Código</th>
              <th>Nome do Perfil</th>
              <th>Descrição</th>
              <th>Tipo</th>
              <th>Permissões Atribuídas</th>
              <th>Usuários</th>
              <th style={{ textAlign: 'right' }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {roles.map((r) => {
              const permCount = r.permissions ? r.permissions.length : 0;
              const totalPerms = permissionsCatalog.length;
              return (
                <tr key={r.id}>
                  <td>
                    <span className={`admin-role-code-badge ${r.code === 'ADMIN' ? 'admin' : ''}`}>
                      <Shield size={13} />
                      {r.code}
                    </span>
                  </td>
                  <td>
                    <strong>{r.name}</strong>
                  </td>
                  <td style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    {r.description || '—'}
                  </td>
                  <td>
                    <span className={`badge ${r.isSystem ? 'badge-info' : 'badge-neutral'}`}>
                      {r.isSystem ? 'Sistema' : 'Personalizado'}
                    </span>
                  </td>
                  <td>
                    <div className="admin-perm-progress">
                      <span className="admin-perm-count">
                        {permCount} / {totalPerms}
                      </span>
                    </div>
                  </td>
                  <td>
                    <span className="admin-user-count-badge">
                      <Users size={12} />
                      {r.userCount ?? 0}
                    </span>
                  </td>
                  <td>
                    <div className="admin-row-actions">
                      {canManage && (
                        <>
                          <button
                            type="button"
                            className="admin-action-btn"
                            title="Editar Dados do Perfil"
                            onClick={() => openEditModal(r)}
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            type="button"
                            className="admin-action-btn highlight"
                            title="Gerenciar Matriz de Permissões"
                            onClick={() => openPermissionModal(r)}
                          >
                            <Key size={16} />
                          </button>
                          {!r.isSystem && (
                            <button
                              type="button"
                              className="admin-action-btn danger"
                              title={
                                (r.userCount ?? 0) > 0
                                  ? 'Não é possível excluir perfil associado a usuários'
                                  : 'Excluir Perfil'
                              }
                              disabled={(r.userCount ?? 0) > 0}
                              onClick={() => {
                                setDeletingRole(r);
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
            })}
          </tbody>
        </table>
      </div>

      {/* MODAL: NOVO PERFIL */}
      {isCreateOpen && (
        <div className="admin-modal-overlay">
          <div className="admin-modal">
            <div className="admin-modal-header">
              <h3>Novo Perfil de Acesso</h3>
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
                <label className="admin-label">Código Único (Identificador em caixa alta) *</label>
                <input
                  type="text"
                  className="admin-input"
                  placeholder="Ex: SUPERVISOR"
                  value={createCode}
                  onChange={(e) => setCreateCode(e.target.value.toUpperCase())}
                  required
                />
              </div>

              <div className="admin-form-group">
                <label className="admin-label">Nome de Exibição *</label>
                <input
                  type="text"
                  className="admin-input"
                  placeholder="Ex: Supervisor de Produção"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  required
                />
              </div>

              <div className="admin-form-group">
                <label className="admin-label">Descrição das Atribuições</label>
                <textarea
                  className="admin-textarea"
                  placeholder="Descreva as responsabilidades deste perfil..."
                  value={createDescription}
                  onChange={(e) => setCreateDescription(e.target.value)}
                  rows={3}
                />
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
                  {modalSubmitting ? 'Criando...' : 'Criar Perfil'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: EDITAR PERFIL */}
      {editingRole && (
        <div className="admin-modal-overlay">
          <div className="admin-modal">
            <div className="admin-modal-header">
              <h3>Editar Perfil ({editingRole.code})</h3>
              <button
                type="button"
                className="admin-modal-close"
                onClick={() => setEditingRole(null)}
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
                <label className="admin-label">Código do Perfil</label>
                <input
                  type="text"
                  className="admin-input readonly"
                  value={editingRole.code}
                  readOnly
                  disabled
                />
              </div>

              <div className="admin-form-group">
                <label className="admin-label">Nome de Exibição *</label>
                <input
                  type="text"
                  className="admin-input"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  required
                />
              </div>

              <div className="admin-form-group">
                <label className="admin-label">Descrição</label>
                <textarea
                  className="admin-textarea"
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  rows={3}
                />
              </div>

              <div className="admin-modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setEditingRole(null)}
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

      {/* MODAL: MATRIZ DE 25 PERMISSÕES */}
      {permissionRole && (
        <div className="admin-modal-overlay">
          <div className="admin-modal admin-modal-wide">
            <div className="admin-modal-header">
              <div>
                <h3>Matriz de Permissões — {permissionRole.name}</h3>
                <span className="admin-modal-tag">Código: {permissionRole.code}</span>
              </div>
              <button
                type="button"
                className="admin-modal-close"
                onClick={() => setPermissionRole(null)}
              >
                <X size={18} />
              </button>
            </div>

            {permissionRole.code === 'ADMIN' && (
              <div className="admin-lockout-notice">
                <Lock size={18} color="var(--accent-cyan)" />
                <div>
                  <strong>Guarda Anti-Lockout Ativa:</strong> As 6 permissões administrativas
                  essenciais (Empresa, Usuários e Papéis) são fixas no perfil ADMIN para evitar
                  a perda irreversível de controle do ambiente.
                </div>
              </div>
            )}

            {modalError && (
              <div className="admin-feedback-banner error" style={{ margin: '1rem 1.5rem 0' }}>
                <AlertCircle size={16} />
                <span>{modalError}</span>
              </div>
            )}

            {/* Ações em Lote */}
            <div className="admin-perm-batch-actions">
              <span className="admin-perm-summary">
                Permissões ativas: <strong>{selectedPermissions.length}</strong> de {permissionsCatalog.length}
              </span>
              <div className="admin-perm-buttons">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={handleSelectAll}
                >
                  <CheckSquare size={14} />
                  Selecionar Todas
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={handleDeselectAll}
                >
                  <Square size={14} />
                  Limpar Seleção
                </button>
              </div>
            </div>

            <form onSubmit={handlePermissionsSubmit} className="admin-perm-matrix-form">
              <div className="admin-perm-categories-grid">
                {groupedPermissions.map(([category, items]) => {
                  const allCategorySelected = items.every((i) =>
                    selectedPermissions.includes(i.code)
                  );
                  return (
                    <div key={category} className="admin-perm-category-card">
                      <div className="admin-perm-category-header">
                        <span className="admin-perm-category-title">{category}</span>
                        <div className="admin-perm-category-quick">
                          {allCategorySelected ? (
                            <button
                              type="button"
                              className="admin-perm-quick-btn"
                              onClick={() => handleDeselectCategory(items)}
                            >
                              Desmarcar
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="admin-perm-quick-btn"
                              onClick={() => handleSelectCategory(items)}
                            >
                              Marcar todas
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="admin-perm-items-list">
                        {items.map((perm) => {
                          const isEssential =
                            permissionRole.code === 'ADMIN' &&
                            ESSENTIAL_ADMIN_PERMISSIONS.includes(perm.code);
                          const isChecked = selectedPermissions.includes(perm.code);

                          return (
                            <label
                              key={perm.code}
                              className={`admin-perm-item ${isChecked ? 'selected' : ''} ${
                                isEssential ? 'locked' : ''
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                disabled={isEssential}
                                onChange={() => togglePermission(perm.code)}
                              />
                              <div className="admin-perm-item-content">
                                <div className="admin-perm-item-head">
                                  <span className="admin-perm-name">{perm.name}</span>
                                  {isEssential ? (
                                    <span className="admin-perm-lock-tag" title="Permissão essencial de segurança">
                                      <Lock size={10} /> Essencial
                                    </span>
                                  ) : (
                                    <span className="admin-perm-code">{perm.code}</span>
                                  )}
                                </div>
                                <p className="admin-perm-desc">{perm.description}</p>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="admin-modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setPermissionRole(null)}
                  disabled={modalSubmitting}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={modalSubmitting}
                >
                  {modalSubmitting ? 'Salvando...' : 'Salvar Matriz de Permissões'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: EXCLUIR PERFIL */}
      {deletingRole && (
        <div className="admin-modal-overlay">
          <div className="admin-modal">
            <div className="admin-modal-header">
              <h3 style={{ color: 'var(--status-danger)' }}>Excluir Perfil</h3>
              <button
                type="button"
                className="admin-modal-close"
                onClick={() => setDeletingRole(null)}
              >
                <X size={18} />
              </button>
            </div>

            <p className="admin-modal-description">
              Tem certeza de que deseja excluir o perfil <strong>{deletingRole.name}</strong> ({deletingRole.code})?
              Esta ação removerá o perfil permanentemente.
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
                onClick={() => setDeletingRole(null)}
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
                {modalSubmitting ? 'Excluindo...' : 'Sim, Excluir Perfil'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
