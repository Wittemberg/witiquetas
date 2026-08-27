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
      <div className="print-center-grid-container p-8 text-center text-gray-400">
        <div className="animate-spin inline-block w-8 h-8 border-4 border-current border-t-transparent text-indigo-500 rounded-full mb-3" />
        <p className="text-sm font-medium">Carregando registros do catálogo...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="print-center-grid-container p-6 bg-red-900/20 border border-red-500/40 rounded-lg text-red-300 flex items-center gap-3">
        <AlertCircle className="w-6 h-6 text-red-400 flex-shrink-0" />
        <div>
          <h4 className="font-semibold text-sm">Erro ao carregar dados</h4>
          <p className="text-xs text-red-400 mt-0.5">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="print-center-grid-wrapper overflow-x-auto border border-gray-700/60 rounded-xl bg-gray-900/50 shadow-inner">
      <table className="w-full text-left border-collapse text-sm text-gray-200">
        <thead>
          <tr className="bg-gray-800/80 border-b border-gray-700/80 text-xs font-semibold uppercase tracking-wider text-gray-400">
            <th className="py-3 px-4 w-12 text-center">
              <input
                type="checkbox"
                checked={allFilteredSelected}
                onChange={onToggleSelectAll}
                className="w-4 h-4 rounded border-gray-600 text-indigo-600 focus:ring-indigo-500 bg-gray-700 cursor-pointer"
                title="Selecionar todos os filtrados"
              />
            </th>
            {effectiveColumns.map((colKey) => (
              <th key={colKey} className="py-3 px-4 font-medium">
                {formatColumnHeader(colKey)}
              </th>
            ))}
            <th className="py-3 px-4 w-32 text-center font-medium">Qtd Etiquetas</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-800/60">
          {filteredRecords.length === 0 ? (
            <tr>
              <td
                colSpan={effectiveColumns.length + 2}
                className="py-10 text-center text-gray-500"
              >
                <FileText className="w-10 h-10 mx-auto text-gray-600 mb-2 opacity-50" />
                <p className="text-base font-medium text-gray-400">Nenhum registro encontrado</p>
                {searchQuery && (
                  <p className="text-xs text-gray-500 mt-1">
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

              return (
                <tr
                  key={record.id}
                  onClick={() => onSelectRecord(record.id)}
                  className={`transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-indigo-950/40 border-l-4 border-l-indigo-500'
                      : isSelected
                      ? 'bg-gray-800/40 hover:bg-gray-800/70'
                      : 'hover:bg-gray-800/30'
                  }`}
                >
                  <td
                    className="py-3 px-4 text-center"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => onToggleSelect(record.id)}
                      className="w-4 h-4 rounded border-gray-600 text-indigo-600 focus:ring-indigo-500 bg-gray-700 cursor-pointer"
                    />
                  </td>
                  {effectiveColumns.map((colKey) => (
                    <td key={colKey} className="py-3 px-4 text-gray-200 font-normal truncate max-w-xs">
                      {record.data[colKey] !== undefined && record.data[colKey] !== ''
                        ? record.data[colKey]
                        : '-'}
                    </td>
                  ))}
                  <td
                    className="py-3 px-4 text-center"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="number"
                      min={1}
                      max={999}
                      step={1}
                      value={qty}
                      onChange={(e) => handleQuantityInputChange(record.id, e)}
                      className="w-20 px-2 py-1 bg-gray-800 border border-gray-600 rounded text-center text-sm font-semibold text-gray-100 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
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
