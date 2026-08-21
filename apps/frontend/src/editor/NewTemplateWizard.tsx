import React, { useState, useMemo } from 'react';
import {
  NICHES,
  NicheDefinition,
  NicheSizeItem,
  getSizesByNiche,
  calculateOrientation,
  formatDimensionLabel,
} from '@witiquetas/label-schema';
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
  Maximize2
} from 'lucide-react';

interface WizardProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function NewTemplateWizard({ isOpen, onClose, onSuccess }: WizardProps) {
  const { createNewDocument } = useEditorStore();

  const [step, setStep] = useState<'niche' | 'size'>('niche');
  const [selectedNiche, setSelectedNiche] = useState<NicheDefinition | null>(null);
  const [selectedSize, setSelectedSize] = useState<NicheSizeItem | null>(null);
  const [searchNiche, setSearchNiche] = useState('');
  const [searchSize, setSearchSize] = useState('');
  const [customTitle, setCustomTitle] = useState('');

  // Ícones por nicho
  const getNicheIcon = (iconName: string) => {
    switch (iconName) {
      case 'Store':
        return <Store size={18} />;
      case 'Pill':
        return <Pill size={18} />;
      case 'ShoppingBag':
        return <ShoppingBag size={18} />;
      case 'Truck':
        return <Truck size={18} />;
      case 'Shirt':
        return <Shirt size={18} />;
      case 'Gem':
        return <Gem size={18} />;
      case 'Package':
        return <Package size={18} />;
      case 'Wrench':
        return <Wrench size={18} />;
      case 'Wine':
        return <Wine size={18} />;
      case 'Leaf':
        return <Leaf size={18} />;
      case 'FileCheck':
        return <FileCheck size={18} />;
      default:
        return <Tag size={18} />;
    }
  };

  // Filtragem dos 11 nichos
  const filteredNiches = useMemo(() => {
    if (!searchNiche.trim()) return NICHES;
    const term = searchNiche.toLowerCase();
    return NICHES.filter(
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

  if (!isOpen) return null;

  const handleSelectNiche = (niche: NicheDefinition) => {
    setSelectedNiche(niche);
    const sizes = getSizesByNiche(niche.id);
    if (sizes.length > 0) {
      setSelectedSize(sizes[0]);
    }
    setStep('size');
  };

  const handleCreate = () => {
    if (!selectedSize || !selectedNiche) return;

    const safeSizeLabel = selectedSize.label || `${selectedSize.widthMm}x${selectedSize.heightMm}mm`;
    const safeTitle = customTitle.trim() || `${selectedNiche.name} - ${safeSizeLabel}`;

    createNewDocument({
      title: safeTitle,
      widthMm: selectedSize.widthMm,
      heightMm: selectedSize.heightMm,
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
            </div>
          )}

          {/* =========================================================================
             ETAPA 2: SELEÇÃO DE TAMANHO & FICHA TÉCNICA
             ========================================================================= */}
          {step === 'size' && selectedNiche && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* Botão de Trocar Nicho no Topo junto com Identificador */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-card)', padding: '0.6rem 0.85rem', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div className="niche-card-icon" style={{ width: '28px', height: '28px' }}>
                    {getNicheIcon(selectedNiche.icon)}
                  </div>
                  <div>
                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                      Nicho: {selectedNiche.name}
                    </span>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginLeft: '0.5rem' }}>
                      ({availableSizes.length} tamanhos homologados)
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

              {/* Grid Duplo: Seleção de Tamanhos à Esquerda e Ficha Técnica com Preview Proporcional à Direita */}
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 1.2fr) minmax(280px, 1fr)', gap: '1.25rem', alignItems: 'start' }}>
                {/* Coluna Esquerda: Chips de Tamanhos */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  <div className="size-search-bar">
                    <Search size={15} color="var(--text-muted)" />
                    <input
                      type="text"
                      className="size-search-input"
                      placeholder="Filtrar medidas (ex: 100x30, 40, gôndola)..."
                      value={searchSize}
                      onChange={(e) => setSearchSize(e.target.value)}
                    />
                  </div>

                  <div className="size-chips-grid">
                    {availableSizes.map((size) => {
                      const isSelected = selectedSize?.id === size.id;
                      const formattedDimension = `${size.widthMm} × ${size.heightMm} mm`;

                      return (
                        <div
                          key={size.id}
                          className={`size-chip ${isSelected ? 'selected' : ''}`}
                          onClick={() => setSelectedSize(size)}
                        >
                          {size.featured && <span className="size-featured-tag">MAIS USADO</span>}
                          {isSelected && (
                            <div className="size-chip-check">
                              <Check size={12} />
                            </div>
                          )}
                          <div className="size-chip-content">
                            <div className="size-chip-dimension">{formattedDimension}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Coluna Direita: Ficha Técnica e Preview Proporcional */}
                {selectedSize && (
                  <div className="preview-proportional-container">
                    {/* Visualizador Proporcional */}
                    <div
                      style={{
                        width: '100%',
                        height: '140px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginBottom: '1rem',
                      }}
                    >
                      <div
                        className="preview-label-box"
                        style={{
                          width: `${Math.min(220, Math.max(80, (selectedSize.widthMm / 104) * 200))}px`,
                          height: `${Math.min(120, Math.max(45, (selectedSize.heightMm / 104) * 200))}px`,
                        }}
                      >
                        <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#0f172a', whiteSpace: 'nowrap' }}>
                          {selectedSize.label}
                        </span>
                        <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#64748b', whiteSpace: 'nowrap', marginTop: '0.2rem' }}>
                          {formatDimensionBR(selectedSize.widthMm)} × {formatDimensionBR(selectedSize.heightMm)} mm
                        </span>
                      </div>
                    </div>

                    {/* Ficha Técnica 2 Colunas Sem Quebra Indevida */}
                    <div className="technical-spec-grid">
                      <span className="technical-spec-label">Segmento:</span>
                      <span className="technical-spec-value">{selectedNiche.name}</span>

                      <span className="technical-spec-label">Dimensões Reais:</span>
                      <span className="technical-spec-value">
                        {formatDimensionBR(selectedSize.widthMm)} × {formatDimensionBR(selectedSize.heightMm)} mm
                      </span>

                      <span className="technical-spec-label">Orientação:</span>
                      <span className="technical-spec-value" style={{ textTransform: 'capitalize' }}>
                        {calculateOrientation(selectedSize.widthMm, selectedSize.heightMm)}
                      </span>

                      <span className="technical-spec-label">Resolução Nativa:</span>
                      <span className="technical-spec-value">203 DPI (~8 pontos/mm)</span>

                      <span className="technical-spec-label">Cabeçote Térmico:</span>
                      <span className="technical-spec-value">Padrão 104 mm (4 polegadas)</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Título Personalizado Opcional */}
              <div style={{ marginTop: '0.25rem' }}>
                <label className="metric-label">Nome do Modelo (Opcional)</label>
                <input
                  type="text"
                  className="inspector-input"
                  placeholder={`Ex: ${selectedNiche.name} - ${selectedSize?.label || 'Padrão'}`}
                  value={customTitle}
                  onChange={(e) => setCustomTitle(e.target.value)}
                />
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
