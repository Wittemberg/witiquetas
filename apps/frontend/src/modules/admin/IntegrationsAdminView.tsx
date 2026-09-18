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
  Pencil,
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

  // Modal de edição (Pacote 5.6.1)
  const [isEditModalOpen, setIsEditModalOpen] = useState<boolean>(false);
  const [editName, setEditName] = useState<string>('');
  const [editBaseUrl, setEditBaseUrl] = useState<string>('');
  const [editCredentialRef, setEditCredentialRef] = useState<string>('');
  const [editEnvironment, setEditEnvironment] = useState<'PRODUCTION' | 'STAGING' | 'SANDBOX'>('PRODUCTION');

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

  // Abrir modal de edição preenchido com a integração selecionada (Pacote 5.6.1)
  const handleOpenEditModal = () => {
    if (!selectedIntegration || !canManage) return;
    setEditName(selectedIntegration.name);
    setEditBaseUrl(selectedIntegration.baseUrl || '');
    setEditCredentialRef(selectedIntegration.credentialRef || '');
    setEditEnvironment((selectedIntegration.environment as any) || 'PRODUCTION');
    setIsEditModalOpen(true);
  };

  // Salvar alterações da integração existente (Pacote 5.6.1)
  const handleSaveEditIntegration = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedIntegration || !canManage) return;

    if (!editName.trim()) {
      setFeedback({ type: 'error', message: 'O nome da conexão não pode estar em branco.' });
      return;
    }

    setSaving(true);
    setFeedback(null);
    try {
      const updated = await AdminApi.updateIntegration(selectedIntegration.id, {
        name: editName.trim(),
        baseUrl: editBaseUrl.trim() || undefined,
        credentialRef: editCredentialRef.trim() || undefined,
        environment: editEnvironment,
      });

      setIntegrations((prev) => prev.map((i) => (i.id === updated.id ? { ...i, ...updated } : i)));
      setIsEditModalOpen(false);
      setFeedback({
        type: 'success',
        message: `Integração "${updated.name}" atualizada com sucesso!`,
      });
      if (onConfigChanged) await onConfigChanged();
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Erro ao atualizar integração.',
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
            Nenhuma integração cadastrada
          </h4>
          <p style={{ maxWidth: '520px', margin: '0 auto 1.5rem', color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: '1.5' }}>
            Empresas recém-criadas iniciam sem integrações ativas por padrão. Adicione sua primeira fonte de dados para que os campos dinâmicos de etiquetas fiquem disponíveis na impressão.
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
              <span>Adicionar Primeira Fonte de Dados</span>
            </button>
          )}
        </div>
      ) : (
        /* Layout Master-Detail */
        <div
          className="admin-master-detail-container"
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(260px, 300px) minmax(0, 1fr)',
            gap: '1.5rem',
            marginTop: '1.5rem',
            alignItems: 'start',
          }}
        >
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
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
                        <IconComponent size={16} color={isSelected ? 'var(--accent-blue)' : 'var(--text-muted)'} />
                        <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {item.name}
                        </span>
                      </div>
                      <span
                        className={`badge ${item.status === 'ACTIVE' ? 'badge-success' : 'badge-secondary'}`}
                        style={{ fontSize: '0.65rem', padding: '0.15rem 0.4rem', flexShrink: 0 }}
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
            <div className="admin-integration-detail-column" style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '12px', border: '1px solid var(--border-color)', padding: '1.5rem', minWidth: 0 }}>
              {/* Header do Detalhe */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  borderBottom: '1px solid var(--border-color)',
                  paddingBottom: '1.25rem',
                  marginBottom: '1.5rem',
                  flexWrap: 'wrap',
                  gap: '1rem',
                }}
              >
                <div style={{ minWidth: '240px', flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.35rem', flexWrap: 'wrap' }}>
                    <h3 style={{ margin: 0, fontSize: '1.3rem', color: 'var(--text-primary)', wordBreak: 'break-word' }}>
                      {selectedIntegration.name}
                    </h3>
                    <span className="badge badge-info" style={{ fontSize: '0.75rem' }}>
                      {selectedIntegration.providerType}
                    </span>
                    <span className="badge badge-secondary" style={{ fontSize: '0.75rem' }}>
                      {selectedIntegration.environment}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: '1.5', wordBreak: 'break-all' }}>
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={handleOpenEditModal}
                      disabled={saving}
                      style={{ fontSize: '0.825rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                      title="Editar Propriedades da Integração"
                    >
                      <Pencil size={14} />
                      <span>Editar Integração</span>
                    </button>
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

      {/* Modal: Adicionar Nova Integração (Landscape / Wide — Pacote 5.6.1) */}
      {isCreateModalOpen && (
        <div
          className="modal-overlay"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1.5rem',
          }}
        >
          <div
            className="modal-container modal-landscape"
            style={{
              background: 'var(--bg-card)',
              borderRadius: '14px',
              border: '1px solid var(--border-color)',
              maxWidth: '920px',
              width: '100%',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
              overflow: 'hidden',
            }}
          >
            {/* Header Pinned */}
            <div
              style={{
                padding: '1.25rem 1.75rem',
                borderBottom: '1px solid var(--border-color)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'rgba(255, 255, 255, 0.02)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <Plug size={22} color="var(--accent-blue)" />
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--text-primary)', fontWeight: 700 }}>
                    Adicionar Fonte de Dados
                  </h3>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    Cadastre uma nova integração declarativa e configure suas propriedades de acesso.
                  </div>
                </div>
              </div>
              <button
                type="button"
                className="btn-icon"
                onClick={() => setIsCreateModalOpen(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0.4rem' }}
                title="Fechar modal"
              >
                <X size={20} />
              </button>
            </div>

            {/* Form Scrollable */}
            <form onSubmit={handleCreateIntegration} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
              <div style={{ padding: '1.5rem 1.75rem', overflowY: 'auto', flex: 1 }}>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
                    gap: '1.75rem',
                    alignItems: 'start',
                  }}
                >
                  {/* COLUNA ESQUERDA: Seleção de Modelo / Provider */}
                  <div>
                    <div style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '0.65rem', fontWeight: 700 }}>
                      1. Modelo de Integração
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
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
                              padding: '0.85rem 1rem',
                              borderRadius: '8px',
                              border: `1px solid ${isPicked ? 'var(--accent-blue)' : 'var(--border-color)'}`,
                              background: isPicked ? 'rgba(59, 130, 246, 0.12)' : 'rgba(0, 0, 0, 0.15)',
                              cursor: 'pointer',
                              transition: 'all 0.15s ease',
                            }}
                          >
                            <IconComp size={20} color={isPicked ? 'var(--accent-blue)' : 'var(--text-muted)'} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                                {p.name}
                              </div>
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {p.description} • Tipo: <strong>{p.providerType}</strong>
                              </div>
                            </div>
                            {isPicked && <Check size={18} color="var(--accent-blue)" />}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* COLUNA DIREITA: Propriedades da Conexão */}
                  <div>
                    <div style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '0.65rem', fontWeight: 700 }}>
                      2. Parâmetros da Conexão
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      {/* Nome da Conexão */}
                      <div>
                        <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.35rem' }}>
                          Nome da Conexão *
                        </label>
                        <input
                          type="text"
                          className="form-input"
                          value={createName}
                          onChange={(e) => setCreateName(e.target.value)}
                          placeholder="ex: Startwo Varejo Central"
                          required
                          style={{ width: '100%', padding: '0.55rem 0.75rem', fontSize: '0.875rem' }}
                        />
                      </div>

                      {/* Endpoint Base URL (Opcional) */}
                      <div>
                        <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.35rem' }}>
                          URL Base / Host (Opcional)
                        </label>
                        <input
                          type="text"
                          className="form-input"
                          value={createBaseUrl}
                          onChange={(e) => setCreateBaseUrl(e.target.value)}
                          placeholder="ex: https://api.empresa.com.br ou 192.168.1.100"
                          style={{ width: '100%', padding: '0.55rem 0.75rem', fontSize: '0.875rem' }}
                        />
                      </div>

                      {/* Referência de Credencial (Opcional) */}
                      <div>
                        <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.35rem' }}>
                          Referência de Credencial / Vault (Opcional)
                        </label>
                        <input
                          type="text"
                          className="form-input"
                          value={createCredentialRef}
                          onChange={(e) => setCreateCredentialRef(e.target.value)}
                          placeholder="ex: vault://erp-production/token"
                          maxLength={128}
                          style={{ width: '100%', padding: '0.55rem 0.75rem', fontSize: '0.875rem' }}
                        />
                      </div>

                      {/* Box de Segurança */}
                      <div
                        style={{
                          background: 'rgba(59, 130, 246, 0.08)',
                          border: '1px solid rgba(59, 130, 246, 0.25)',
                          borderRadius: '8px',
                          padding: '0.75rem 0.85rem',
                          display: 'flex',
                          gap: '0.65rem',
                          alignItems: 'flex-start',
                        }}
                      >
                        <Lock size={16} color="var(--accent-blue)" style={{ marginTop: '2px', flexShrink: 0 }} />
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                          Armazenamento Seguro: Apenas referências opacas de credenciais são registradas. Nenhuma senha, token ou chave secreta em texto puro é manipulada ou persistida.
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer Pinned */}
              <div
                style={{
                  padding: '1rem 1.75rem',
                  borderTop: '1px solid var(--border-color)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                  gap: '0.75rem',
                  background: 'rgba(255, 255, 255, 0.02)',
                }}
              >
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
                  {saving ? 'Salvando...' : 'Salvar Integração'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Editar Integração Existente (Landscape / Wide — Pacote 5.6.1) */}
      {isEditModalOpen && selectedIntegration && (
        <div
          className="modal-overlay"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1.5rem',
          }}
        >
          <div
            className="modal-container modal-landscape"
            style={{
              background: 'var(--bg-card)',
              borderRadius: '14px',
              border: '1px solid var(--border-color)',
              maxWidth: '920px',
              width: '100%',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
              overflow: 'hidden',
            }}
          >
            {/* Header Pinned */}
            <div
              style={{
                padding: '1.25rem 1.75rem',
                borderBottom: '1px solid var(--border-color)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'rgba(255, 255, 255, 0.02)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <Pencil size={20} color="var(--accent-blue)" />
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--text-primary)', fontWeight: 700 }}>
                    Editar Fonte de Dados
                  </h3>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    Atualize os parâmetros declarativos da integração selecionada.
                  </div>
                </div>
              </div>
              <button
                type="button"
                className="btn-icon"
                onClick={() => setIsEditModalOpen(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0.4rem' }}
                title="Fechar modal"
              >
                <X size={20} />
              </button>
            </div>

            {/* Form Scrollable */}
            <form onSubmit={handleSaveEditIntegration} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
              <div style={{ padding: '1.5rem 1.75rem', overflowY: 'auto', flex: 1 }}>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
                    gap: '1.75rem',
                    alignItems: 'start',
                  }}
                >
                  {/* COLUNA ESQUERDA: Provedor e Manifesto (Imutáveis) */}
                  <div>
                    <div style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '0.65rem', fontWeight: 700 }}>
                      Estrutura do Provedor (Imutável)
                    </div>

                    <div
                      style={{
                        padding: '1rem',
                        borderRadius: '10px',
                        background: 'rgba(0, 0, 0, 0.2)',
                        border: '1px solid var(--border-color)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.85rem',
                      }}
                    >
                      <div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.2rem' }}>
                          Tipo de Provedor & ID
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span className="badge badge-info" style={{ fontSize: '0.75rem' }}>
                            {selectedIntegration.providerType}
                          </span>
                          <code style={{ fontSize: '0.85rem', color: 'var(--accent-cyan)' }}>
                            {selectedIntegration.providerId}
                          </code>
                        </div>
                      </div>

                      <div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
                          Capabilities do Manifesto
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                          {selectedIntegration.manifest.capabilities?.map((cap) => (
                            <span
                              key={cap}
                              style={{
                                fontSize: '0.7rem',
                                padding: '0.2rem 0.5rem',
                                borderRadius: '4px',
                                background: 'rgba(16, 185, 129, 0.1)',
                                border: '1px solid rgba(16, 185, 129, 0.3)',
                                color: 'var(--status-success)',
                              }}
                            >
                              {cap}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div
                        style={{
                          fontSize: '0.72rem',
                          color: 'var(--text-muted)',
                          lineHeight: '1.4',
                          borderTop: '1px solid rgba(255, 255, 255, 0.05)',
                          paddingTop: '0.5rem',
                        }}
                      >
                        O modelo do provedor e as capacidades declaradas definem a estrutura canônica da integração e não podem ser alterados após o provisionamento.
                      </div>
                    </div>
                  </div>

                  {/* COLUNA DIREITA: Parâmetros Editáveis */}
                  <div>
                    <div style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '0.65rem', fontWeight: 700 }}>
                      Parâmetros da Conexão
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      {/* Nome da Conexão */}
                      <div>
                        <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.35rem' }}>
                          Nome da Conexão *
                        </label>
                        <input
                          type="text"
                          className="form-input"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          placeholder="ex: Startwo Varejo Central"
                          required
                          style={{ width: '100%', padding: '0.55rem 0.75rem', fontSize: '0.875rem' }}
                        />
                      </div>

                      {/* URL Base / Host */}
                      <div>
                        <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.35rem' }}>
                          URL Base / Host (Opcional)
                        </label>
                        <input
                          type="text"
                          className="form-input"
                          value={editBaseUrl}
                          onChange={(e) => setEditBaseUrl(e.target.value)}
                          placeholder="ex: https://api.empresa.com.br ou 192.168.1.100"
                          style={{ width: '100%', padding: '0.55rem 0.75rem', fontSize: '0.875rem' }}
                        />
                      </div>

                      {/* Referência de Credencial */}
                      <div>
                        <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.35rem' }}>
                          Referência de Credencial / Vault (Opcional)
                        </label>
                        <input
                          type="text"
                          className="form-input"
                          value={editCredentialRef}
                          onChange={(e) => setEditCredentialRef(e.target.value)}
                          placeholder="ex: vault://erp-production/token"
                          maxLength={128}
                          style={{ width: '100%', padding: '0.55rem 0.75rem', fontSize: '0.875rem' }}
                        />
                      </div>

                      {/* Ambiente */}
                      <div>
                        <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.35rem' }}>
                          Ambiente de Execução
                        </label>
                        <select
                          className="form-input"
                          value={editEnvironment}
                          onChange={(e) => setEditEnvironment(e.target.value as any)}
                          style={{ width: '100%', padding: '0.55rem 0.75rem', fontSize: '0.875rem' }}
                        >
                          <option value="PRODUCTION">Produção (PRODUCTION)</option>
                          <option value="STAGING">Homologação (STAGING)</option>
                          <option value="SANDBOX">Sandbox / Testes (SANDBOX)</option>
                        </select>
                      </div>

                      {/* Box de Segurança */}
                      <div
                        style={{
                          background: 'rgba(59, 130, 246, 0.08)',
                          border: '1px solid rgba(59, 130, 246, 0.25)',
                          borderRadius: '8px',
                          padding: '0.75rem 0.85rem',
                          display: 'flex',
                          gap: '0.65rem',
                          alignItems: 'flex-start',
                        }}
                      >
                        <Lock size={16} color="var(--accent-blue)" style={{ marginTop: '2px', flexShrink: 0 }} />
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                          Armazenamento Seguro: Nenhuma credencial em texto puro é manipulada ou persistida nesta tela.
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer Pinned */}
              <div
                style={{
                  padding: '1rem 1.75rem',
                  borderTop: '1px solid var(--border-color)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                  gap: '0.75rem',
                  background: 'rgba(255, 255, 255, 0.02)',
                }}
              >
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setIsEditModalOpen(false)}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={saving}
                >
                  {saving ? 'Salvando...' : 'Salvar Integração'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
