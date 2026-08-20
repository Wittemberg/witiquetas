import React from 'react';
import { IntegrationFieldDefinition, SYSTEM_FIELDS, DEFAULT_RETAIL_CATALOG } from '@witiquetas/label-schema';
import { useEditorStore } from './useEditorStore';

export interface FieldPickerProps {
  value: string;
  onChange: (value: string) => void;
  fields?: IntegrationFieldDefinition[];
  allowStatic?: boolean;
  staticLabel?: string;
  label?: string;
  placeholder?: string;
  className?: string;
  style?: React.CSSProperties;
  title?: string;
  id?: string;
}

export const FieldPicker: React.FC<FieldPickerProps> = ({
  value,
  onChange,
  fields,
  allowStatic = true,
  staticLabel = '-- Texto Estático Manual --',
  label,
  className = 'inspector-select',
  style,
  title,
  id,
}) => {
  const storeCatalog = useEditorStore((s) => s.activeCatalog);
  const activeFields = fields || storeCatalog || DEFAULT_RETAIL_CATALOG;

  const categoriesMap = new Map<string, IntegrationFieldDefinition[]>();
  for (const f of activeFields) {
    const catName = f.category || 'Geral';
    if (!categoriesMap.has(catName)) {
      categoriesMap.set(catName, []);
    }
    categoriesMap.get(catName)!.push(f);
  }

  const isSystemField = SYSTEM_FIELDS.some((sf) => sf.id === value);
  const isKnownIntegration = activeFields.some((f) => f.id === value);
  const isKnown = !value || isSystemField || isKnownIntegration;

  return (
    <div style={{ width: '100%', minWidth: 0, boxSizing: 'border-box' }}>
      {label && <label className="metric-label">{label}</label>}
      <select
        id={id}
        className={className}
        style={{
          width: '100%',
          minWidth: 0,
          boxSizing: 'border-box',
          textOverflow: 'ellipsis',
          ...style,
        }}
        value={value || ''}
        title={title || value || 'Selecione o campo da integração ou do sistema'}
        onChange={(e) => onChange(e.target.value)}
      >
        {allowStatic && <option value="">{staticLabel}</option>}
        {!isKnown && <option value={value}>{value} (Campo Personalizado / Legado)</option>}

        {Array.from(categoriesMap.entries()).map(([catName, catFields]) => (
          <optgroup key={catName} label={`Campos: ${catName}`}>
            {catFields.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label} ({f.id})
              </option>
            ))}
          </optgroup>
        ))}

        <optgroup label="Campos do Sistema Witiquetas">
          {SYSTEM_FIELDS.map((sf) => (
            <option key={sf.id} value={sf.id}>
              {sf.label} ({sf.id})
            </option>
          ))}
        </optgroup>
      </select>
    </div>
  );
};

export default FieldPicker;
