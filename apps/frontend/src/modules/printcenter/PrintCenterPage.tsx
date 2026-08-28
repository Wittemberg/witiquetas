import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  Printer,
  FileText,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Send,
  X,
  Database,
  Filter,
} from 'lucide-react';
import {
  getRequiredIntegrationFields,
  normalizeNicheId,
  CANONICAL_NICHE_PROFILES,
} from '@witiquetas/label-schema';
import type {
  TemplateSummaryDTO,
  TemplateDTO,
  PrinterDTO,
  AgentDTO,
  PrintJobBatchDTO,
  BatchPrintRequestDTO,
} from '@witiquetas/contracts';
import { PrintCenterGrid, type DataRecord } from './PrintCenterGrid.js';
import { templatesApi } from '../../services/templatesApi.js';
import { printersApi } from '../../services/printersApi.js';
import { agentsApi } from '../../services/agentsApi.js';
import { build_api_url } from '../../config/api.js';
import { PrintPreview } from './PrintPreview.js';

const INITIAL_DATA_RECORDS: DataRecord[] = [
  {
    id: 'rec-1001',
    data: {
      'retail.code': '789123',
      'retail.description': 'REFRIGERANTE COCA-COLA 2L',
      'retail.ean': '7894900011517',
      'retail.price': '9.99',
      'retail.promoPrice': '7.99',
      'retail.unit': 'UN',
      'retail.brand': 'COCA-COLA',
      'produto.codigo': '789123',
      'produto.descricao': 'REFRIGERANTE COCA-COLA 2L',
      'produto.preco': '9.99',
      'produto.promocao': '7.99',
      'produto.ean': '7894900011517',
    },
  },
  {
    id: 'rec-1002',
    data: {
      'retail.code': '789124',
      'retail.description': 'REFRIGERANTE GUARANÁ ANTARCTICA 2L',
      'retail.ean': '7891000100103',
      'retail.price': '8.49',
      'retail.promoPrice': '6.99',
      'retail.unit': 'UN',
      'retail.brand': 'ANTARCTICA',
      'produto.codigo': '789124',
      'produto.descricao': 'REFRIGERANTE GUARANÁ ANTARCTICA 2L',
      'produto.preco': '8.49',
      'produto.promocao': '6.99',
      'produto.ean': '7891000100103',
    },
  },
  {
    id: 'rec-1003',
    data: {
      'retail.code': '789125',
      'retail.description': 'ARROZ BRANCO TIPO 1 CAMIL 5KG',
      'retail.ean': '7896006700011',
      'retail.price': '27.90',
      'retail.promoPrice': '24.90',
      'retail.unit': 'PCT',
      'retail.brand': 'CAMIL',
      'produto.codigo': '789125',
      'produto.descricao': 'ARROZ BRANCO TIPO 1 CAMIL 5KG',
      'produto.preco': '27.90',
      'produto.promocao': '24.90',
      'produto.ean': '7896006700011',
    },
  },
];

export function getRecordsForNiche(nicheId: string): DataRecord[] {
  const norm = normalizeNicheId(nicheId);
  switch (norm) {
    case 'hospital':
      return [
        {
          id: 'rec-hosp-1',
          data: {
            'paciente.nome': 'MARIA APARECIDA SILVA',
            'paciente.id': 'PAC-847291',
            'paciente.dataNascimento': '14/03/1982',
            'paciente.sexo': 'F',
            'atendimento.id': 'ATD-2026-9041',
            'atendimento.setor': 'ENFERMARIA',
            'atendimento.leito': '304-B',
            'hospital.nome': 'HOSPITAL SANTA CRUZ',
          },
        },
        {
          id: 'rec-hosp-2',
          data: {
            'paciente.nome': 'JOÃO PEDRO SANTOS',
            'paciente.id': 'PAC-847292',
            'paciente.dataNascimento': '22/11/1975',
            'paciente.sexo': 'M',
            'atendimento.id': 'ATD-2026-9042',
            'atendimento.setor': 'UTI ADULTO',
            'atendimento.leito': 'UTI-08',
            'hospital.nome': 'HOSPITAL SANTA CRUZ',
          },
        },
      ];

    case 'laboratory':
      return [
        {
          id: 'rec-lab-1',
          data: {
            'paciente.nome': 'JOÃO CARLOS PEREIRA',
            'paciente.id': 'PAC-49102',
            'coleta.id': 'COL-88412',
            'coleta.dataHora': '28/08/2026 08:35',
            'amostra.tipo': 'SORO / SANGUE TOTAL',
            'exame.codigo': 'HEM-01',
            'exame.nome': 'HEMOGRAMA COMPLETO',
            'laboratorio.nome': 'LABORATÓRIO CENTRAL',
          },
        },
        {
          id: 'rec-lab-2',
          data: {
            'paciente.nome': 'MARIA FERNANDA LIMA',
            'paciente.id': 'PAC-49103',
            'coleta.id': 'COL-88413',
            'coleta.dataHora': '28/08/2026 09:10',
            'amostra.tipo': 'URINA ISOLADA',
            'exame.codigo': 'EAS-02',
            'exame.nome': 'URINA TIPO 1 (EAS)',
            'laboratorio.nome': 'LABORATÓRIO CENTRAL',
          },
        },
      ];

    case 'logistics':
      return [
        {
          id: 'rec-log-1',
          data: {
            'produto.descricao': 'CAIXA PRODUTO ACABADO',
            'produto.gtin': '07891234567890',
            'lote.numero': 'LT260828A',
            'lote.validade': '28/02/2027',
            'quantidade': '50',
            'unidade': 'CX',
            'sscc': '178912345678901234',
            'destino': 'CENTRO DE DISTRIBUIÇÃO SP',
            'origem': 'FÁBRICA MATRIZ',
            'logistics.orderNumber': 'PED-99482',
            'logistics.trackingCode': 'BR884910293PT',
          },
        },
        {
          id: 'rec-log-2',
          data: {
            'produto.descricao': 'PALETE COMPONENTES ELETRÔNICOS',
            'produto.gtin': '07891234567891',
            'lote.numero': 'LT260828B',
            'lote.validade': '31/12/2027',
            'quantidade': '120',
            'unidade': 'PL',
            'sscc': '178912345678901235',
            'destino': 'UNIDADE CAMPINAS',
            'origem': 'FÁBRICA MATRIZ',
            'logistics.orderNumber': 'PED-99483',
            'logistics.trackingCode': 'BR884910294PT',
          },
        },
      ];

    case 'industry':
      return [
        {
          id: 'rec-ind-1',
          data: {
            'produto.codigo': 'PRD-8840',
            'produto.descricao': 'PLACA ELETRÔNICA PRINCIPAL',
            'lote.numero': 'LT-IND-2026',
            'ordemProducao': 'OP-4491',
            'dataFabricacao': '28/08/2026',
            'dataValidade': '28/08/2031',
            'operador': 'MARCOS SOUZA',
            'linhaProducao': 'LINHA 02 - MONTAGEM',
          },
        },
        {
          id: 'rec-ind-2',
          data: {
            'produto.codigo': 'PRD-8841',
            'produto.descricao': 'CHASSIS METÁLICO REFORÇADO',
            'lote.numero': 'LT-IND-2027',
            'ordemProducao': 'OP-4492',
            'dataFabricacao': '28/08/2026',
            'dataValidade': '28/08/2031',
            'operador': 'ANA SILVA',
            'linhaProducao': 'LINHA 01 - ESTAMPAGEM',
          },
        },
      ];

    case 'food':
      return [
        {
          id: 'rec-food-1',
          data: {
            'produto.descricao': 'QUEIJO MUSSARELA FATIADO',
            'lote.numero': 'LT-ALM-102',
            'dataFabricacao': '28/08/2026',
            'dataValidade': '15/09/2026',
            'peso': '0.450 kg',
            'preco': '18.90',
            'ingredientes': 'Leite pasteurizado, fermento lácteo, sal e coalho.',
          },
        },
        {
          id: 'rec-food-2',
          data: {
            'produto.descricao': 'PRESUNTO COZIDO FATIADO',
            'lote.numero': 'LT-ALM-103',
            'dataFabricacao': '28/08/2026',
            'dataValidade': '10/09/2026',
            'peso': '0.300 kg',
            'preco': '12.50',
            'ingredientes': 'Carne suína, água, sal, condimentos e conservantes.',
          },
        },
      ];

    case 'pharmacy':
      return [
        {
          id: 'rec-phar-1',
          data: {
            'medicamento.nome': 'AMOXICILINA 500MG',
            'medicamento.principioAtivo': 'AMOXICILINA TRI-HIDRATADA',
            'medicamento.lote': 'FAR-2026-X',
            'medicamento.validade': '31/12/2027',
            'medicamento.registro': 'MS 1.0043.0912',
            'medicamento.codigo': '7896004701122',
            'fabricante': 'FARMACÊUTICA BRASIL S.A.',
          },
        },
        {
          id: 'rec-phar-2',
          data: {
            'medicamento.nome': 'PARACETAMOL 750MG',
            'medicamento.principioAtivo': 'PARACETAMOL',
            'medicamento.lote': 'FAR-2026-Y',
            'medicamento.validade': '30/06/2028',
            'medicamento.registro': 'MS 1.0043.0913',
            'medicamento.codigo': '7896004701123',
            'fabricante': 'FARMACÊUTICA BRASIL S.A.',
          },
        },
      ];

    case 'retail':
    default:
      return INITIAL_DATA_RECORDS;
  }
}

export const PrintCenterPage: React.FC = () => {
  // Filtro de Nicho (PACOTE 4.5) - Padrão "all" para listar todos os modelos
  const [selectedNicheId, setSelectedNicheId] = useState<string>('all');

  // Modelos e Seleção
  const [templateSummaries, setTemplateSummaries] = useState<TemplateSummaryDTO[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateDTO | null>(null);

  // Impressoras e Agente
  const [printers, setPrinters] = useState<PrinterDTO[]>([]);
  const [selectedPrinterId, setSelectedPrinterId] = useState<string>('');
  const [agentsMap, setAgentsMap] = useState<Map<string, AgentDTO>>(new Map());

  // Nicho Efetivo (Se "all", usa o nicheId do modelo selecionado)
  const effectiveNicheId = useMemo(() => {
    if (selectedNicheId && selectedNicheId !== 'all') {
      return normalizeNicheId(selectedNicheId);
    }
    if (selectedTemplate) {
      return normalizeNicheId(
        selectedTemplate.nicheId ||
          selectedTemplate.nicheName ||
          (selectedTemplate.document && selectedTemplate.document.nicheId)
      );
    }
    return 'retail';
  }, [selectedNicheId, selectedTemplate]);

  // Registros Ativos por Nicho
  const records = useMemo(() => {
    return getRecordsForNiche(effectiveNicheId);
  }, [effectiveNicheId]);

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [activeRecordId, setActiveRecordId] = useState<string | null>(null);

  // Quantidade em Lote
  const [batchQuantityInput, setBatchQuantityInput] = useState<number>(1);

  // Modais e Feedback
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [batchResult, setBatchResult] = useState<PrintJobBatchDTO | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loadingInitial, setLoadingInitial] = useState<boolean>(true);

  // Modelos Filtrados pelo Nicho Selecionado
  const filteredTemplateSummaries = useMemo(() => {
    if (!selectedNicheId || selectedNicheId === 'all') return templateSummaries;
    const norm = normalizeNicheId(selectedNicheId);
    return templateSummaries.filter((t) => normalizeNicheId(t.nicheId || t.nicheName) === norm);
  }, [templateSummaries, selectedNicheId]);

  // REGRA DE INVALIDAÇÃO DE NICHO (Adendo 5):
  // Trocar de nicho invalida modelo incompatível e reseta dataset/seleções
  useEffect(() => {
    if (selectedNicheId && selectedNicheId !== 'all') {
      const isCurrentValid = filteredTemplateSummaries.some((t) => t.id === selectedTemplateId);
      if (!isCurrentValid) {
        if (filteredTemplateSummaries.length > 0) {
          setSelectedTemplateId(filteredTemplateSummaries[0].id);
        } else {
          setSelectedTemplateId('');
          setSelectedTemplate(null);
        }
        // Limpar seleções de registros anteriores
        setSelectedIds(new Set());
        setQuantities({});
        setActiveRecordId(null);
      }
    }
  }, [selectedNicheId, filteredTemplateSummaries, selectedTemplateId]);

  // Carregamento Inicial de Modelos, Impressoras e Agentes
  const loadInitialData = useCallback(async () => {
    setLoadingInitial(true);
    setErrorMessage(null);
    try {
      // 1. Modelos
      const tpls = await templatesApi.listTemplates();
      setTemplateSummaries(tpls);
      if (tpls.length > 0 && !selectedTemplateId) {
        setSelectedTemplateId(tpls[0].id);
      }

      // 2. Impressoras
      const prts = await printersApi.listPrinters();
      setPrinters(prts);
      if (prts.length > 0 && !selectedPrinterId) {
        const defaultPrtr = prts.find((p) => p.isDefault) || prts[0];
        setSelectedPrinterId(defaultPrtr.id);
      }

      // 3. Agentes
      const agts = await agentsApi.listAgents();
      const map = new Map<string, AgentDTO>();
      agts.forEach((a) => map.set(a.id, a));
      setAgentsMap(map);
    } catch (err: any) {
      setErrorMessage(err.message || 'Erro ao carregar dados da Central de Impressão.');
    } finally {
      setLoadingInitial(false);
    }
  }, []);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  // Carregar documento completo do modelo selecionado
  useEffect(() => {
    if (!selectedTemplateId) {
      setSelectedTemplate(null);
      return;
    }
    let isMounted = true;
    templatesApi
      .getTemplateById(selectedTemplateId)
      .then((fullTpl) => {
        if (isMounted) {
          if (fullTpl && fullTpl.document) {
            setSelectedTemplate(fullTpl);
          } else {
            setSelectedTemplate(null);
          }
        }
      })
      .catch((err) => {
        console.warn(`Modelo de etiqueta '${selectedTemplateId}' não encontrado:`, err);
        if (isMounted) {
          setSelectedTemplate(null);
          setSelectedTemplateId('');
        }
      });
    return () => {
      isMounted = false;
    };
  }, [selectedTemplateId]);

  // Extrair campos de integração usados pelo documento
  const requiredFields = useMemo(() => {
    if (selectedTemplate && selectedTemplate.document) {
      const extracted = getRequiredIntegrationFields(selectedTemplate.document);
      if (extracted.length > 0) return extracted;
    }
    return getIntegrationFieldsByNiche(effectiveNicheId).slice(0, 5).map((f) => f.id);
  }, [selectedTemplate, effectiveNicheId]);

  // Impressora Selecionada
  const selectedPrinter = useMemo(() => {
    return printers.find((p) => p.id === selectedPrinterId) || null;
  }, [printers, selectedPrinterId]);

  // Status do Agente associado à impressora
  const agentStatus = useMemo(() => {
    if (!selectedPrinter) return { online: false, text: 'Offline' };
    if (selectedPrinter.protocol === 'RAW_TCP') {
      const hasHost = !!selectedPrinter.host?.trim();
      return { online: hasHost, text: hasHost ? 'RAW TCP Online' : 'IP Não Configurado' };
    }
    if (!selectedPrinter.agentId) {
      return { online: true, text: 'Dispositivo Direto' };
    }
    const agent = agentsMap.get(selectedPrinter.agentId);
    if (!agent) return { online: false, text: 'Offline' };
    const isOnline = agent.status === 'ONLINE';
    return { online: isOnline, text: isOnline ? 'Online' : 'Offline' };
  }, [selectedPrinter, agentsMap]);

  // Alternar Seleção de Registro Individual
  const handleToggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  // Selecionar / Desmarcar Todos os Registros Filtrados
  const handleToggleSelectAll = useCallback(() => {
    const query = searchQuery.toLowerCase().trim();
    const filtered = query
      ? records.filter((rec) =>
          Object.values(rec.data).some((val) => String(val || '').toLowerCase().includes(query))
        )
      : records;

    setSelectedIds((prev) => {
      const next = new Set(prev);
      const allSelected = filtered.length > 0 && filtered.every((r) => next.has(r.id));
      if (allSelected) {
        filtered.forEach((r) => next.delete(r.id));
      } else {
        filtered.forEach((r) => next.add(r.id));
      }
      return next;
    });
  }, [records, searchQuery]);

  // Alterar Quantidade de um Registro Específico
  const handleChangeQuantity = useCallback((id: string, qty: number) => {
    const validQty = Math.max(1, Math.min(999, Math.floor(qty || 1)));
    setQuantities((prev) => ({
      ...prev,
      [id]: validQty,
    }));
  }, []);

  // Aplicar Quantidade em Lote a Todos os Selecionados
  const handleApplyBatchQuantity = useCallback(() => {
    const qty = Math.max(1, Math.min(999, Math.floor(batchQuantityInput || 1)));
    setQuantities((prev) => {
      const next = { ...prev };
      selectedIds.forEach((id) => {
        next[id] = qty;
      });
      return next;
    });
  }, [batchQuantityInput, selectedIds]);

  // Totais de Registros e Etiquetas Selecionadas
  const totalSelectedRecords = selectedIds.size;
  const totalSelectedLabels = useMemo(() => {
    let sum = 0;
    selectedIds.forEach((id) => {
      sum += quantities[id] ?? 1;
    });
    return sum;
  }, [selectedIds, quantities]);

  // Registro Ativo para Prévia
  const activeRecord = useMemo(() => {
    if (activeRecordId) {
      const rec = records.find((r) => r.id === activeRecordId);
      if (rec) return rec;
    }
    if (selectedIds.size > 0) {
      const firstId = Array.from(selectedIds)[0];
      return records.find((r) => r.id === firstId) || records[0];
    }
    return records[0] || null;
  }, [activeRecordId, records, selectedIds]);

  // Validação para habilitar o botão de Envio (Garante consistência de Nicho)
  const isPrintButtonEnabled = useMemo(() => {
    if (!selectedTemplateId || !selectedTemplate) return false;
    if (!selectedPrinterId) return false;
    if (!agentStatus.online) return false;
    if (totalSelectedRecords < 1) return false;
    if (totalSelectedLabels < 1) return false;

    // Trava de Segurança (Adendo 5): Impedir impressão se modelo for inconsistente com nicho ativo
    if (selectedNicheId && selectedNicheId !== 'all') {
      const tplNiche = normalizeNicheId(selectedTemplate.nicheId || selectedTemplate.nicheName);
      if (tplNiche !== normalizeNicheId(selectedNicheId)) return false;
    }

    return true;
  }, [selectedTemplateId, selectedTemplate, selectedPrinterId, agentStatus.online, totalSelectedRecords, totalSelectedLabels, selectedNicheId]);

  // Submeter Lote de Impressão ao Backend
  const handleConfirmPrintBatch = async () => {
    if (!selectedTemplateId || !selectedPrinterId || totalSelectedRecords < 1) return;

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const itemsToSubmit = Array.from(selectedIds).map((id) => {
        const rec = records.find((r) => r.id === id);
        return {
          sourceRecordId: id,
          data: (rec?.data || {}) as Record<string, unknown>,
          quantity: quantities[id] ?? 1,
        };
      });

      const payload: BatchPrintRequestDTO = {
        templateId: selectedTemplateId,
        printerId: selectedPrinterId,
        items: itemsToSubmit,
      };

      const res = await fetch(build_api_url('/api/print-jobs/batch'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-company-id': 'comp-default',
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Falha ao criar lote de impressão.');
      }

      setBatchResult(data.batch);
      setIsConfirmModalOpen(false);
    } catch (err: any) {
      setErrorMessage(err.message || 'Erro inesperado ao criar o lote de impressão.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Resetar Formulário para Nova Impressão
  const handleNewPrintJob = () => {
    setBatchResult(null);
    setErrorMessage(null);
    setSelectedIds(new Set());
    setQuantities({});
  };

  return (
    <div className="print-center-page">
      {/* CABEÇALHO DO MÓDULO */}
      <div className="print-center-header">
        <div className="print-center-title-container">
          <h1>
            <Printer className="print-center-icon-blue" style={{ width: '1.75rem', height: '1.75rem' }} />
            Central de Impressão Universal Multi-Nicho
          </h1>
          <p>
            Selecione o nicho de operação, o modelo compatível e envie lotes de etiquetas com dados reais.
          </p>
        </div>
        <button
          onClick={loadInitialData}
          disabled={loadingInitial}
          className="print-center-btn print-center-btn-secondary"
        >
          <RefreshCw style={{ width: '0.875rem', height: '0.875rem' }} className={loadingInitial ? 'animate-spin' : ''} />
          Atualizar Dados
        </button>
      </div>

      {/* BANNER DE ERRO SE EXISTIR */}
      {errorMessage && (
        <div className="print-center-alert-banner">
          <AlertTriangle style={{ width: '1.25rem', height: '1.25rem', flexShrink: 0, marginTop: '0.125rem' }} />
          <div style={{ flex: 1 }}>
            <h4 style={{ margin: 0, fontWeight: 600 }}>Aviso da Central</h4>
            <p style={{ margin: '0.25rem 0 0 0' }}>{errorMessage}</p>
          </div>
          <button
            onClick={() => setErrorMessage(null)}
            style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}
          >
            <X style={{ width: '1rem', height: '1rem' }} />
          </button>
        </div>
      )}

      {/* FEEDBACK DE SUCESSO DE BATCH CRIADO */}
      {batchResult ? (
        <div className="print-center-success-banner">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <CheckCircle2 style={{ width: '2rem', height: '2rem', color: 'var(--status-success)', flexShrink: 0 }} />
            <div>
              <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                Lote de Impressão Enviado com Sucesso!
              </h3>
              <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                ID do Lote: <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--text-primary)' }}>{batchResult.id}</span>
              </p>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '1rem', background: 'var(--bg-input)', padding: '1rem', borderRadius: '0.5rem', border: '1px solid var(--border-color)' }}>
            <div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>Total Registros:</span>
              <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>{batchResult.totalRecords}</span>
            </div>
            <div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>Total Etiquetas:</span>
              <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--accent-blue)' }}>{batchResult.totalLabels}</span>
            </div>
            <div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>Status Atual:</span>
              <span className="print-center-badge print-center-badge-online" style={{ marginTop: '0.25rem' }}>
                {batchResult.status}
              </span>
            </div>
            <div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>Criado em:</span>
              <span style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>{new Date(batchResult.createdAt).toLocaleTimeString()}</span>
            </div>
          </div>

          <div style={{ display: 'flex', justifySelf: 'end', alignSelf: 'end' }}>
            <button
              onClick={handleNewPrintJob}
              className="print-center-btn print-center-btn-primary"
            >
              <Send style={{ width: '1rem', height: '1rem' }} />
              Nova Impressão
            </button>
          </div>
        </div>
      ) : (
        /* CORPO DA CENTRAL (SELEÇÃO, BUSCA, GRID E PREVIEW) */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* BARRA SUPERIOR DE SELEÇÃO: NICHO, MODELO, ORIGEM, IMPRESSORA & AGENT */}
          <div className="print-center-config-card">
            {/* 0. SELEÇÃO DE NICHO OPERACIONAL (PACOTE 4.5) */}
            <div className="print-center-field-group">
              <label className="print-center-label">
                <Filter style={{ width: '0.875rem', height: '0.875rem' }} className="print-center-icon-blue" />
                Nicho Operacional
              </label>
              <select
                value={selectedNicheId}
                onChange={(e) => setSelectedNicheId(e.target.value)}
                className="print-center-select"
              >
                {CANONICAL_NICHE_PROFILES.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
                <option value="all">Todos os Nichos</option>
              </select>
            </div>

            {/* 1. SELEÇÃO DE MODELO (Filtrado pelo Nicho) */}
            <div className="print-center-field-group">
              <label className="print-center-label">
                <FileText style={{ width: '0.875rem', height: '0.875rem' }} className="print-center-icon-blue" />
                Modelo de Etiqueta
              </label>
              <select
                value={selectedTemplateId}
                onChange={(e) => setSelectedTemplateId(e.target.value)}
                className="print-center-select"
              >
                {filteredTemplateSummaries.length === 0 ? (
                  <option value="">Nenhum modelo para o nicho selecionado</option>
                ) : (
                  filteredTemplateSummaries.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title} ({t.widthMm}x{t.heightMm}mm - {t.printerLanguage})
                    </option>
                  ))
                )}
              </select>
            </div>

            {/* 2. ORIGEM DE DADOS / FONTE */}
            <div className="print-center-field-group">
              <label className="print-center-label">
                <Database style={{ width: '0.875rem', height: '0.875rem' }} className="print-center-icon-blue" />
                Origem de Dados
              </label>
              <select defaultValue="mock-catalog" className="print-center-select">
                <option value="mock-catalog">Dados de Homologação ({CANONICAL_NICHE_PROFILES.find((p) => p.id === effectiveNicheId)?.name || 'Multi-Nicho'})</option>
              </select>
            </div>

            {/* 3. SELEÇÃO DE IMPRESSORA E STATUS DO AGENT */}
            <div className="print-center-field-group">
              <div className="print-center-label-row">
                <label className="print-center-label">
                  <Printer style={{ width: '0.875rem', height: '0.875rem' }} className="print-center-icon-blue" />
                  Impressora Destino
                </label>
                <span
                  className={`print-center-badge ${
                    agentStatus.online ? 'print-center-badge-online' : 'print-center-badge-offline'
                  }`}
                >
                  <span className="print-center-badge-dot" />
                  {agentStatus.text}
                </span>
              </div>
              <select
                value={selectedPrinterId}
                onChange={(e) => setSelectedPrinterId(e.target.value)}
                className="print-center-select"
              >
                {printers.length === 0 ? (
                  <option value="">Nenhuma impressora cadastrada</option>
                ) : (
                  printers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.language} - {p.protocol})
                    </option>
                  ))
                )}
              </select>
            </div>
          </div>

          {/* ÁREA PRINCIPAL DIVIDIDA: GRID DE REGISTROS (ESQUERDA) E PRÉVIA CONTEXTUAL (DIREITA) */}
          <div className="print-center-main-grid">
            {/* PAINEL ESQUERDO: BARRA DE FERRAMENTAS E TABELA DE DATAGRID */}
            <div className="print-center-records-panel">
              <PrintCenterGrid
                records={records}
                requiredFields={requiredFields}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                selectedIds={selectedIds}
                quantities={quantities}
                onToggleSelect={handleToggleSelect}
                onToggleSelectAll={handleToggleSelectAll}
                onChangeQuantity={handleChangeQuantity}
                batchQuantityInput={batchQuantityInput}
                onBatchQuantityInputChange={setBatchQuantityInput}
                onApplyBatchQuantity={handleApplyBatchQuantity}
                activeRecordId={activeRecordId}
                onSetActiveRecordId={setActiveRecordId}
              />
            </div>

            {/* PAINEL DIREITO: VISUALIZADOR DE PRÉVIA CONTEXTUAL E AÇÕES */}
            <div className="print-center-preview-panel">
              <PrintPreview
                document={selectedTemplate?.document || null}
                activeRecord={activeRecord?.data || null}
                totalSelectedRecords={totalSelectedRecords}
                totalSelectedLabels={totalSelectedLabels}
                selectedPrinterName={selectedPrinter?.name || 'Selecione a Impressora'}
                isPrintEnabled={isPrintButtonEnabled}
                onOpenConfirmModal={() => setIsConfirmModalOpen(true)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PrintCenterPage;

