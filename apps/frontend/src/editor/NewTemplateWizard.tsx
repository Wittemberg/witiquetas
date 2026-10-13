import React, { useState, useMemo } from 'react';
import {
  NICHES,
  NicheDefinition,
  NicheSizeItem,
  getSizesByNiche,
  calculateOrientation,
  formatDimensionLabel,
  INDUSTRIAL_LABEL_PRESETS,
  createCustomLabelSize,
} from '@witiquetas/label-schema';
import { isNicheAllowed, hasPermission } from '../auth/session.js';
import { useEditorStore, formatDimensionBR } from './useEditorStore';
import {
  Sparkles,
  Search,
  ArrowRight,
  ArrowLeft,
  Check,
  Tag,
  Star,
  Layers,
  X,
  Store,
  Pill,
  ShoppingBag,
  Truck,
  Shirt,
  Gem,
  Package,
  Wrench,
  Wine,
  Leaf,
  FileCheck,
  Maximize2,
  ShoppingCart,
  Barcode,
  Activity,
  FlaskConical,
  Droplet,
  Archive,
  SlidersHorizontal,
  Sliders,
} from 'lucide-react';

interface WizardProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

function formatNumBR(val: number): string {
  if (val === undefined || val === null || isNaN(Number(val))) return '0';
  const num = Number(val);
  return Number.isInteger(num) ? num.toString() : num.toFixed(2).replace(/\.?0+$/, '').replace('.', ',');
}

function formatDimensionPair(widthMm: number, heightMm: number): string {
  return `${formatNumBR(widthMm)} × ${formatNumBR(heightMm)} mm`;
}

export default function NewTemplateWizard({ isOpen, onClose, onSuccess }: WizardProps) {
  const { createNewDocument } = useEditorStore();

  const [step, setStep] = useState<'niche' | 'size'>('niche');
  const [selectedNiche, setSelectedNiche] = useState<NicheDefinition | null>(null);
  const [selectedSize, setSelectedSize] = useState<NicheSizeItem | null>(null);
  const [sizeMode, setSizeMode] = useState<'catalog' | 'custom'>('catalog');
  const [customWidthMm, setCustomWidthMm] = useState<string>('100');
  const [customHeightMm, setCustomHeightMm] = useState<string>('200');
  const [customDimensionError, setCustomDimensionError] = useState<string>('');
  const [searchNiche, setSearchNiche] = useState('');
  const [searchSize, setSearchSize] = useState('');
  const [customTitle, setCustomTitle] = useState('');

  // Ícones por nicho
  const getNicheIcon = (iconName: string) => {
    switch (iconName) {
      case 'ShoppingCart':
      case 'Store':
        return <ShoppingCart size={18} />;
      case 'Barcode':
        return <Barcode size={18} />;
      case 'Truck':
        return <Truck size={18} />;
      case 'Pill':
        return <Pill size={18} />;
      case 'Activity':
        return <Activity size={18} />;
      case 'FlaskConical':
        return <FlaskConical size={18} />;
      case 'Droplet':
        return <Droplet size={18} />;
      case 'Sparkles':
      case 'Gem':
        return <Sparkles size={18} />;
      case 'Tag':
      case 'Shirt':
        return <Tag size={18} />;
      case 'Archive':
      case 'Package':
        return <Archive size={18} />;
      case 'Layers':
        return <Layers size={18} />;
      default:
        return <Tag size={18} />;
    }
  };

  // Filtragem dos nichos autorizados para o perfil / empresa (Fail-Safe)
  const filteredNiches = useMemo(() => {
    const allowed = NICHES.filter((n) => isNicheAllowed(n.id));
    if (!searchNiche.trim()) return allowed;
    const term = searchNiche.toLowerCase();
    return allowed.filter(
      (n) =>
        n.name.toLowerCase().includes(term) ||
        n.description.toLowerCase().includes(term) ||
        n.tags.some((t) => t.toLowerCase().includes(term))
    );
  }, [searchNiche]);

  // Tamanhos filtrados do nicho selecionado (com ordenação Mais Usado primeiro)
  const availableSizes = useMemo(() => {
    if (!selectedNiche) return [];
    const sizes = getSizesByNiche(selectedNiche.id);
    if (!searchSize.trim()) return sizes;
    const term = searchSize.toLowerCase();
    return sizes.filter(
      (s) =>
        s.label.toLowerCase().includes(term) ||
        s.description.toLowerCase().includes(term) ||
        s.widthMm.toString().includes(term) ||
        s.heightMm.toString().includes(term)
    );
  }, [selectedNiche, searchSize]);

  if (!isOpen || !hasPermission('templates.create')) return null;

  const handleSelectNiche = (niche: NicheDefinition) => {
    setSelectedNiche(niche);
    setSizeMode('catalog');
    setCustomDimensionError('');
    const sizes = getSizesByNiche(niche.id);
    if (sizes.length > 0) {
      setSelectedSize(sizes[0]);
    }
    setStep('size');
  };

  const handleCustomDimensionChange = (newWidthStr: string, newHeightStr: string) => {
    setCustomWidthMm(newWidthStr);
    setCustomHeightMm(newHeightStr);

    const w = parseFloat(newWidthStr.replace(',', '.'));
    const h = parseFloat(newHeightStr.replace(',', '.'));

    if (isNaN(w) || w <= 0) {
      setCustomDimensionError('A largura deve ser um número positivo maior que zero.');
      return;
    }
    if (isNaN(h) || h <= 0) {
      setCustomDimensionError('A altura/comprimento deve ser um número positivo maior que zero.');
      return;
    }

    setCustomDimensionError('');
    try {
      const customSize = createCustomLabelSize(w, h);
      setSelectedSize({
        ...customSize,
        featured: false,
        order: 999,
        label: `${formatNumBR(w)} × ${formatNumBR(h)} mm (Personalizado)`,
      });
    } catch (err: any) {
      setCustomDimensionError(err.message || 'Dimensões inválidas.');
    }
  };

  const handleCreate = () => {
    if (!selectedNiche) return;

    let targetWidthMm: number;
    let targetHeightMm: number;
    let safeSizeLabel: string;

    if (sizeMode === 'custom') {
      const w = parseFloat(customWidthMm.replace(',', '.'));
      const h = parseFloat(customHeightMm.replace(',', '.'));
      if (isNaN(w) || w <= 0 || isNaN(h) || h <= 0) {
        setCustomDimensionError('Informe valores positivos válidos para largura e altura.');
        return;
      }
      targetWidthMm = w;
      targetHeightMm = h;
      safeSizeLabel = `${formatNumBR(w)} × ${formatNumBR(h)} mm`;
    } else {
      if (!selectedSize) return;
      targetWidthMm = selectedSize.widthMm;
      targetHeightMm = selectedSize.heightMm;
      safeSizeLabel = selectedSize.label || `${selectedSize.widthMm}x${selectedSize.heightMm}mm`;
    }

    const safeTitle = customTitle.trim() || `${selectedNiche.name} - ${safeSizeLabel}`;

    createNewDocument({
      title: safeTitle,
      widthMm: targetWidthMm,
      heightMm: targetHeightMm,
      dpi: 203,
      nicheName: selectedNiche.name,
    });

    onClose();
    onSuccess?.();
  };

  return (
    <div className="wizard-modal-overlay">
      <div className="wizard-modal-content">
        {/* Header do Wizard */}
        <div className="wizard-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <div className="niche-card-icon" style={{ width: '36px', height: '36px' }}>
              <Sparkles size={18} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                {step === 'niche' ? '1. Escolha a Aplicação / Segmento Comercial' : '2. Selecione o Tamanho da Etiqueta'}
              </h2>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                {step === 'niche'
                  ? 'Formatos e boas práticas homologados para impressoras térmicas (PPLA / PPLB / ZPL).'
                  : `Configurando medidas homologadas para: ${selectedNiche?.name}`}
              </p>
            </div>
          </div>
          <button className="btn" style={{ padding: '0.4rem', border: 'none' }} onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Corpo do Modal */}
        <div className="wizard-body">
          {/* =========================================================================
             ETAPA 1: SELEÇÃO DE NICHO (GRID 4/3/2/1 COLUNAS SEM SCROLL INTERNO)
             ========================================================================= */}
          {step === 'niche' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              {/* Barra de Busca de Nicho */}
              <div className="size-search-bar">
                <Search size={16} color="var(--text-muted)" />
                <input
                  type="text"
                  className="size-search-input"
                  placeholder="Pesquisar nicho ou aplicação (ex: Gôndola, Farmácia, E-commerce, Roupas)..."
                  value={searchNiche}
                  onChange={(e) => setSearchNiche(e.target.value)}
                  autoFocus
                />
              </div>

              {/* Grid Responsivo de 4 Colunas */}
              {filteredNiches.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: 'var(--text-muted)' }}>
                  <p style={{ fontWeight: 600, fontSize: '0.9rem' }}>Nenhum nicho disponível para criação de modelo.</p>
                  <p style={{ fontSize: '0.8rem', marginTop: '0.35rem' }}>
                    Verifique os nichos habilitados para seu usuário ou organização.
                  </p>
                </div>
              ) : (
                <div className="niche-grid">
                  {filteredNiches.map((niche) => (
                    <div
                      key={niche.id}
                      className={`niche-card ${selectedNiche?.id === niche.id ? 'selected' : ''}`}
                      onClick={() => handleSelectNiche(niche)}
                    >
                      <div className="niche-card-header">
                        <div className="niche-card-icon">{getNicheIcon(niche.icon)}</div>
                        <div className="niche-card-title">{niche.name}</div>
                      </div>
                      <p className="niche-card-desc">{niche.description}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* =========================================================================
             ETAPA 2: SELEÇÃO DE TAMANHO & FICHA TÉCNICA
             ========================================================================= */}
          {step === 'size' && selectedNiche && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* Barra do Nicho Limpa no Topo com Botão de Trocar Nicho */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-card)', padding: '0.65rem 0.95rem', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <div className="niche-card-icon" style={{ width: '30px', height: '30px', borderRadius: '8px' }}>
                    {getNicheIcon(selectedNiche.icon)}
                  </div>
                  <div>
                    <span style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-primary)', display: 'block', lineHeight: 1.2 }}>
                      {selectedNiche.name}
                    </span>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                      {availableSizes.length} formatos homologados
                    </span>
                  </div>
                </div>

                <button
                  className="btn"
                  style={{ fontSize: '0.75rem', padding: '0.35rem 0.65rem' }}
                  onClick={() => setStep('niche')}
                >
                  <ArrowLeft size={13} />
                  <span>Trocar Nicho</span>
                </button>
              </div>

              {/* Grid Principal: Seletor Visual de Formatos à Esquerda e Painel Formato Selecionado à Direita */}
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.35fr) minmax(330px, 0.8fr)', gap: '1.25rem', alignItems: 'start' }}>
                {/* Coluna Esquerda: Busca e Grid de Formatos */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {/* Seletor de Modo: Catálogo Homologado vs Dimensões Personalizadas */}
                  <div
                    style={{
                      display: 'flex',
                      gap: '0.5rem',
                      background: 'var(--bg-input)',
                      padding: '0.25rem',
                      borderRadius: '10px',
                      border: '1px solid var(--border-color)',
                    }}
                  >
                    <button
                      type="button"
                      className={`btn ${sizeMode === 'catalog' ? 'btn-primary' : ''}`}
                      style={{
                        flex: 1,
                        fontSize: '0.78rem',
                        padding: '0.4rem 0.6rem',
                        borderRadius: '8px',
                        border: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.4rem',
                      }}
                      onClick={() => {
                        setSizeMode('catalog');
                        if (availableSizes.length > 0 && (!selectedSize || selectedSize.id.startsWith('custom-'))) {
                          setSelectedSize(availableSizes[0]);
                        }
                      }}
                    >
                      <Layers size={14} />
                      <span>Formatos do Nicho ({availableSizes.length})</span>
                    </button>

                    <button
                      type="button"
                      className={`btn ${sizeMode === 'custom' ? 'btn-primary' : ''}`}
                      style={{
                        flex: 1,
                        fontSize: '0.78rem',
                        padding: '0.4rem 0.6rem',
                        borderRadius: '8px',
                        border: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.4rem',
                      }}
                      onClick={() => {
                        setSizeMode('custom');
                        handleCustomDimensionChange(customWidthMm, customHeightMm);
                      }}
                    >
                      <Sliders size={14} />
                      <span>Dimensões Personalizadas</span>
                    </button>
                  </div>

                  {sizeMode === 'catalog' ? (
                    <>
                      <div className="size-search-bar" style={{ height: '40px', borderRadius: '10px' }}>
                        <Search size={16} color="var(--text-muted)" />
                        <input
                          type="text"
                          className="size-search-input"
                          placeholder="Buscar tamanho (ex: 100x30, 50x40...)"
                          value={searchSize}
                          onChange={(e) => setSearchSize(e.target.value)}
                        />
                      </div>

                      <div className="wizard-size-grid">
                        {availableSizes.map((size) => {
                          const isSelected = selectedSize?.id === size.id;
                          return (
                            <div
                              key={size.id}
                              className={`wizard-size-card ${isSelected ? 'selected' : ''}`}
                              onClick={() => setSelectedSize(size)}
                            >
                              {size.featured && <span className="wizard-size-badge">MAIS USADO</span>}
                              {isSelected && (
                                <div className="wizard-size-check">
                                  <Check size={13} />
                                </div>
                              )}
                              <div className="wizard-size-card-content">
                                <div className="wizard-size-dimension">{formatNumBR(size.widthMm)} × {formatNumBR(size.heightMm)}</div>
                                <div className="wizard-size-unit">mm</div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  ) : (
                    /* Painel de Configuração de Dimensões Personalizadas */
                    <div
                      style={{
                        padding: '1.25rem',
                        backgroundColor: 'var(--bg-card)',
                        borderRadius: '12px',
                        border: '1px solid var(--border-color)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '1rem',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <SlidersHorizontal size={18} color="var(--accent-blue)" />
                        <div>
                          <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                            Dimensões Sob Medida
                          </div>
                          <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                            Suporta formatos industriais com comprimento de até 200 mm ou mais.
                          </div>
                        </div>
                      </div>

                      {/* Presets Rápidos Industriais */}
                      <div>
                        <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '0.35rem' }}>
                          Presets Industriais Longos:
                        </span>
                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                          {INDUSTRIAL_LABEL_PRESETS.map((preset) => (
                            <button
                              key={preset.id}
                              type="button"
                              className="btn btn-secondary"
                              style={{
                                fontSize: '0.75rem',
                                padding: '0.3rem 0.65rem',
                                borderRadius: '6px',
                                border:
                                  customWidthMm === preset.widthMm.toString() &&
                                  customHeightMm === preset.heightMm.toString()
                                    ? '1px solid var(--accent-blue)'
                                    : '1px solid var(--border-color)',
                              }}
                              onClick={() => {
                                handleCustomDimensionChange(
                                  preset.widthMm.toString(),
                                  preset.heightMm.toString()
                                );
                              }}
                            >
                              {preset.name}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Campos Numéricos de Largura e Altura */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div>
                          <label
                            style={{
                              display: 'block',
                              fontSize: '0.76rem',
                              fontWeight: 700,
                              color: 'var(--text-primary)',
                              marginBottom: '0.35rem',
                            }}
                          >
                            Largura (mm):
                          </label>
                          <input
                            type="number"
                            step="0.5"
                            min="10"
                            max="220"
                            className="size-search-input"
                            style={{
                              width: '100%',
                              height: '40px',
                              padding: '0 0.75rem',
                              borderRadius: '8px',
                              border: '1px solid var(--border-color)',
                              background: 'var(--bg-input)',
                              fontSize: '0.85rem',
                              color: 'var(--text-primary)',
                              boxSizing: 'border-box',
                            }}
                            value={customWidthMm}
                            onChange={(e) => handleCustomDimensionChange(e.target.value, customHeightMm)}
                          />
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.2rem', display: 'block' }}>
                            Padrão cabeçote térmico: até 104 mm
                          </span>
                        </div>

                        <div>
                          <label
                            style={{
                              display: 'block',
                              fontSize: '0.76rem',
                              fontWeight: 700,
                              color: 'var(--text-primary)',
                              marginBottom: '0.35rem',
                            }}
                          >
                            Altura / Comprimento (mm):
                          </label>
                          <input
                            type="number"
                            step="0.5"
                            min="10"
                            max="500"
                            className="size-search-input"
                            style={{
                              width: '100%',
                              height: '40px',
                              padding: '0 0.75rem',
                              borderRadius: '8px',
                              border: '1px solid var(--border-color)',
                              background: 'var(--bg-input)',
                              fontSize: '0.85rem',
                              color: 'var(--text-primary)',
                              boxSizing: 'border-box',
                            }}
                            value={customHeightMm}
                            onChange={(e) => handleCustomDimensionChange(customWidthMm, e.target.value)}
                          />
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.2rem', display: 'block' }}>
                            Comprimento contínuo: até 200 mm+
                          </span>
                        </div>
                      </div>

                      {customDimensionError && (
                        <div
                          style={{
                            padding: '0.5rem 0.75rem',
                            borderRadius: '6px',
                            backgroundColor: 'rgba(239, 68, 68, 0.1)',
                            border: '1px solid var(--status-danger)',
                            color: 'var(--status-danger)',
                            fontSize: '0.76rem',
                          }}
                        >
                          {customDimensionError}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Nome do Modelo Reposicionado Imediatamente Abaixo da Seleção */}
                  <div style={{ marginTop: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.35rem' }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)' }}>Nome do modelo</span>
                      <span style={{ fontSize: '0.7rem', fontWeight: 500, color: 'var(--text-muted)' }}>Opcional</span>
                    </div>
                    <input
                      type="text"
                      className="size-search-input"
                      style={{ width: '100%', height: '40px', padding: '0 0.75rem', borderRadius: '10px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', fontSize: '0.82rem', color: 'var(--text-primary)', boxSizing: 'border-box' }}
                      placeholder={`Ex: ${selectedNiche.name} ${selectedSize ? formatDimensionPair(selectedSize.widthMm, selectedSize.heightMm) : ''}`}
                      value={customTitle}
                      onChange={(e) => setCustomTitle(e.target.value)}
                    />
                  </div>
                </div>

                {/* Coluna Direita: Painel "FORMATO SELECIONADO" */}
                {selectedSize && (
                  <div className="wizard-format-panel">
                    <span className="wizard-format-panel-title">FORMATO SELECIONADO</span>

                    {/* Preview Proporcional */}
                    <div className="wizard-format-preview">
                      <div
                        className="preview-label-box"
                        style={{
                          width: `${Math.min(220, Math.max(80, (selectedSize.widthMm / 104) * 200))}px`,
                          height: `${Math.min(120, Math.max(45, (selectedSize.heightMm / 104) * 200))}px`,
                        }}
                      />
                    </div>
                    <div style={{ textAlign: 'center', margin: '-0.3rem 0 0.5rem 0' }}>
                      <span style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                        {formatDimensionPair(selectedSize.widthMm, selectedSize.heightMm)}
                      </span>
                    </div>

                    {/* Título do Formato (Exibe o Nicho sem repetir a dimensão intermediária) */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                      <h4 style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                        {selectedNiche.name}
                      </h4>
                      {selectedSize.label && (
                        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                          {selectedSize.label}
                        </span>
                      )}
                    </div>

                    {/* Especificações Técnicas Limpas */}
                    <div className="wizard-format-specs">
                      <span className="technical-spec-label">Dimensões:</span>
                      <span className="technical-spec-value" style={{ fontWeight: 700 }}>
                        {formatDimensionPair(selectedSize.widthMm, selectedSize.heightMm)}
                      </span>

                      <span className="technical-spec-label">Orientação:</span>
                      <span className="technical-spec-value" style={{ textTransform: 'capitalize', fontWeight: 600 }}>
                        {calculateOrientation(selectedSize.widthMm, selectedSize.heightMm)}
                      </span>

                      <span className="technical-spec-label">Resolução:</span>
                      <span className="technical-spec-value" style={{ fontWeight: 600 }}>
                        203 DPI (~8 dots/mm)
                      </span>

                      <span className="technical-spec-label">Cabeçote:</span>
                      <span className="technical-spec-value" style={{ fontWeight: 600 }}>
                        Padrão 104 mm (4 polegadas)
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer do Wizard */}
        <div className="wizard-footer">
          <button className="btn" onClick={onClose}>
            Cancelar
          </button>

          {step === 'niche' ? (
            <button
              className="btn btn-primary"
              disabled={!selectedNiche}
              onClick={() => selectedNiche && handleSelectNiche(selectedNiche)}
            >
              <span>Avançar para Tamanhos</span>
              <ArrowRight size={14} />
            </button>
          ) : (
            <button className="btn btn-primary" onClick={handleCreate} disabled={!selectedSize}>
              <Check size={14} />
              <span>Criar Etiqueta no Editor</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
