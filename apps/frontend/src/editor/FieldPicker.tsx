import React, { useMemo } from 'react';
import { CANONICAL_FIELDS, CanonicalFieldDefinition } from '@witiquetas/label-schema';

export interface FieldPickerProps {
  value: string;
  onChange: (value: string) => void;
  allowStatic?: boolean;
  staticLabel?: string;
  label?: string;
  placeholder?: string;
  className?: string;
  style?: React.CSSProperties;
  title?: string;
  id?: string;
  activeFields?: CanonicalFieldDefinition[];
}

export const FieldPicker: React.FC<FieldPickerProps> = ({
  value,
  onChange,
  allowStatic = true,
  staticLabel = '-- Texto Estático Manual --',
  label,
  className = 'inspector-select',
  style,
  title,
  id,
  activeFields,
}) => {
  const fields = activeFields || CANONICAL_FIELDS;

  const categoriesMap = useMemo(() => {
    const map = new Map<string, CanonicalFieldDefinition[]>();
    (fields || []).forEach((f) => {
      const catKey = f.category || 'outros';
      const existing = map.get(catKey) || [];
      existing.push(f);
      map.set(catKey, existing);
    });
    return map;
  }, [fields]);

  const integrationFields = fields.filter((f) =>
    ['produto', 'empresa', 'promocao', 'varejo', 'hospital', 'logistica'].includes(f.category)
  );
  const systemFields = fields.filter((f) =>
    ['sistema', 'impressao'].includes(f.category)
  );

  const isKnown = !value || fields.some((f) => f.key === value);

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
        {!isKnown && <option value={value}>{value} (Campo Personalizado)</option>}

        <optgroup label="Campos da Integração">
          {integrationFields.map((f) => (
            <option key={f.key} value={f.key}>
              {f.label} ({f.key})
            </option>
          ))}
        </optgroup>

        <optgroup label="Campos do Sistema Witiquetas">
          {systemFields.map((f) => (
            <option key={f.key} value={f.key}>
              {f.label} ({f.key})
            </option>
          ))}
        </optgroup>
      </select>
    </div>
  );
};

export default FieldPicker;
