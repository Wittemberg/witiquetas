import React, { useState, useMemo } from 'react';
import {
  NICHES,
  getSizesByNiche,
  calculateOrientation,
  formatDimension,
  THERMAL_STANDARD_MAX_WIDTH_MM,
  Niche,
  NicheSizeItem,
} from '@witiquetas/label-schema';
import {
  ShoppingCart,
  Barcode,
  Truck,
  Pill,
  Activity,
  FlaskConical,
  Droplet,
  Sparkles,
  Tag,
  Archive,
  Layers,
  Search,
  X,
  Plus,
  ArrowLeft,
  ArrowRight,
  Check,
  AlertTriangle,
  Info,
  Maximize2
} from 'lucide-react';
import { useEditorStore } from './useEditorStore';

// Mapeamento de Ícones para os Nichos
const NICHE_ICONS: Record<string, React.ElementType> = {
  ShoppingCart,
  Barcode,
  Truck,
  Pill,
  Activity,
  FlaskConical,
  Droplet,
  Sparkles,
  Tag,
  Archive,
  Layers,
};

interface NewTemplateWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function NewTemplateWizard({ isOpen, onClose, onSuccess }: NewTemplateWizardProps) {
  const { createNewDocument } = useEditorStore();

  // Estados do Wizard
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedNiche, setSelectedNiche] = useState<Niche | null>(null);
  const [selectedSize, setSelectedSize] = useState<NicheSizeItem | null>(null);
  const [isCustomSize, setIsCustomSize] = useState(false);

  // Estados do Tamanho Personalizado
  const [customWidthStr, setCustomWidthStr] = useState('100');
  const [customHeightStr, setCustomHeightStr] = useState('50');

  // Filtro de busca de tamanho
  const [sizeSearch, setSizeSearch] = useState('');

  // Obter tamanhos do nicho selecionado
  const nicheSizes = useMemo(() => {
    if (!selectedNiche) return [];
    return getSizesByNiche(selectedNiche.id);
  }, [selectedNiche]);

  // Filtragem pela busca
  const filteredSizes = useMemo(() => {
    if (!sizeSearch.trim()) return nicheSizes;
    const term = sizeSearch.toLowerCase().replace(',', '.').trim();
    return nicheSizes.filter((s) => {
      const formatted = `${s.widthMm}x${s.heightMm}`.toLowerCase();
      const name = s.name.toLowerCase();
      return (
        formatted.includes(term) ||
        name.includes(term) ||
        s.widthMm.toString().includes(term) ||
        s.heightMm.toString().includes(term)
      );
    });
  }, [nicheSizes, sizeSearch]);

  // Parsing do tamanho personalizado
  const customWidthNum = useMemo(() => {
    const val = parseFloat(customWidthStr.replace(',', '.'));
    return isNaN(val) ? 0 : val;
  }, [customWidthStr]);

  const customHeightNum = useMemo(() => {
    const val = parseFloat(customHeightStr.replace(',', '.'));
    return isNaN(val) ? 0 : val;
  }, [customHeightStr]);

  // Dimensões finais selecionadas
  const activeWidth = isCustomSize ? customWidthNum : selectedSize?.widthMm ?? 100;
  const activeHeight = isCustomSize ? customHeightNum : selectedSize?.heightMm ?? 30;
  const orientation = calculateOrientation(activeWidth, activeHeight);

  // Alerta se ultrapassar 104 mm de largura
  const isOverThermalWidthLimit = activeWidth > THERMAL_STANDARD_MAX_WIDTH_MM;

  // Validação para habilitar criação
  const isSelectionValid =
    selectedNiche !== null &&
    ((!isCustomSize && selectedSize !== null) ||
      (isCustomSize && customWidthNum > 0 && customHeightNum > 0));

  if (!isOpen) return null;

  // Ação ao selecionar nicho
  const handleSelectNiche = (niche: Niche) => {
    setSelectedNiche(niche);
    setIsCustomSize(false);
    setSizeSearch('');
    const sizes = getSizesByNiche(niche.id);
    if (sizes.length > 0) {
      // Prioriza o tamanho com destaque ou o primeiro da lista
      const featured = sizes.find((s) => s.featured) || sizes[0];
      setSelectedSize(featured);
    } else {
      setSelectedSize(null);
    }
    setStep(2);
  };

  // Finalizar criação e inicializar documento
  const handleCreateLabel = () => {
    if (!isSelectionValid || !selectedNiche) return;

    const title = `${selectedNiche.name} (${activeWidth}x${activeHeight}mm)`;
    createNewDocument({
      title,
      widthMm: activeWidth,
      heightMm: activeHeight,
      dpi: 203,
      nicheName: selectedNiche.name,
    });

    onSuccess();
    onClose();
  };

  // Calcular proporção visual para a caixa de preview (limitada a max 300px x 180px)
  const maxBoxW = 280;
  const maxBoxH = 150;
  let previewBoxW = maxBoxW;
  let previewBoxH = maxBoxH;

  if (activeWidth > 0 && activeHeight > 0) {
    const ratio = activeWidth / activeHeight;
    if (ratio >= maxBoxW / maxBoxH) {
      previewBoxW = maxBoxW;
      previewBoxH = Math.max(35, Math.round(maxBoxW / ratio));
    } else {
      previewBoxH = maxBoxH;
      previewBoxW = Math.max(45, Math.round(maxBoxH * ratio));
    }
  }

  return (
    <div className="wizard-modal-overlay">
      <div className="wizard-modal-content">
        {/* Header do Wizard */}
        <div className="wizard-header">
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <Maximize2 size={22} color="var(--accent-blue)" />
              {step === 1 ? 'Nova Etiqueta — O que você deseja etiquetar?' : `Formatos para: ${selectedNiche?.name}`}
            </h2>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
              {step === 1
                ? 'Etapa 1 de 2: Selecione o nicho de aplicação para visualizar os tamanhos homologados.'
                : 'Etapa 2 de 2: Escolha uma das medidas padronizadas ou informe um tamanho personalizado.'}
            </p>
          </div>
          <button className="btn" style={{ padding: '0.4rem', border: 'none' }} onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* Corpo do Wizard */}
        <div className="wizard-body">
          {step === 1 ? (
            /* ======================================================
               ETAPA 1: SELEÇÃO DE NICHO
               ====================================================== */
            <div>
              <div style={{ marginBottom: '1.2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  Selecione o segmento / nicho da etiqueta:
                </span>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  11 categorias disponíveis
                </span>
              </div>

              <div className="niche-grid">
                {NICHES.map((niche) => {
                  const IconComp = NICHE_ICONS[niche.iconName] || Layers;
                  const isSelected = selectedNiche?.id === niche.id;
                  const sizesCount = getSizesByNiche(niche.id).length;

                  return (
                    <div
                      key={niche.id}
                      className={`niche-card ${isSelected ? 'selected' : ''}`}
                      onClick={() => handleSelectNiche(niche)}
                    >
                      <div className="niche-card-header">
                        <div className="niche-card-icon">
                          <IconComp size={20} />
                        </div>
                        <div>
                          <div className="niche-card-title">{niche.name}</div>
                          <span style={{ fontSize: '0.7rem', color: 'var(--accent-blue)', fontWeight: 600 }}>
                            {sizesCount} {sizesCount === 1 ? 'tamanho' : 'tamanhos'}
                          </span>
                        </div>
                      </div>
                      <p className="niche-card-desc">{niche.description}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            /* ======================================================
               ETAPA 2: SELEÇÃO DE TAMANHO & PREVIEW
               ====================================================== */
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '1.5rem', height: '100%' }}>
              {/* Coluna Esquerda: Lista de Tamanhos e Busca */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {/* Barra de Busca */}
                <div className="size-search-bar">
                  <Search size={18} color="var(--text-muted)" />
                  <input
                    type="text"
                    className="size-search-input"
                    placeholder="🔍 Procurar tamanho no nicho... (ex: 100, 40, 105)"
                    value={sizeSearch}
                    onChange={(e) => setSizeSearch(e.target.value)}
                  />
                  {sizeSearch && (
                    <button
                      onClick={() => setSizeSearch('')}
                      style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>

                {/* Grade de Tamanhos Filtrados */}
                <div>
                  <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.6rem' }}>
                    Tamanhos Padronizados ({filteredSizes.length}):
                  </div>

                  <div className="size-chips-grid">
                    {filteredSizes.map((size) => {
                      const isSelected = !isCustomSize && selectedSize?.id === size.id;
                      const sizeOrientation = calculateOrientation(size.widthMm, size.heightMm);

                      return (
                        <div
                          key={size.id}
                          className={`size-chip ${isSelected ? 'selected' : ''}`}
                          onClick={() => {
                            setSelectedSize(size);
                            setIsCustomSize(false);
                          }}
                        >
                          {size.featured && (
                            <span className="size-featured-tag">★ Mais Usado</span>
                          )}
                          <div className="size-chip-dimension">{size.name}</div>
                          <div className="size-chip-meta">
                            <span style={{ textTransform: 'capitalize' }}>{sizeOrientation}</span>
                            {isSelected && <Check size={14} color="var(--accent-blue)" />}
                          </div>
                        </div>
                      );
                    })}

                    {/* Botão de Tamanho Personalizado */}
                    <div
                      className={`size-chip ${isCustomSize ? 'selected' : ''}`}
                      onClick={() => setIsCustomSize(true)}
                      style={{ borderStyle: 'dashed' }}
                    >
                      <div className="size-chip-dimension" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--accent-blue)' }}>
                        <Plus size={16} />
                        <span>Tamanho Personalizado</span>
                      </div>
                      <div className="size-chip-meta">
                        <span>Informar mm manual</span>
                        {isCustomSize && <Check size={14} color="var(--accent-blue)" />}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Formulário de Tamanho Personalizado */}
                {isCustomSize && (
                  <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color-glow)', padding: '1rem', borderRadius: '12px' }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <Plus size={16} color="var(--accent-blue)" />
                      Configurar Dimensões Personalizadas
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                      <div>
                        <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '0.3rem' }}>
                          Largura (mm)
                        </label>
                        <input
                          type="text"
                          className="inspector-input"
                          placeholder="Ex: 100 ou 50,8"
                          value={customWidthStr}
                          onChange={(e) => setCustomWidthStr(e.target.value)}
                        />
                      </div>

                      <div>
                        <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '0.3rem' }}>
                          Altura (mm)
                        </label>
                        <input
                          type="text"
                          className="inspector-input"
                          placeholder="Ex: 30 ou 25,4"
                          value={customHeightStr}
                          onChange={(e) => setCustomHeightStr(e.target.value)}
                        />
                      </div>
                    </div>

                    {/* Alerta de Limite Térmico */}
                    {isOverThermalWidthLimit && (
                      <div style={{ marginTop: '0.75rem', padding: '0.6rem 0.8rem', background: 'rgba(245, 158, 11, 0.15)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: '8px', color: '#fbbf24', fontSize: '0.75rem', display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                        <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
                        <span>
                          <strong>Aviso de Cabeçote Térmico:</strong> A maioria das impressoras térmicas padrão (4 polegadas) suporta no máximo <strong>104 mm</strong> de largura. Certifique-se de que sua impressora suporta larguras maiores.
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Coluna Direita: Preview Proporcional e Metadados */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  Representação Proporcional:
                </div>

                <div className="preview-proportional-container">
                  {/* Caixa da Etiqueta Proporcional */}
                  <div
                    className="preview-label-box"
                    style={{
                      width: `${previewBoxW}px`,
                      height: `${previewBoxH}px`,
                    }}
                  >
                    <span className="preview-dimension-badge">
                      {formatDimension(activeWidth, activeHeight)}
                    </span>
                    <span style={{ fontSize: '0.65rem', color: '#64748b', marginTop: '0.3rem', fontWeight: 600 }}>
                      Orientação: {orientation.toUpperCase()}
                    </span>
                  </div>

                  {/* Detalhes Técnicos */}
                  <div style={{ marginTop: '1.25rem', width: '100%', display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.6rem', borderTop: '1px solid var(--border-color)', paddingTop: '0.8rem' }}>
                    <div>
                      <span className="metric-label">Nicho:</span>
                      <span className="metric-value" style={{ fontSize: '0.85rem' }}>{selectedNiche?.name}</span>
                    </div>
                    <div>
                      <span className="metric-label">Orientação:</span>
                      <span className="metric-value" style={{ fontSize: '0.85rem', textTransform: 'capitalize' }}>{orientation}</span>
                    </div>
                    <div>
                      <span className="metric-label">Resolução:</span>
                      <span className="metric-value" style={{ fontSize: '0.85rem' }}>203 DPI (~8 dots/mm)</span>
                    </div>
                    <div>
                      <span className="metric-label">Compatibilidade:</span>
                      <span className="metric-value" style={{ fontSize: '0.85rem', color: 'var(--status-success)' }}>PPLA / PPLB / ZPL</span>
                    </div>
                  </div>
                </div>

                <div style={{ padding: '0.75rem', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '10px', fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <Info size={16} color="var(--accent-blue)" style={{ flexShrink: 0 }} />
                  <span>
                    O editor abrirá automaticamente ajustado às dimensões exatas selecionadas, evitando quebras na impressão.
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Rodapé com Navegação */}
        <div className="wizard-footer">
          {step === 1 ? (
            <div>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Clique em um nicho para prosseguir aos tamanhos.
              </span>
            </div>
          ) : (
            <button className="btn" onClick={() => setStep(1)}>
              <ArrowLeft size={16} />
              <span>Trocar Nicho</span>
            </button>
          )}

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button className="btn" onClick={onClose}>
              Cancelar
            </button>

            {step === 2 && (
              <button
                className="btn btn-primary"
                onClick={handleCreateLabel}
                disabled={!isSelectionValid}
              >
                <span>Criar Etiqueta</span>
                <ArrowRight size={16} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
