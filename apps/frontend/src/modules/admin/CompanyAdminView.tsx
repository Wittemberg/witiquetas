import React, { useState, useEffect } from 'react';
import { Building2, Save, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import { AdminApi, CompanyDTO } from '../../services/adminApi.js';
import { hasPermission } from '../../auth/session.js';

interface CompanyAdminViewProps {
  onSelfAffected?: () => Promise<void>;
}

export const CompanyAdminView: React.FC<CompanyAdminViewProps> = () => {
  const [company, setCompany] = useState<CompanyDTO | null>(null);
  const [name, setName] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const canManage = hasPermission('company.manage');

  const loadCompany = async () => {
    setLoading(true);
    setFeedback(null);
    try {
      const data = await AdminApi.fetchCompany();
      setCompany(data);
      setName(data.name);
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Falha ao carregar dados da empresa.',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCompany();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage) return;

    if (!name.trim()) {
      setFeedback({ type: 'error', message: 'O nome da empresa não pode estar em branco.' });
      return;
    }

    setSaving(true);
    setFeedback(null);

    try {
      const updated = await AdminApi.updateCompany({ name: name.trim() });
      setCompany(updated);
      setName(updated.name);
      setFeedback({ type: 'success', message: 'Dados da empresa atualizados com sucesso.' });
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Erro ao salvar alterações da empresa.',
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="admin-loading-container">
        <div className="btn-spinner" />
        <span>Carregando dados da empresa...</span>
      </div>
    );
  }

  if (!company) {
    return (
      <div className="admin-error-card">
        <AlertCircle size={20} color="var(--status-danger)" />
        <span>Não foi possível carregar os dados cadastrais da empresa.</span>
        <button type="button" className="btn btn-secondary" onClick={loadCompany}>
          <RefreshCw size={14} /> Tentar novamente
        </button>
      </div>
    );
  }

  return (
    <div className="admin-company-view">
      <div className="admin-card">
        <div className="admin-card-header">
          <div className="admin-card-header-icon">
            <Building2 size={24} color="var(--accent-blue)" />
          </div>
          <div>
            <h3 className="admin-card-title">Dados Cadastrais da Empresa</h3>
            <p className="admin-card-subtitle">
              Identificação canônica da organização no Witiquetas. O slug e identificador são gerados na fundação da empresa.
            </p>
          </div>
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

        <form onSubmit={handleSubmit} className="admin-form">
          <div className="admin-form-grid">
            <div className="admin-form-group">
              <label className="admin-label">ID da Empresa (UUID / Identificador)</label>
              <input
                type="text"
                className="admin-input readonly"
                value={company.id}
                readOnly
                disabled
              />
            </div>

            <div className="admin-form-group">
              <label className="admin-label">Slug Canônico da Organização</label>
              <input
                type="text"
                className="admin-input readonly"
                value={company.slug}
                readOnly
                disabled
              />
            </div>

            <div className="admin-form-group admin-form-group-full">
              <label className="admin-label">
                Nome da Empresa / Razão Social
                {!canManage && <span className="admin-label-hint">(Somente leitura)</span>}
              </label>
              <input
                type="text"
                className={`admin-input ${!canManage ? 'readonly' : ''}`}
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={!canManage || saving}
                placeholder="Ex: Minha Empresa Ltda"
                required
              />
            </div>

            <div className="admin-form-group">
              <label className="admin-label">Status da Organização</label>
              <div className="admin-status-display">
                <span className={`badge ${company.status === 'ACTIVE' ? 'badge-success' : 'badge-danger'}`}>
                  {company.status === 'ACTIVE' ? 'ATIVO' : 'INATIVO'}
                </span>
              </div>
            </div>

            <div className="admin-form-group">
              <label className="admin-label">Criada em</label>
              <input
                type="text"
                className="admin-input readonly"
                value={new Date(company.createdAt).toLocaleString('pt-BR')}
                readOnly
                disabled
              />
            </div>
          </div>

          {canManage && (
            <div className="admin-form-actions">
              <button
                type="submit"
                className="btn btn-primary"
                disabled={saving || name.trim() === company.name}
              >
                {saving ? (
                  <>
                    <div className="btn-spinner" />
                    <span>Salvando...</span>
                  </>
                ) : (
                  <>
                    <Save size={16} />
                    <span>Salvar Alterações</span>
                  </>
                )}
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
};
