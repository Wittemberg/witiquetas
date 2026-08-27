import React from 'react';
import { AlertCircle, FileText } from 'lucide-react';

export interface DataRecord {
  id: string;
  data: Record<string, string>;
}

export interface PrintCenterGridProps {
  records: DataRecord[];
  requiredFields: string[];
  selectedIds: Set<string>;
  quantities: Record<string, number>;
  activeRecordId: string | null;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  onChangeQuantity: (id: string, qty: number) => void;
  onSelectRecord: (id: string) => void;
  searchQuery: string;
  loading?: boolean;
  error?: string | null;
}

/**
 * Formata o nome do cabeçalho da coluna a partir da chave do campo (ex: "retail.description" -> "Descrição")
 */
function formatColumnHeader(fieldId: string): string {
  const parts = fieldId.split('.');
  const rawKey = parts[parts.length - 1];
  const labelMap: Record<string, string> = {
    code: 'Código',
    codigo: 'Código',
    description: 'Descrição',
    descricao: 'Descrição',
    price: 'Preço',
    preco: 'Preço',
    ean: 'EAN / Código de Barras',
    promoPrice: 'Preço Promo',
    promocao: 'Preço Promo',
    unit: 'Unidade',
    unidade: 'Unidade',
    brand: 'Marca',
    patientName: 'Nome do Paciente',
    medicalRecord: 'Prontuário',
    bed: 'Leito',
    doctor: 'Médico',
    bloodType: 'Tipo Sangüíneo',
    orderNumber: 'Pedido',
    trackingCode: 'Rastreio',
    recipient: 'Destinatário',
    address: 'Endereço',
    weightKg: 'Peso (kg)',
  };
  return labelMap[rawKey] || rawKey.toUpperCase();
}

export const PrintCenterGrid: React.FC<PrintCenterGridProps> = ({
  records,
  requiredFields,
  selectedIds,
  quantities,
  activeRecordId,
  onToggleSelect,
  onToggleSelectAll,
  onChangeQuantity,
  onSelectRecord,
  searchQuery,
  loading = false,
  error = null,
}) => {
  // Filtro por texto de busca em todas as propriedades do data record
  const filteredRecords = React.useMemo(() => {
    if (!searchQuery.trim()) return records;
    const query = searchQuery.toLowerCase().trim();
    return records.filter((rec) => {
      return Object.values(rec.data).some((val) =>
        String(val || '').toLowerCase().includes(query)
      );
    });
  }, [records, searchQuery]);

  // Se o modelo não possui bindings de integração ou requiredFields está vazio, exibe colunas padrão
  const effectiveColumns = React.useMemo(() => {
    if (requiredFields && requiredFields.length > 0) {
      return requiredFields;
    }
    return ['retail.code', 'retail.description', 'retail.price', 'retail.ean'];
  }, [requiredFields]);

  const allFilteredSelected =
    filteredRecords.length > 0 &&
    filteredRecords.every((rec) => selectedIds.has(rec.id));

  const handleQuantityInputChange = (
    id: string,
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const rawVal = e.target.value;
    const num = parseInt(rawVal, 10);
    if (isNaN(num) || num < 1) {
      onChangeQuantity(id, 1);
    } else if (num > 999) {
      onChangeQuantity(id, 999);
    } else {
      onChangeQuantity(id, num);
    }
  };

  if (loading) {
    return (
      <div className="print-center-card" style={{ textAlign: 'center', padding: '2rem' }}>
        <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
          Carregando registros do catálogo...
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="print-center-alert-banner">
        <AlertCircle style={{ width: '1.25rem', height: '1.25rem', flexShrink: 0 }} />
        <div>
          <h4 style={{ margin: 0, fontWeight: 600 }}>Erro ao carregar dados</h4>
          <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.8125rem' }}>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="print-center-table-wrapper">
      <table className="print-center-table">
        <thead>
          <tr>
            <th style={{ width: '3rem', textAlign: 'center' }}>
              <input
                type="checkbox"
                checked={allFilteredSelected}
                onChange={onToggleSelectAll}
                className="print-center-checkbox"
                title="Selecionar todos os filtrados"
              />
            </th>
            {effectiveColumns.map((colKey) => (
              <th key={colKey}>{formatColumnHeader(colKey)}</th>
            ))}
            <th style={{ width: '7.5rem', textAlign: 'center' }}>Qtd Etiquetas</th>
          </tr>
        </thead>
        <tbody>
          {filteredRecords.length === 0 ? (
            <tr>
              <td
                colSpan={effectiveColumns.length + 2}
                style={{ textAlign: 'center', padding: '2.5rem 1rem', color: 'var(--text-muted)' }}
              >
                <FileText style={{ width: '2.5rem', height: '2.5rem', margin: '0 auto 0.5rem auto', opacity: 0.5 }} />
                <p style={{ margin: 0, fontWeight: 500, color: 'var(--text-secondary)' }}>
                  Nenhum registro encontrado
                </p>
                {searchQuery && (
                  <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.75rem' }}>
                    Tente ajustar o termo de busca &quot;{searchQuery}&quot;
                  </p>
                )}
              </td>
            </tr>
          ) : (
            filteredRecords.map((record) => {
              const isSelected = selectedIds.has(record.id);
              const isActive = activeRecordId === record.id;
              const qty = quantities[record.id] ?? 1;

              const rowClassName = [
                isActive ? 'print-center-row-active' : '',
                isSelected ? 'print-center-row-selected' : '',
              ]
                .filter(Boolean)
                .join(' ');

              return (
                <tr
                  key={record.id}
                  onClick={() => onSelectRecord(record.id)}
                  className={rowClassName}
                >
                  <td
                    style={{ textAlign: 'center' }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => onToggleSelect(record.id)}
                      className="print-center-checkbox"
                    />
                  </td>
                  {effectiveColumns.map((colKey) => (
                    <td key={colKey} style={{ maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {record.data[colKey] !== undefined && record.data[colKey] !== ''
                        ? record.data[colKey]
                        : '-'}
                    </td>
                  ))}
                  <td
                    style={{ textAlign: 'center' }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="number"
                      min={1}
                      max={999}
                      step={1}
                      value={qty}
                      onChange={(e) => handleQuantityInputChange(record.id, e)}
                      className="print-center-qty-input"
                    />
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
};
