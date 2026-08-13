import React from 'react';
import { useEditorStore } from './useEditorStore';
import { CANONICAL_FIELDS } from '@witiquetas/label-schema';
import { Trash2, Copy, Lock, Unlock, AlignLeft, AlignCenter, AlignRight } from 'lucide-react';

export default function PropertyInspector() {
  const { document, selectedElementId, updateElement, removeElement, duplicateElement } = useEditorStore();

  const selectedElem = document.elements.find((el) => el.id === selectedElementId);

  if (!selectedElem) {
    return (
      <div style={{ padding: '1.5rem', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
        <p style={{ fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
          Nenhum elemento selecionado
        </p>
        <p>Clique em qualquer elemento da etiqueta para editar suas propriedades numéricas, fontes e vínculos de dados.</p>
      </div>
    );
  }

  const handleChange = (key: string, value: any) => {
    updateElement(selectedElem.id, { [key]: value });
  };

  return (
    <div style={{ padding: '1.25rem', overflowY: 'auto', maxHeight: 'calc(100vh - 120px)' }}>
      {/* Header do Inspetor */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
        <div>
          <span style={{ fontSize: '0.75rem', color: 'var(--accent-blue)', fontWeight: 600, textTransform: 'uppercase' }}>
            Elemento ({selectedElem.type})
          </span>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            ID: {selectedElem.id}
          </h3>
        </div>
        <div style={{ display: 'flex', gap: '0.4rem' }}>
          <button
            className="btn"
            style={{ padding: '0.4rem', borderRadius: '6px' }}
            title="Duplicar elemento"
            onClick={() => duplicateElement(selectedElem.id)}
          >
            <Copy size={16} />
          </button>
          <button
            className="btn"
            style={{ padding: '0.4rem', borderRadius: '6px', color: '#ef4444' }}
            title="Excluir elemento"
            onClick={() => removeElement(selectedElem.id)}
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {/* Seção 1: Posição e Dimensões (em mm) */}
      <div className="inspector-section" style={{ marginBottom: '1.25rem' }}>
        <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.5rem' }}>
          Posição & Tamanho (mm)
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem' }}>
          <div>
            <span className="metric-label">Posição X (mm)</span>
            <input
              type="number"
              step="0.5"
              className="inspector-input"
              value={selectedElem.x}
              onChange={(e) => handleChange('x', parseFloat(e.target.value) || 0)}
            />
          </div>
          <div>
            <span className="metric-label">Posição Y (mm)</span>
            <input
              type="number"
              step="0.5"
              className="inspector-input"
              value={selectedElem.y}
              onChange={(e) => handleChange('y', parseFloat(e.target.value) || 0)}
            />
          </div>
          <div>
            <span className="metric-label">Largura (mm)</span>
            <input
              type="number"
              step="0.5"
              className="inspector-input"
              value={selectedElem.width}
              onChange={(e) => handleChange('width', parseFloat(e.target.value) || 1)}
            />
          </div>
          <div>
            <span className="metric-label">Altura (mm)</span>
            <input
              type="number"
              step="0.5"
              className="inspector-input"
              value={selectedElem.height}
              onChange={(e) => handleChange('height', parseFloat(e.target.value) || 1)}
            />
          </div>
        </div>
      </div>

      {/* Seção 2: Vínculo de Campo Canônico */}
      {(selectedElem.type === 'text' || selectedElem.type === 'price' || selectedElem.type === 'barcode' || selectedElem.type === 'qrcode') && (
        <div className="inspector-section" style={{ marginBottom: '1.25rem' }}>
          <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.4rem' }}>
            Vínculo com Campo de Produto (ERP)
          </label>
          <select
            className="inspector-select"
            value={(selectedElem as any).field || ''}
            onChange={(e) => handleChange('field', e.target.value || undefined)}
          >
            <option value="">-- Texto Estático / Manual --</option>
            {CANONICAL_FIELDS.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label} ({f.key})
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Seção 3: Propriedades específicas por Tipo */}
      {selectedElem.type === 'text' && (
        <div className="inspector-section" style={{ marginBottom: '1.25rem' }}>
          <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.4rem' }}>
            Conteúdo de Texto
          </label>
          <input
            type="text"
            className="inspector-input"
            value={(selectedElem as any).text || ''}
            onChange={(e) => handleChange('text', e.target.value)}
            style={{ marginBottom: '0.75rem' }}
          />

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem', marginBottom: '0.75rem' }}>
            <div>
              <span className="metric-label">Tamanho da Fonte (pt)</span>
              <input
                type="number"
                className="inspector-input"
                value={(selectedElem as any).fontSize || 12}
                onChange={(e) => handleChange('fontSize', parseInt(e.target.value) || 8)}
              />
            </div>
            <div>
              <span className="metric-label">Cor do Texto</span>
              <input
                type="color"
                className="inspector-input"
                style={{ height: '36px', padding: '2px' }}
                value={(selectedElem as any).color || '#000000'}
                onChange={(e) => handleChange('color', e.target.value)}
              />
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <button
              className={`btn ${((selectedElem as any).fontWeight === 'bold') ? 'btn-primary' : ''}`}
              style={{ flex: 1, padding: '0.4rem' }}
              onClick={() => handleChange('fontWeight', (selectedElem as any).fontWeight === 'bold' ? 'normal' : 'bold')}
            >
              Negrito (Bold)
            </button>
          </div>

          <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.4rem' }}>
            Alinhamento
          </label>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              className={`btn ${((selectedElem as any).alignment === 'left') ? 'btn-primary' : ''}`}
              style={{ flex: 1, padding: '0.4rem', justifyContent: 'center' }}
              onClick={() => handleChange('alignment', 'left')}
            >
              <AlignLeft size={16} />
            </button>
            <button
              className={`btn ${((selectedElem as any).alignment === 'center') ? 'btn-primary' : ''}`}
              style={{ flex: 1, padding: '0.4rem', justifyContent: 'center' }}
              onClick={() => handleChange('alignment', 'center')}
            >
              <AlignCenter size={16} />
            </button>
            <button
              className={`btn ${((selectedElem as any).alignment === 'right') ? 'btn-primary' : ''}`}
              style={{ flex: 1, padding: '0.4rem', justifyContent: 'center' }}
              onClick={() => handleChange('alignment', 'right')}
            >
              <AlignRight size={16} />
            </button>
          </div>
        </div>
      )}

      {selectedElem.type === 'price' && (
        <div className="inspector-section" style={{ marginBottom: '1.25rem' }}>
          <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.4rem' }}>
            Formatação do Preço
          </label>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem', marginBottom: '0.75rem' }}>
            <div>
              <span className="metric-label">Tamanho R$</span>
              <input
                type="number"
                className="inspector-input"
                value={(selectedElem as any).currencyFontSize || 12}
                onChange={(e) => handleChange('currencyFontSize', parseInt(e.target.value) || 10)}
              />
            </div>
            <div>
              <span className="metric-label">Tamanho Inteiro (99)</span>
              <input
                type="number"
                className="inspector-input"
                value={(selectedElem as any).integerFontSize || 24}
                onChange={(e) => handleChange('integerFontSize', parseInt(e.target.value) || 14)}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem', marginBottom: '0.75rem' }}>
            <div>
              <span className="metric-label">Tamanho Centavos (,99)</span>
              <input
                type="number"
                className="inspector-input"
                value={(selectedElem as any).fractionFontSize || 14}
                onChange={(e) => handleChange('fractionFontSize', parseInt(e.target.value) || 10)}
              />
            </div>
            <div>
              <span className="metric-label">Cor do Preço</span>
              <input
                type="color"
                className="inspector-input"
                style={{ height: '36px', padding: '2px' }}
                value={(selectedElem as any).color || '#dc2626'}
                onChange={(e) => handleChange('color', e.target.value)}
              />
            </div>
          </div>
        </div>
      )}

      {selectedElem.type === 'barcode' && (
        <div className="inspector-section" style={{ marginBottom: '1.25rem' }}>
          <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.4rem' }}>
            Formato do Código de Barras
          </label>
          <select
            className="inspector-select"
            value={(selectedElem as any).format || 'EAN13'}
            onChange={(e) => handleChange('format', e.target.value)}
            style={{ marginBottom: '0.75rem' }}
          >
            <option value="EAN13">EAN-13 (Padrão Comercial)</option>
            <option value="CODE128">Code 128 (Alfanumérico)</option>
            <option value="EAN8">EAN-8 (Compacto)</option>
          </select>

          <span className="metric-label">Valor Padrão (Sem vínculo)</span>
          <input
            type="text"
            className="inspector-input"
            value={(selectedElem as any).value || ''}
            onChange={(e) => handleChange('value', e.target.value)}
          />
        </div>
      )}

      {selectedElem.type === 'rectangle' && (
        <div className="inspector-section" style={{ marginBottom: '1.25rem' }}>
          <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.4rem' }}>
            Borda e Preenchimento
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem' }}>
            <div>
              <span className="metric-label">Cor do Fundo</span>
              <input
                type="color"
                className="inspector-input"
                style={{ height: '36px', padding: '2px' }}
                value={(selectedElem as any).fillColor || '#ffffff'}
                onChange={(e) => handleChange('fillColor', e.target.value)}
              />
            </div>
            <div>
              <span className="metric-label">Espessura Borda</span>
              <input
                type="number"
                className="inspector-input"
                value={(selectedElem as any).strokeWidth || 1}
                onChange={(e) => handleChange('strokeWidth', parseInt(e.target.value) || 0)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
