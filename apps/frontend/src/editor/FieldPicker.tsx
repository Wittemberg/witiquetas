import React, { useMemo } from 'react';
import {
  CANONICAL_FIELDS,
  SYSTEM_FIELDS,
  IntegrationFieldDefinition,
  getIntegrationFieldsByNiche,
  getFieldDefinition,
} from '@witiquetas/label-schema';
import { isFieldAllowed, getFieldAvailability } from '../auth/session.js';

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
  const rawFields = useMemo(() => {
    if (activeFields && activeFields.length > 0) return activeFields;
    return getIntegrationFieldsByNiche(nicheId);
  }, [activeFields, nicheId]);

  // Filtra campos de integração habilitados na configuração efetiva para o nicho (Fail-Safe)
  const fields = useMemo(() => {
    return rawFields.filter((f) => isFieldAllowed(nicheId, f.id));
  }, [rawFields, nicheId]);

  // Preservação de Binding Existente Desabilitado (EXISTING_DISABLED_BINDING - Regra P0)
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
        {knownExtra && (
          <option value={value} style={{ color: 'var(--status-warning)' }}>
            {knownExtra.label} ({value}) — Desabilitado na política
          </option>
        )}
        {!isKnown && <option value={value}>{value} (Campo Personalizado)</option>}

        <optgroup label="Campos da Integração">
          {fields.map((f) => {
            const avail = getFieldAvailability(nicheId, f.id);
            const integrationTag = avail.integration ? ' [Integração]' : '';
            return (
              <option key={f.id} value={f.id}>
                {f.label} ({f.id}){integrationTag}
              </option>
            );
          })}
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
