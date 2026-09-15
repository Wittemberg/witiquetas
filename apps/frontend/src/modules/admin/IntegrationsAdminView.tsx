import React, { useState, useEffect } from 'react';
import {
  Plug,
  Plus,
  Trash2,
  Save,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  ArrowRight,
  Database,
  FileSpreadsheet,
  Globe,
  Radio,
  Cpu,
  Info,
  Lock,
  Layers,
  Check,
  X,
  ExternalLink,
} from 'lucide-react';
import {
  AdminApi,
} from '../../services/adminApi.js';
import type {
  IntegrationDTO,
  IntegrationPresetDTO,
  IntegrationFieldMappingDTO,
  CanonicalCapability,
  IntegrationProviderType,
} from '@witiquetas/contracts';
import { CANONICAL_CAPABILITIES } from '@witiquetas/contracts';
import { ALL_KNOWN_INTEGRATION_FIELDS } from '@witiquetas/label-schema';

interface IntegrationsAdminViewProps {
  canManage?: boolean;
  onConfigChanged?: () => Promise<void>;
}

const PROVIDER_ICONS: Record<string, React.FC<{ size?: number; className?: string }>> = {
  SQL: Database,
  REST: Globe,
  CSV: FileSpreadsheet,
  WEBHOOK: Radio,
  MCP: Cpu,
};

const CAPABILITY_LABELS: Record<CanonicalCapability, string> = {
  'products.read': 'Produtos (Catálogo / SKU / EAN)',
  'prices.read': 'Preços (Normal / Promoção)',
  'inventory.read': 'Estoque & Quantidades',
  'logistics.read': 'Logística & Expedição',
  'healthcare.read': 'Saúde & Prontuários',
  'customers.read': 'Clientes & Destinatários',
};

export const IntegrationsAdminView: React.FC<IntegrationsAdminViewProps> = ({
  canManage = true,
  onConfigChanged,
}) => {
  const [integrations, setIntegrations] = useState<IntegrationDTO[]>([]);
  const [presets, setPresets] = useState<IntegrationPresetDTO[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mappings, setMappings] = useState<IntegrationFieldMappingDTO[]>([]);

  const [loading, setLoading] = useState<boolean>(true);
  const [loadingMappings, setLoadingMappings] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [savingMappings, setSavingMappings] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Modal de criação
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const [selectedPresetId, setSelectedPresetId] = useState<string>('');
  const [createName, setCreateName] = useState<string>('');
  const [createBaseUrl, setCreateBaseUrl] = useState<string>('');
  const [createCredentialRef, setCreateCredentialRef] = useState<string>('');

  const loadData = async () => {
    setLoading(true);
    setFeedback(null);
    try {
      const [integs, pres] = await Promise.all([
        AdminApi.fetchIntegrations(),
        AdminApi.fetchIntegrationPresets(),
      ]);
      setIntegrations(integs);
      setPresets(pres);

      if (integs.length > 0) {
        if (!selectedId || !integs.some((i) => i.id === selectedId)) {
          setSelectedId(integs[0].id);
        }
      } else {
        setSelectedId(null);
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Erro ao carregar integrações da empresa.',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const selectedIntegration = integrations.find((i) => i.id === selectedId) || null;

  // Carrega mapeamentos da integração selecionada
  useEffect(() => {
    if (!selectedId) {
      setMappings([]);
      return;
    }
    const loadMappings = async () => {
      setLoadingMappings(true);
      try {
        const data = await AdminApi.fetchIntegrationMappings(selectedId);
        setMappings(data);
      } catch (err: any) {
        setFeedback({
          type: 'error',
          message: err.message || 'Erro ao carregar mapeamentos de campo.',
        });
      } finally {
        setLoadingMappings(false);
      }
    };
    loadMappings();
  }, [selectedId]);

  // Atualiza status da integração (Ativa / Inativa)
  const handleToggleStatus = async () => {
    if (!canManage || !selectedIntegration) return;
    const newStatus = selectedIntegration.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    setSaving(true);
    setFeedback(null);
    try {
      const updated = await AdminApi.updateIntegration(selectedIntegration.id, {
        status: newStatus,
      });
      setIntegrations((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
      setFeedback({
        type: 'success',
        message: `Integração ${newStatus === 'ACTIVE' ? 'ativada' : 'desativada'} com sucesso.`,
      });
      if (onConfigChanged) await onConfigChanged();
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Erro ao alterar status da integração.',
      });
    } finally {
      setSaving(false);
    }
  };

  // Excluir integração
  const handleDeleteIntegration = async () => {
    if (!canManage || !selectedIntegration) return;
    if (!window.confirm(`Tem certeza que deseja excluir a integração "${selectedIntegration.name}"? Todos os seus mapeamentos serão removidos.`)) {
      return;
    }
    setSaving(true);
    setFeedback(null);
    try {
      await AdminApi.deleteIntegration(selectedIntegration.id);
      const remaining = integrations.filter((i) => i.id !== selectedIntegration.id);
      setIntegrations(remaining);
      setSelectedId(remaining[0]?.id || null);
      setFeedback({
        type: 'success',
        message: 'Integração excluída com sucesso.',
      });
      if (onConfigChanged) await onConfigChanged();
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Erro ao excluir integração.',
      });
    } finally {
      setSaving(false);
    }
  };

  // Alteração de um mapeamento existente
  const handleMappingChange = (index: number, field: keyof IntegrationFieldMappingDTO, value: any) => {
    if (!canManage) return;
    setMappings((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  // Adicionar nova linha de mapeamento manual
  const handleAddMappingRow = () => {
    if (!canManage || !selectedIntegration) return;
    const newMap: IntegrationFieldMappingDTO = {
      id: `new-${Date.now()}`,
      companyId: selectedIntegration.companyId,
      integrationId: selectedIntegration.id,
      externalField: '',
      canonicalFieldId: ALL_KNOWN_INTEGRATION_FIELDS[0]?.id || 'produto.sku',
      direction: 'READ',
      enabled: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setMappings((prev) => [...prev, newMap]);
  };

  // Remover linha de mapeamento
  const handleRemoveMappingRow = (index: number) => {
    if (!canManage) return;
    setMappings((prev) => prev.filter((_, i) => i !== index));
  };

  // Salvar mapeamentos
  const handleSaveMappings = async () => {
    if (!canManage || !selectedIntegration) return;
    setSavingMappings(true);
    setFeedback(null);

    // Validações locais
    for (const m of mappings) {
      if (!m.externalField.trim()) {
        setFeedback({ type: 'error', message: 'O nome do campo externo não pode estar em branco.' });
        setSavingMappings(false);
        return;
      }
      if (m.canonicalFieldId.startsWith('system.')) {
        setFeedback({ type: 'error', message: 'Campos do sistema (system.*) não podem ser mapeados para ERP.' });
        setSavingMappings(false);
        return;
      }
    }

    try {
      const payload = mappings.map((m) => ({
        externalField: m.externalField.trim(),
        canonicalFieldId: m.canonicalFieldId.trim(),
        direction: m.direction || 'READ',
        enabled: m.enabled !== false,
        dataType: m.dataType,
      }));
      const updated = await AdminApi.updateIntegrationMappings(selectedIntegration.id, payload);
      setMappings(updated);
      setIntegrations((prev) =>
        prev.map((i) => (i.id === selectedIntegration.id ? { ...i, mappingsCount: updated.length } : i))
      );
      setFeedback({
        type: 'success',
        message: 'Mapeamento de campos salvo com sucesso.',
      });
      if (onConfigChanged) await onConfigChanged();
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Erro ao salvar mapeamentos de campos.',
      });
    } finally {
      setSavingMappings(false);
    }
  };

  // Criar nova integração a partir do Preset selecionado
  const handleCreateIntegration = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage) return;

    const preset = presets.find((p) => p.presetId === selectedPresetId);
    if (!preset) {
      setFeedback({ type: 'error', message: 'Selecione um modelo de integração.' });
      return;
    }

    if (!createName.trim()) {
      setFeedback({ type: 'error', message: 'Informe o nome da integração.' });
      return;
    }

    setSaving(true);
    setFeedback(null);
    try {
      const created = await AdminApi.createIntegration({
        name: createName.trim(),
        providerType: preset.providerType,
        providerId: preset.manifest.providerId,
        status: 'ACTIVE',
        environment: 'PRODUCTION',
        baseUrl: createBaseUrl.trim() || undefined,
        credentialRef: createCredentialRef.trim() || undefined,
        nicheId: preset.defaultNicheId,
        settings: preset.manifest.defaultSettings || {},
        manifest: preset.manifest,
        defaultMappings: preset.defaultMappings,
      });

      setIntegrations((prev) => [...prev, created]);
      setSelectedId(created.id);
      setIsCreateModalOpen(false);
      setCreateName('');
      setCreateBaseUrl('');
      setCreateCredentialRef('');
      setFeedback({
        type: 'success',
        message: `Integração "${created.name}" criada com sucesso!`,
      });
      if (onConfigChanged) await onConfigChanged();
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Erro ao criar integração.',
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="admin-loading-state">
        <RefreshCw size={24} className="spin" />
        <span>Carregando integrações...</span>
      </div>
    );
  }

  return (
    <div className="admin-integrations-view">
      {/* Banner Read-Only */}
      {!canManage && (
        <div className="admin-notice-box" style={{ borderColor: 'rgba(234, 179, 8, 0.4)', background: 'rgba(234, 179, 8, 0.08)' }}>
          <Lock size={18} color="var(--status-warning)" />
          <div>
            <strong>Modo Somente Leitura</strong>
            <p>Você possui permissão de visualização (integrations.view). Para cadastrar, editar ou alterar mapeamentos, solicite ao administrador a permissão integrations.manage.</p>
          </div>
        </div>
      )}

      {/* Feedback Alert */}
      {feedback && (
        <div className={`admin-feedback-alert ${feedback.type}`}>
          {feedback.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Barra de Ações Superior */}
      <div className="admin-section-actions-bar">
        <div>
          <h3 style={{ margin: 0, fontSize: '1.15rem', color: 'var(--text-primary)' }}>
            Fontes de Dados & Conectores ERP
          </h3>
          <p className="admin-hint-text">
            Configure integrações externas declarativas e mapeie campos do seu banco ou ERP para os campos canônicos do Witiquetas.
          </p>
        </div>

        {canManage && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              if (presets.length > 0) {
                setSelectedPresetId(presets[0].presetId);
                setCreateName(presets[0].name);
              }
              setIsCreateModalOpen(true);
            }}
          >
            <Plus size={16} />
            <span>Adicionar Integração</span>
          </button>
        )}
      </div>

      {/* Se não houver integrações cadastradas */}
      {integrations.length === 0 ? (
        <div className="admin-empty-state-card" style={{ textAlign: 'center', padding: '3.5rem 1.5rem', background: 'rgba(0,0,0,0.15)', borderRadius: '12px', border: '1px dashed var(--border-color)', margin: '1.5rem 0' }}>
          <Plug size={48} color="var(--accent-blue)" style={{ margin: '0 auto 1rem', opacity: 0.8 }} />
          <h4 style={{ fontSize: '1.2rem', margin: '0 0 0.5rem', color: 'var(--text-primary)' }}>
            Nenhuma integração conectada
          </h4>
          <p style={{ maxWidth: '520px', margin: '0 auto 1.5rem', color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: '1.5' }}>
            Empresas recém-criadas iniciam sem integrações ativas por padrão. Conecte sua primeira fonte de dados para que os campos dinâmicos de etiquetas fiquem disponíveis na impressão.
          </p>
          {canManage && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                if (presets.length > 0) {
                  setSelectedPresetId(presets[0].presetId);
                  setCreateName(presets[0].name);
                }
                setIsCreateModalOpen(true);
              }}
            >
              <Plus size={16} />
              <span>Conectar Primeira Fonte de Dados</span>
            </button>
          )}
        </div>
      ) : (
        /* Layout Master-Detail */
        <div className="admin-master-detail-container" style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '1.5rem', marginTop: '1.5rem' }}>
          {/* Coluna Esquerda: Lista de Integrações */}
          <div className="admin-integrations-list-column">
            <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '0.65rem', fontWeight: 700 }}>
              Integrações Cadastradas ({integrations.length})
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              {integrations.map((item) => {
                const IconComponent = PROVIDER_ICONS[item.providerType] || Plug;
                const isSelected = item.id === selectedId;

                return (
                  <div
                    key={item.id}
                    onClick={() => setSelectedId(item.id)}
                    style={{
                      padding: '1rem',
                      borderRadius: '10px',
                      background: isSelected ? 'rgba(59, 130, 246, 0.12)' : 'rgba(0,0,0,0.2)',
                      border: `1px solid ${isSelected ? 'var(--accent-blue)' : 'var(--border-color)'}`,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <IconComponent size={16} color={isSelected ? 'var(--accent-blue)' : 'var(--text-muted)'} />
                        <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                          {item.name}
                        </span>
                      </div>
                      <span
                        className={`badge ${item.status === 'ACTIVE' ? 'badge-success' : 'badge-secondary'}`}
                        style={{ fontSize: '0.65rem', padding: '0.15rem 0.4rem' }}
                      >
                        {item.status}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      <span>{item.providerType}</span>
                      <span>•</span>
                      <span>{item.environment}</span>
                      <span>•</span>
                      <span>{item.mappingsCount || 0} campos</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Coluna Direita: Detalhe e Mapeamentos da Integração Selecionada */}
          {selectedIntegration && (
            <div className="admin-integration-detail-column" style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '12px', border: '1px solid var(--border-color)', padding: '1.5rem' }}>
              {/* Header do Detalhe */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '1.25rem', marginBottom: '1.5rem' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.35rem' }}>
                    <h3 style={{ margin: 0, fontSize: '1.3rem', color: 'var(--text-primary)' }}>
                      {selectedIntegration.name}
                    </h3>
                    <span className="badge badge-info" style={{ fontSize: '0.75rem' }}>
                      {selectedIntegration.providerType}
                    </span>
                    <span className="badge badge-secondary" style={{ fontSize: '0.75rem' }}>
                      {selectedIntegration.environment}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    Provider ID: <code style={{ color: 'var(--accent-cyan)' }}>{selectedIntegration.providerId}</code>
                    {selectedIntegration.baseUrl && (
                      <> • Endpoint: <code>{selectedIntegration.baseUrl}</code></>
                    )}
                    {selectedIntegration.credentialRef && (
                      <> • Credencial Ref: <code>{selectedIntegration.credentialRef}</code></>
                    )}
                  </div>
                </div>

                {canManage && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <button
                      type="button"
                      className={`btn ${selectedIntegration.status === 'ACTIVE' ? 'btn-secondary' : 'btn-primary'}`}
                      onClick={handleToggleStatus}
                      disabled={saving}
                      style={{ fontSize: '0.825rem' }}
                    >
                      {selectedIntegration.status === 'ACTIVE' ? 'Desativar Integração' : 'Ativar Integração'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger"
                      onClick={handleDeleteIntegration}
                      disabled={saving}
                      title="Excluir Integração"
                      style={{ padding: '0.5rem' }}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                )}
              </div>

              {/* Matriz de Capabilities */}
              <div style={{ marginBottom: '1.75rem' }}>
                <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '0.65rem', fontWeight: 700 }}>
                  Capabilities Declaradas no Manifesto (Total 6 Canônicas)
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.65rem' }}>
                  {CANONICAL_CAPABILITIES.map((cap) => {
                    const isSupported = selectedIntegration.manifest.capabilities?.includes(cap);
                    return (
                      <div
                        key={cap}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                          padding: '0.6rem 0.85rem',
                          borderRadius: '8px',
                          background: isSupported ? 'rgba(16, 185, 129, 0.08)' : 'rgba(255, 255, 255, 0.02)',
                          border: `1px solid ${isSupported ? 'rgba(16, 185, 129, 0.3)' : 'var(--border-color)'}`,
                          opacity: isSupported ? 1 : 0.45,
                        }}
                      >
                        {isSupported ? (
                          <Check size={16} color="var(--status-success)" />
                        ) : (
                          <X size={16} color="var(--text-muted)" />
                        )}
                        <div>
                          <div style={{ fontSize: '0.8rem', fontWeight: 600, color: isSupported ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                            {cap}
                          </div>
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                            {CAPABILITY_LABELS[cap]}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Tabela de Mapeamento De-Para */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.85rem' }}>
                  <div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                      Mapeamento de Campos De-Para (ERP Externo → Canônico Witiquetas)
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      Apenas campos com integração ativa e mapeamento habilitado tornam-se disponíveis no Editor e Central de Impressão.
                    </div>
                  </div>

                  {canManage && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={handleAddMappingRow}
                        style={{ fontSize: '0.775rem' }}
                      >
                        <Plus size={14} />
                        <span>Adicionar Linha</span>
                      </button>
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={handleSaveMappings}
                        disabled={savingMappings}
                        style={{ fontSize: '0.775rem' }}
                      >
                        <Save size={14} />
                        <span>Salvar Mapeamentos</span>
                      </button>
                    </div>
                  )}
                </div>

                {loadingMappings ? (
                  <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    <RefreshCw size={20} className="spin" style={{ margin: '0 auto 0.5rem' }} />
                    <div>Carregando mapeamentos...</div>
                  </div>
                ) : mappings.length === 0 ? (
                  <div style={{ padding: '2rem', textAlign: 'center', background: 'rgba(0,0,0,0.1)', borderRadius: '8px', border: '1px dashed var(--border-color)', color: 'var(--text-muted)' }}>
                    <p style={{ margin: '0 0 1rem', fontSize: '0.85rem' }}>
                      Nenhum campo mapeado nesta integração. Adicione uma linha ou carregue o preset para vincular campos do ERP.
                    </p>
                    {canManage && (
                      <button type="button" className="btn btn-secondary" onClick={handleAddMappingRow} style={{ fontSize: '0.8rem' }}>
                        <Plus size={14} />
                        <span>Mapear Primeiro Campo</span>
                      </button>
                    )}
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table className="admin-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'left', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          <th style={{ padding: '0.6rem 0.5rem' }}>Campo Externo (ERP)</th>
                          <th style={{ padding: '0.6rem 0.5rem' }}></th>
                          <th style={{ padding: '0.6rem 0.5rem' }}>Campo Canônico (Witiquetas)</th>
                          <th style={{ padding: '0.6rem 0.5rem', textAlign: 'center' }}>Direção</th>
                          <th style={{ padding: '0.6rem 0.5rem', textAlign: 'center' }}>Status</th>
                          {canManage && <th style={{ padding: '0.6rem 0.5rem', textAlign: 'right' }}>Ação</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {mappings.map((m, idx) => (
                          <tr key={m.id || idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: '0.85rem' }}>
                            {/* Campo Externo */}
                            <td style={{ padding: '0.6rem 0.5rem' }}>
                              <input
                                type="text"
                                className="form-input"
                                value={m.externalField}
                                onChange={(e) => handleMappingChange(idx, 'externalField', e.target.value)}
                                disabled={!canManage}
                                placeholder="ex: CODIGO, B1_COD"
                                style={{ width: '100%', padding: '0.35rem 0.5rem', fontSize: '0.85rem' }}
                              />
                            </td>

                            {/* Ícone De-Para */}
                            <td style={{ padding: '0.6rem 0.25rem', textAlign: 'center', color: 'var(--accent-blue)' }}>
                              <ArrowRight size={16} />
                            </td>

                            {/* Campo Canônico Dropdown */}
                            <td style={{ padding: '0.6rem 0.5rem' }}>
                              <select
                                className="form-input"
                                value={m.canonicalFieldId}
                                onChange={(e) => handleMappingChange(idx, 'canonicalFieldId', e.target.value)}
                                disabled={!canManage}
                                style={{ width: '100%', padding: '0.35rem 0.5rem', fontSize: '0.85rem' }}
                              >
                                {ALL_KNOWN_INTEGRATION_FIELDS.map((cf) => (
                                  <option key={cf.id} value={cf.id}>
                                    {cf.id} — {cf.label} ({cf.category})
                                  </option>
                                ))}
                              </select>
                            </td>

                            {/* Direção */}
                            <td style={{ padding: '0.6rem 0.5rem', textAlign: 'center' }}>
                              <span className="badge badge-secondary" style={{ fontSize: '0.7rem' }}>
                                {m.direction || 'READ'}
                              </span>
                            </td>

                            {/* Enabled Toggle */}
                            <td style={{ padding: '0.6rem 0.5rem', textAlign: 'center' }}>
                              <input
                                type="checkbox"
                                checked={m.enabled !== false}
                                onChange={(e) => handleMappingChange(idx, 'enabled', e.target.checked)}
                                disabled={!canManage}
                                style={{ cursor: canManage ? 'pointer' : 'default', width: '16px', height: '16px' }}
                              />
                            </td>

                            {/* Remover */}
                            {canManage && (
                              <td style={{ padding: '0.6rem 0.5rem', textAlign: 'right' }}>
                                <button
                                  type="button"
                                  className="btn-icon"
                                  onClick={() => handleRemoveMappingRow(idx)}
                                  title="Remover Mapeamento"
                                  style={{ color: 'var(--status-danger)', background: 'transparent', border: 'none', cursor: 'pointer', padding: '0.3rem' }}
                                >
                                  <Trash2 size={16} />
                                </button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal: Adicionar Nova Integração */}
      {isCreateModalOpen && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1.5rem' }}>
          <div className="modal-container" style={{ background: 'var(--bg-card)', borderRadius: '14px', border: '1px solid var(--border-color)', maxWidth: '580px', width: '100%', padding: '1.75rem', boxShadow: '0 20px 40px rgba(0,0,0,0.4)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <Plug size={20} color="var(--accent-blue)" />
                <h3 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--text-primary)' }}>
                  Conectar Nova Fonte de Dados
                </h3>
              </div>
              <button
                type="button"
                className="btn-icon"
                onClick={() => setIsCreateModalOpen(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateIntegration}>
              {/* Seletor de Modelo / Preset */}
              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
                  Selecione o Modelo de Integração
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {presets.map((p) => {
                    const IconComp = PROVIDER_ICONS[p.providerType] || Plug;
                    const isPicked = selectedPresetId === p.presetId;

                    return (
                      <div
                        key={p.presetId}
                        onClick={() => {
                          setSelectedPresetId(p.presetId);
                          setCreateName(p.name);
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.75rem',
                          padding: '0.75rem 1rem',
                          borderRadius: '8px',
                          border: `1px solid ${isPicked ? 'var(--accent-blue)' : 'var(--border-color)'}`,
                          background: isPicked ? 'rgba(59, 130, 246, 0.1)' : 'rgba(0,0,0,0.1)',
                          cursor: 'pointer',
                        }}
                      >
                        <IconComp size={18} color={isPicked ? 'var(--accent-blue)' : 'var(--text-muted)'} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                            {p.name}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            {p.description} • Tipo: <strong>{p.providerType}</strong>
                          </div>
                        </div>
                        {isPicked && <Check size={18} color="var(--accent-blue)" />}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Nome da Integração */}
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.35rem' }}>
                  Nome da Conexão
                </label>
                <input
                  type="text"
                  className="form-input"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder="ex: Startwo Varejo Central"
                  required
                  style={{ width: '100%', padding: '0.5rem', fontSize: '0.9rem' }}
                />
              </div>

              {/* Endpoint Base URL (Opcional) */}
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.35rem' }}>
                  URL Base / Host (Opcional)
                </label>
                <input
                  type="text"
                  className="form-input"
                  value={createBaseUrl}
                  onChange={(e) => setCreateBaseUrl(e.target.value)}
                  placeholder="ex: https://api.empresa.com.br ou 192.168.1.100"
                  style={{ width: '100%', padding: '0.5rem', fontSize: '0.9rem' }}
                />
              </div>

              {/* Referência de Credencial (Opcional) */}
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.35rem' }}>
                  Referência de Credencial / Vault (Opcional)
                </label>
                <input
                  type="text"
                  className="form-input"
                  value={createCredentialRef}
                  onChange={(e) => setCreateCredentialRef(e.target.value)}
                  placeholder="ex: vault://erp-production/token"
                  maxLength={128}
                  style={{ width: '100%', padding: '0.5rem', fontSize: '0.9rem' }}
                />
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block', marginTop: '0.25rem' }}>
                  Apenas identificador opaco. Nenhuma chave secreta ou senha é persistida no manifesto ou trafegada em texto bruto.
                </span>
              </div>

              {/* Botões do Modal */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setIsCreateModalOpen(false)}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={saving}
                >
                  {saving ? 'Criando...' : 'Salvar e Conectar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
