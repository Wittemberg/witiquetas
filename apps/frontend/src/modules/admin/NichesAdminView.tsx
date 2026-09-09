import React, { useState, useEffect } from 'react';
import {
  Layers,
  CheckCircle2,
  AlertCircle,
  Star,
  Eye,
  Save,
  Type,
  DollarSign,
  Calendar,
  Barcode,
  QrCode,
  Minus,
  Square,
  Image as ImageIcon,
  Shield,
  FileSpreadsheet,
  Check,
  RefreshCw,
  Info,
} from 'lucide-react';
import {
  AdminApi,
  NicheAdminItemDTO,
  ElementAdminItemDTO,
  FieldAdminItemDTO,
  RoleDTO,
} from '../../services/adminApi.js';
import { hasPermission } from '../../auth/session.js';

interface NichesAdminViewProps {
  onConfigChanged?: () => Promise<void>;
}

// Mapeamento visual canônico dos 8 elementos visuais da plataforma
const VISUAL_ELEMENT_META: Record<
  string,
  { label: string; description: string; icon: React.FC<{ size?: number; className?: string }> }
> = {
  text: {
    label: 'Texto',
    description: 'Rótulos, títulos, textos fixos e dados descritivos alfanuméricos',
    icon: Type,
  },
  price: {
    label: 'Preço',
    description: 'Valores monetários com formatação comercial, símbolo e centavos',
    icon: DollarSign,
  },
  date: {
    label: 'Data',
    description: 'Datas de fabricação, validade, embalagem ou pesagem formatadas',
    icon: Calendar,
  },
  barcode: {
    label: 'Código de Barras (1D)',
    description: 'Simbologias lineares de alta precisão como EAN-13, Code 128, ITF-14',
    icon: Barcode,
  },
  qrcode: {
    label: 'QR Code (2D)',
    description: 'Códigos bidimensionais, URLs dinâmicas e links rastreáveis',
    icon: QrCode,
  },
  line: {
    label: 'Linha Divisória',
    description: 'Traços horizontais e verticais para separação de blocos de informação',
    icon: Minus,
  },
  rectangle: {
    label: 'Retângulo / Moldura',
    description: 'Caixas de destaque, bordas e áreas de preenchimento visual',
    icon: Square,
  },
  image: {
    label: 'Imagem / Logotipo',
    description: 'Logotipos da marca, selos de certificação e ícones institucionais',
    icon: ImageIcon,
  },
};

export const NichesAdminView: React.FC<NichesAdminViewProps> = ({ onConfigChanged }) => {
  const [niches, setNiches] = useState<NicheAdminItemDTO[]>([]);
  const [selectedNicheId, setSelectedNicheId] = useState<string>('');
  const [activeSubTab, setActiveSubTab] = useState<'elements' | 'fields' | 'roles' | 'preview'>('elements');

  // Dados do nicho selecionado
  const [elements, setElements] = useState<ElementAdminItemDTO[]>([]);
  const [fields, setFields] = useState<FieldAdminItemDTO[]>([]);
  const [roles, setRoles] = useState<RoleDTO[]>([]);
  const [roleNicheAccessMap, setRoleNicheAccessMap] = useState<Record<string, boolean>>({});
  const [effectivePreview, setEffectivePreview] = useState<any>(null);

  // Estados de carregamento e feedback
  const [loading, setLoading] = useState<boolean>(true);
  const [loadingNicheDetails, setLoadingNicheDetails] = useState<boolean>(false);
  const [savingNiches, setSavingNiches] = useState<boolean>(false);
  const [savingElements, setSavingElements] = useState<boolean>(false);
  const [savingFields, setSavingFields] = useState<boolean>(false);
  const [savingRoles, setSavingRoles] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Permissões canônicas da tela
  const canManageNiches = hasPermission('niches.manage');
  const canManageElements = hasPermission('elements.manage');
  const canManageRoles = hasPermission('roles.manage');

  // Carregamento inicial da lista dos 11 nichos e perfis
  const loadInitialData = async () => {
    setLoading(true);
    setFeedback(null);
    try {
      const [nichesData, rolesData, previewData] = await Promise.all([
        AdminApi.fetchNiches(),
        AdminApi.listRoles().catch(() => [] as RoleDTO[]),
        AdminApi.fetchEffectivePreview().catch(() => null),
      ]);

      setNiches(nichesData);
      setRoles(rolesData);
      setEffectivePreview(previewData);

      // Define nicho selecionado inicial (default ou primeiro ativo)
      const defaultNiche = nichesData.find((n) => n.isDefault) || nichesData.find((n) => n.enabled) || nichesData[0];
      if (defaultNiche) {
        setSelectedNicheId(defaultNiche.id);
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Erro ao carregar configurações de nichos.',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInitialData();
  }, []);

  // Carregamento dos detalhes do nicho selecionado
  const loadNicheDetails = async (nicheId: string) => {
    if (!nicheId) return;
    setLoadingNicheDetails(true);
    try {
      const [elementsData, fieldsData] = await Promise.all([
        AdminApi.fetchNicheElements(nicheId),
        AdminApi.fetchNicheFields(nicheId),
      ]);
      setElements(elementsData);
      setFields(fieldsData);

      // Carregar acesso por perfil se existirem papéis
      if (roles.length > 0) {
        const accessMap: Record<string, boolean> = {};
        await Promise.all(
          roles.map(async (r) => {
            try {
              const res = await AdminApi.fetchRoleNiches(r.id);
              accessMap[r.id] = Boolean(res.nicheAccess?.[nicheId]);
            } catch {
              accessMap[r.id] = true;
            }
          })
        );
        setRoleNicheAccessMap(accessMap);
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || `Erro ao carregar detalhes do nicho selecionado.`,
      });
    } finally {
      setLoadingNicheDetails(false);
    }
  };

  useEffect(() => {
    if (selectedNicheId) {
      loadNicheDetails(selectedNicheId);
    }
  }, [selectedNicheId]);

  // Handler: Alternar ativação de um nicho
  const handleToggleNicheEnabled = (nicheId: string) => {
    if (!canManageNiches) return;
    setNiches((prev) => {
      const target = prev.find((n) => n.id === nicheId);
      if (!target) return prev;

      // Proteção: não desativar o nicho padrão
      if (target.isDefault && target.enabled) {
        setFeedback({
          type: 'error',
          message: 'O nicho padrão da organização não pode ser desativado. Defina outro nicho como padrão antes.',
        });
        return prev;
      }

      // Proteção: manter pelo menos 1 nicho ativo
      const willHaveEnabled = prev.some((n) => (n.id === nicheId ? !n.enabled : n.enabled));
      if (!willHaveEnabled) {
        setFeedback({
          type: 'error',
          message: 'A organização deve manter pelo menos 1 nicho operacional habilitado.',
        });
        return prev;
      }

      setFeedback(null);
      return prev.map((n) => (n.id === nicheId ? { ...n, enabled: !n.enabled } : n));
    });
  };

  // Handler: Definir Nicho Padrão
  const handleSetDefaultNiche = (nicheId: string) => {
    if (!canManageNiches) return;
    setNiches((prev) =>
      prev.map((n) => ({
        ...n,
        isDefault: n.id === nicheId,
        enabled: n.id === nicheId ? true : n.enabled, // garante que o padrão seja ativo
      }))
    );
    setSelectedNicheId(nicheId);
  };

  // Salvar Nichos Habilitados e Nicho Padrão
  const handleSaveNiches = async () => {
    if (!canManageNiches) return;
    setSavingNiches(true);
    setFeedback(null);
    try {
      const defaultNiche = niches.find((n) => n.isDefault);
      const payload = niches.map((n) => ({ nicheId: n.id, enabled: n.enabled }));

      await AdminApi.updateNiches(payload, defaultNiche?.id);

      setFeedback({
        type: 'success',
        message: 'Nichos operacionais e nicho padrão atualizados com sucesso.',
      });

      // Atualiza preview efetivo e notifica sessão
      const updatedPreview = await AdminApi.fetchEffectivePreview();
      setEffectivePreview(updatedPreview);
      if (onConfigChanged) await onConfigChanged();
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Erro ao salvar configuração de nichos.',
      });
    } finally {
      setSavingNiches(false);
    }
  };

  // Handler: Alternar elemento visual
  const handleToggleElement = (elementType: string) => {
    if (!canManageElements) return;
    setElements((prev) =>
      prev.map((el) => (el.elementType === elementType ? { ...el, enabled: !el.enabled } : el))
    );
  };

  // Salvar Elementos Visuais do Nicho
  const handleSaveElements = async () => {
    if (!canManageElements || !selectedNicheId) return;
    setSavingElements(true);
    setFeedback(null);
    try {
      await AdminApi.updateNicheElements(selectedNicheId, elements);

      setFeedback({
        type: 'success',
        message: 'Elementos visuais configurados com sucesso para o nicho selecionado.',
      });

      const updatedPreview = await AdminApi.fetchEffectivePreview();
      setEffectivePreview(updatedPreview);
      if (onConfigChanged) await onConfigChanged();
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Erro ao salvar elementos do nicho.',
      });
    } finally {
      setSavingElements(false);
    }
  };

  // Handler: Atualizar flags de um campo de dados
  const handleFieldChange = (
    fieldId: string,
    key: 'enabled' | 'availableForManual' | 'availableForIntegration',
    val: boolean
  ) => {
    if (!canManageNiches) return;
    setFields((prev) =>
      prev.map((f) => {
        if (f.fieldId !== fieldId) return f;
        if (f.isSystem && (key === 'availableForManual' || key === 'availableForIntegration')) {
          return f; // campos de sistema não alteram fonte manual/integração
        }
        return { ...f, [key]: val };
      })
    );
  };

  // Salvar Campos do Nicho
  const handleSaveFields = async () => {
    if (!canManageNiches || !selectedNicheId) return;
    setSavingFields(true);
    setFeedback(null);
    try {
      await AdminApi.updateNicheFields(
        selectedNicheId,
        fields.map((f) => ({
          fieldId: f.fieldId,
          enabled: f.enabled,
          availableForManual: f.availableForManual,
          availableForIntegration: f.availableForIntegration,
        }))
      );

      setFeedback({
        type: 'success',
        message: 'Campos canônicos de dados salvos com sucesso para o nicho selecionado.',
      });

      const updatedPreview = await AdminApi.fetchEffectivePreview();
      setEffectivePreview(updatedPreview);
      if (onConfigChanged) await onConfigChanged();
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Erro ao salvar campos de dados.',
      });
    } finally {
      setSavingFields(false);
    }
  };

  // Salvar Restrição de Nichos por Perfil
  const handleSaveRoleNiches = async () => {
    if (!canManageRoles || !selectedNicheId) return;
    setSavingRoles(true);
    setFeedback(null);
    try {
      await Promise.all(
        roles.map(async (r) => {
          const isAllowed = roleNicheAccessMap[r.id] ?? true;
          // busca config atual do papel
          const current = await AdminApi.fetchRoleNiches(r.id).catch(() => ({ nicheAccess: {} }));
          const updatedAccess = {
            ...current.nicheAccess,
            [selectedNicheId]: isAllowed,
          };
          await AdminApi.updateRoleNiches(r.id, updatedAccess);
        })
      );

      setFeedback({
        type: 'success',
        message: 'Permissões de acesso por perfil atualizadas com sucesso.',
      });

      if (onConfigChanged) await onConfigChanged();
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Erro ao salvar permissões de acesso por perfil.',
      });
    } finally {
      setSavingRoles(false);
    }
  };

  const selectedNiche = niches.find((n) => n.id === selectedNicheId);

  if (loading) {
    return (
      <div className="admin-loading-container">
        <RefreshCw size={24} className="spin" />
        <p>Carregando configurações de nichos e elementos...</p>
      </div>
    );
  }

  return (
    <div className="admin-niches-view">
      {feedback && (
        <div className={`admin-feedback-banner ${feedback.type}`}>
          {feedback.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* PAINEL SUPERIOR: OS 11 NICHOS CANÔNICOS */}
      <div className="admin-card">
        <div className="admin-card-header">
          <div>
            <h3 className="admin-card-title">Nichos de Operação</h3>
            <p className="admin-card-subtitle">
              Ative os segmentos em que sua empresa opera e defina o nicho padrão utilizado na criação de novas etiquetas.
            </p>
          </div>
          {canManageNiches && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleSaveNiches}
              disabled={savingNiches}
            >
              <Save size={16} />
              <span>{savingNiches ? 'Salvando...' : 'Salvar Nichos'}</span>
            </button>
          )}
        </div>

        <div className="admin-niches-grid">
          {niches.map((niche) => {
            const isSelected = niche.id === selectedNicheId;
            return (
              <div
                key={niche.id}
                className={`admin-niche-card ${niche.enabled ? 'enabled' : 'disabled'} ${
                  isSelected ? 'selected' : ''
                }`}
                onClick={() => setSelectedNicheId(niche.id)}
              >
                <div className="admin-niche-card-top">
                  <div className="admin-niche-card-title-group">
                    <span className="admin-niche-card-title">{niche.name}</span>
                    {niche.isDefault && (
                      <span className="admin-badge badge-gold" title="Nicho Padrão da Empresa">
                        <Star size={12} fill="currentColor" />
                        <span>Padrão</span>
                      </span>
                    )}
                  </div>
                  <label
                    className="admin-switch"
                    title={niche.enabled ? 'Nicho Habilitado' : 'Nicho Desabilitado'}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={niche.enabled}
                      disabled={!canManageNiches || (niche.isDefault && niche.enabled)}
                      onChange={() => handleToggleNicheEnabled(niche.id)}
                    />
                    <span className="admin-slider" />
                  </label>
                </div>

                <p className="admin-niche-card-desc">{niche.description}</p>

                <div className="admin-niche-card-footer" onClick={(e) => e.stopPropagation()}>
                  {!niche.isDefault && niche.enabled && canManageNiches && (
                    <button
                      type="button"
                      className="admin-niche-default-btn"
                      onClick={() => handleSetDefaultNiche(niche.id)}
                      title="Definir como nicho padrão da organização"
                    >
                      <Star size={12} className="admin-niche-default-btn-icon" />
                      <span>Tornar Padrão</span>
                    </button>
                  )}
                  {!niche.enabled && (
                    <span className="text-muted text-xs">Inativo na organização</span>
                  )}
                  {niche.isDefault && (
                    <span className="text-success text-xs font-semibold">Nicho padrão ativo</span>
                  )}
                  {isSelected && <span className="admin-selected-tag">Configurando</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* PAINEL INFERIOR: CONFIGURAÇÃO DETALHADA DO NICHO SELECIONADO */}
      {selectedNiche && (
        <div className="admin-card admin-niche-detail-panel">
          <div className="admin-card-header">
            <div>
              <div className="admin-niche-detail-heading">
                <Layers size={20} className="admin-icon-accent" />
                <h3 className="admin-card-title">Configurações de {selectedNiche.name}</h3>
                {selectedNiche.isDefault && (
                  <span className="admin-badge badge-gold">
                    <Star size={12} fill="currentColor" />
                    <span>Nicho Padrão</span>
                  </span>
                )}
                {!selectedNiche.enabled && (
                  <span className="admin-badge badge-muted">Desabilitado</span>
                )}
              </div>
              <p className="admin-card-subtitle">{selectedNiche.tagline || selectedNiche.description}</p>
            </div>
          </div>

          {/* SUB-TABS DO NICHO */}
          <div className="admin-subtabs-nav">
            <button
              type="button"
              className={`admin-subtab-btn ${activeSubTab === 'elements' ? 'active' : ''}`}
              onClick={() => setActiveSubTab('elements')}
            >
              <Layers size={15} />
              <span>Elementos Visuais ({elements.filter((e) => e.enabled).length}/8)</span>
            </button>
            <button
              type="button"
              className={`admin-subtab-btn ${activeSubTab === 'fields' ? 'active' : ''}`}
              onClick={() => setActiveSubTab('fields')}
            >
              <FileSpreadsheet size={15} />
              <span>Campos de Dados ({fields.filter((f) => f.enabled).length})</span>
            </button>
            <button
              type="button"
              className={`admin-subtab-btn ${activeSubTab === 'roles' ? 'active' : ''}`}
              onClick={() => setActiveSubTab('roles')}
            >
              <Shield size={15} />
              <span>Perfis com Acesso</span>
            </button>
            <button
              type="button"
              className={`admin-subtab-btn ${activeSubTab === 'preview' ? 'active' : ''}`}
              onClick={() => setActiveSubTab('preview')}
            >
              <Eye size={15} />
              <span>Preview Efetivo</span>
            </button>
          </div>

          {loadingNicheDetails ? (
            <div className="admin-loading-container">
              <RefreshCw size={20} className="spin" />
              <p>Carregando componentes do nicho...</p>
            </div>
          ) : (
            <div className="admin-subtab-content">
              {/* SUB-TAB 1: ELEMENTOS VISUAIS */}
              {activeSubTab === 'elements' && (
                <div className="admin-elements-section">
                  <div className="admin-section-actions-bar">
                    <p className="admin-hint-text">
                      Habilite ou desabilite os blocos visuais disponíveis para designers e operadores neste segmento.
                    </p>
                    {canManageElements && (
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={handleSaveElements}
                        disabled={savingElements}
                      >
                        <Save size={14} />
                        <span>{savingElements ? 'Salvando...' : 'Salvar Elementos'}</span>
                      </button>
                    )}
                  </div>

                  <div className="admin-elements-grid">
                    {elements.map((el) => {
                      const meta = VISUAL_ELEMENT_META[el.elementType] || {
                        label: el.name || el.elementType,
                        description: 'Elemento visual da etiqueta',
                        icon: Square,
                      };
                      const IconComp = meta.icon;

                      return (
                        <div
                          key={el.elementType}
                          className={`admin-element-card ${el.enabled ? 'active' : 'inactive'}`}
                          onClick={() => handleToggleElement(el.elementType)}
                        >
                          <div className="admin-element-card-left">
                            <div className="admin-element-icon-box">
                              <IconComp size={20} />
                            </div>
                            <div className="admin-element-info">
                              <h4 className="admin-element-title">{meta.label}</h4>
                              <p className="admin-element-desc">{meta.description}</p>
                            </div>
                          </div>
                          <div className="admin-element-card-right" onClick={(e) => e.stopPropagation()}>
                            <label className="admin-switch">
                              <input
                                type="checkbox"
                                checked={el.enabled}
                                disabled={!canManageElements}
                                onChange={() => handleToggleElement(el.elementType)}
                              />
                              <span className="admin-slider" />
                            </label>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* SUB-TAB 2: CAMPOS CANÔNICOS DE DADOS */}
              {activeSubTab === 'fields' && (
                <div className="admin-fields-section">
                  <div className="admin-section-actions-bar">
                    <p className="admin-hint-text">
                      Configure a governança de dados para este nicho. Defina quais atributos estão ativos e suas fontes permitidas (digitação manual pelo operador ou importação via conector ERP).
                    </p>
                    {canManageNiches && (
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={handleSaveFields}
                        disabled={savingFields}
                      >
                        <Save size={14} />
                        <span>{savingFields ? 'Salvando...' : 'Salvar Campos'}</span>
                      </button>
                    )}
                  </div>

                  <div className="admin-table-container">
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>Campo de Dados</th>
                          <th>Tipo</th>
                          <th style={{ textAlign: 'center', width: '110px' }}>Habilitado</th>
                          <th style={{ textAlign: 'center', width: '150px' }}>Entrada Manual</th>
                          <th style={{ textAlign: 'center', width: '150px' }}>Via Integração ERP</th>
                        </tr>
                      </thead>
                      <tbody>
                        {fields.map((f) => (
                          <tr key={f.fieldId}>
                            <td>
                              <div className="admin-field-name-cell">
                                <span className="admin-field-name">{f.name}</span>
                                {f.isSystem && (
                                  <span className="admin-badge badge-blue" title="Preenchido automaticamente pelo sistema no momento da impressão">
                                    Sistema
                                  </span>
                                )}
                              </div>
                              <span className="admin-field-desc">{f.description}</span>
                            </td>
                            <td>
                              <span className="admin-field-type-badge">{f.type}</span>
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <label className="admin-switch">
                                <input
                                  type="checkbox"
                                  checked={f.enabled}
                                  disabled={!canManageNiches}
                                  onChange={(e) => handleFieldChange(f.fieldId, 'enabled', e.target.checked)}
                                />
                                <span className="admin-slider" />
                              </label>
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              {f.isSystem ? (
                                <span className="admin-system-field-hint" title="Campos de sistema são preenchidos automaticamente na emissão">
                                  Automático
                                </span>
                              ) : (
                                <label className="admin-switch">
                                  <input
                                    type="checkbox"
                                    checked={f.availableForManual}
                                    disabled={!canManageNiches || !f.enabled}
                                    onChange={(e) =>
                                      handleFieldChange(f.fieldId, 'availableForManual', e.target.checked)
                                    }
                                  />
                                  <span className="admin-slider" />
                                </label>
                              )}
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              {f.isSystem ? (
                                <span className="admin-system-field-hint" title="Campos de sistema são preenchidos automaticamente na emissão">
                                  Automático
                                </span>
                              ) : (
                                <label className="admin-switch">
                                  <input
                                    type="checkbox"
                                    checked={f.availableForIntegration}
                                    disabled={!canManageNiches || !f.enabled}
                                    onChange={(e) =>
                                      handleFieldChange(f.fieldId, 'availableForIntegration', e.target.checked)
                                    }
                                  />
                                  <span className="admin-slider" />
                                </label>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* SUB-TAB 3: PERFIS COM ACESSO AO NICHO */}
              {activeSubTab === 'roles' && (
                <div className="admin-roles-niche-section">
                  <div className="admin-section-actions-bar">
                    <p className="admin-hint-text">
                      Controle quais perfis de usuário têm permissão para criar, editar ou emitir etiquetas no nicho {selectedNiche.name}.
                    </p>
                    {canManageRoles && (
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={handleSaveRoleNiches}
                        disabled={savingRoles}
                      >
                        <Save size={14} />
                        <span>{savingRoles ? 'Salvando...' : 'Salvar Acesso dos Perfis'}</span>
                      </button>
                    )}
                  </div>

                  <div className="admin-table-container">
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>Perfil</th>
                          <th>Código</th>
                          <th>Descrição</th>
                          <th style={{ textAlign: 'center', width: '150px' }}>Acesso Permitido</th>
                        </tr>
                      </thead>
                      <tbody>
                        {roles.map((r) => {
                          const isAllowed = roleNicheAccessMap[r.id] ?? true;
                          return (
                            <tr key={r.id}>
                              <td>
                                <div className="admin-role-name-cell">
                                  <Shield size={16} className="admin-icon-muted" />
                                  <span className="admin-user-name">{r.name}</span>
                                </div>
                              </td>
                              <td>
                                <span className="admin-role-code-badge">{r.code}</span>
                              </td>
                              <td>
                                <span className="admin-field-desc">{r.description || '—'}</span>
                              </td>
                              <td style={{ textAlign: 'center' }}>
                                <label className="admin-switch">
                                  <input
                                    type="checkbox"
                                    checked={isAllowed}
                                    disabled={!canManageRoles}
                                    onChange={(e) =>
                                      setRoleNicheAccessMap((prev) => ({
                                        ...prev,
                                        [r.id]: e.target.checked,
                                      }))
                                    }
                                  />
                                  <span className="admin-slider" />
                                </label>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* SUB-TAB 4: PREVIEW EFETIVO RESOLVIDO */}
              {activeSubTab === 'preview' && (
                <div className="admin-preview-section">
                  <div className="admin-notice-box">
                    <Info size={18} />
                    <div>
                      <strong>Configuração Efetiva em Tempo Real</strong>
                      <p>
                        Este painel reflete o resultado consolidado do resolvedor dinâmico da plataforma para a organização ativa, alimentando imediatamente as sessões de usuários.
                      </p>
                    </div>
                  </div>

                  <div className="admin-preview-grid">
                    <div className="admin-preview-metric-card">
                      <span className="admin-preview-metric-label">Nichos Ativos</span>
                      <span className="admin-preview-metric-value">
                        {effectivePreview?.enabledNiches?.length ?? niches.filter((n) => n.enabled).length} de 11
                      </span>
                      <span className="admin-preview-metric-sub">
                        Padrão: {niches.find((n) => n.isDefault)?.name || 'Não definido'}
                      </span>
                    </div>

                    <div className="admin-preview-metric-card">
                      <span className="admin-preview-metric-label">Elementos Ativos no Nicho</span>
                      <span className="admin-preview-metric-value">
                        {elements.filter((e) => e.enabled).length} de 8
                      </span>
                      <span className="admin-preview-metric-sub">
                        {elements.filter((e) => e.enabled).map((e) => VISUAL_ELEMENT_META[e.elementType]?.label || e.elementType).join(', ')}
                      </span>
                    </div>

                    <div className="admin-preview-metric-card">
                      <span className="admin-preview-metric-label">Campos Canônicos Habilitados</span>
                      <span className="admin-preview-metric-value">
                        {fields.filter((f) => f.enabled).length} campos
                      </span>
                      <span className="admin-preview-metric-sub">
                        {fields.filter((f) => f.enabled && f.availableForManual).length} manuais ·{' '}
                        {fields.filter((f) => f.enabled && f.availableForIntegration).length} ERP
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
