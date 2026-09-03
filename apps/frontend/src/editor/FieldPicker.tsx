import React, { useMemo } from 'react';
import {
  CANONICAL_FIELDS,
  SYSTEM_FIELDS,
  IntegrationFieldDefinition,
  getIntegrationFieldsByNiche,
  getFieldDefinition,
} from '@witiquetas/label-schema';

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
  nicheId?: string;
  activeFields?: IntegrationFieldDefinition[];
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
  nicheId,
  activeFields,
}) => {
  const fields = useMemo(() => {
    if (activeFields && activeFields.length > 0) return activeFields;
    return getIntegrationFieldsByNiche(nicheId);
  }, [activeFields, nicheId]);

  const knownExtra = useMemo(() => {
    if (!value || fields.some((f) => f.id === value) || SYSTEM_FIELDS.some((f) => f.id === value)) return null;
    return getFieldDefinition(value);
  }, [value, fields]);

  const isKnown = !value || fields.some((f) => f.id === value) || SYSTEM_FIELDS.some((f) => f.id === value) || Boolean(knownExtra);

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
        {knownExtra && <option value={value}>{knownExtra.label} ({value})</option>}
        {!isKnown && <option value={value}>{value} (Campo Personalizado)</option>}

        <optgroup label="Campos da Integração">
          {fields.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label} ({f.id})
            </option>
          ))}
        </optgroup>

        <optgroup label="Campos do Sistema Witiquetas">
          {SYSTEM_FIELDS.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label} ({f.id})
            </option>
          ))}
        </optgroup>
      </select>
    </div>
  );
};

export default FieldPicker;
