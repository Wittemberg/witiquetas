import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  Printer,
  FileText,
  Search,
  CheckSquare,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Eye,
  Send,
  X,
  Database,
  Layers,
} from 'lucide-react';
import {
  getRequiredIntegrationFields,
  MOCK_PRODUCT_DATA,
  resolveFieldValue,
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

// Base de Dados Sintética de Teste para Operação Comercial (Varejo, Hospitalar, Logística)
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
  {
    id: 'rec-1004',
    data: {
      'retail.code': '789126',
      'retail.description': 'FEIJÃO CARIOCA KICALDO 1KG',
      'retail.ean': '7896023400122',
      'retail.price': '7.89',
      'retail.promoPrice': '6.50',
      'retail.unit': 'PCT',
      'retail.brand': 'KICALDO',
      'produto.codigo': '789126',
      'produto.descricao': 'FEIJÃO CARIOCA KICALDO 1KG',
      'produto.preco': '7.89',
      'produto.promocao': '6.50',
      'produto.ean': '7896023400122',
    },
  },
  {
    id: 'rec-1005',
    data: {
      'retail.code': '789127',
      'retail.description': 'AÇÚCAR REFINADO UNIÃO 1KG',
      'retail.ean': '7896012300054',
      'retail.price': '4.59',
      'retail.promoPrice': '3.99',
      'retail.unit': 'PCT',
      'retail.brand': 'UNIÃO',
      'produto.codigo': '789127',
      'produto.descricao': 'AÇÚCAR REFINADO UNIÃO 1KG',
      'produto.preco': '4.59',
      'produto.promocao': '3.99',
      'produto.ean': '7896012300054',
    },
  },
  {
    id: 'rec-2001',
    data: {
      'hospital.patientName': 'MARIA DA SILVA SOUZA',
      'hospital.medicalRecord': 'PAC-2026-8841',
      'hospital.bed': 'LEITO 402-A',
      'hospital.doctor': 'DRA. CARLA MENDES',
      'hospital.bloodType': 'O POSITIVO (O+)',
    },
  },
  {
    id: 'rec-3001',
    data: {
      'logistics.orderNumber': 'PED-99482',
      'logistics.trackingCode': 'BR884910293PT',
      'logistics.recipient': 'JOÃO PEDRO OLIVEIRA',
      'logistics.address': 'AV. PAULISTA, 1000 - APTO 42',
      'logistics.weightKg': '12.50',
    },
  },
];

export const PrintCenterPage: React.FC = () => {
  // Modelos e Seleção
  const [templateSummaries, setTemplateSummaries] = useState<TemplateSummaryDTO[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateDTO | null>(null);

  // Impressoras e Agente
  const [printers, setPrinters] = useState<PrinterDTO[]>([]);
  const [selectedPrinterId, setSelectedPrinterId] = useState<string>('');
  const [agentsMap, setAgentsMap] = useState<Map<string, AgentDTO>>(new Map());

  // Registros e Grid
  const [records] = useState<DataRecord[]>(INITIAL_DATA_RECORDS);
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
      .getTemplate(selectedTemplateId)
      .then((fullTpl) => {
        if (isMounted) {
          setSelectedTemplate(fullTpl);
        }
      })
      .catch((err) => {
        console.error('Erro ao carregar detalhes do modelo:', err);
      });
    return () => {
      isMounted = false;
    };
  }, [selectedTemplateId]);

  // Extrair campos de integração usados pelo documento
  const requiredFields = useMemo(() => {
    if (!selectedTemplate || !selectedTemplate.document) {
      return ['retail.code', 'retail.description', 'retail.price', 'retail.ean'];
    }
    return getRequiredIntegrationFields(selectedTemplate.document);
  }, [selectedTemplate]);

  // Impressora Selecionada
  const selectedPrinter = useMemo(() => {
    return printers.find((p) => p.id === selectedPrinterId) || null;
  }, [printers, selectedPrinterId]);

  // Status do Agente associado à impressora
  const agentStatus = useMemo(() => {
    if (!selectedPrinter) return { online: false, text: 'Nenhuma Impressora' };
    if (selectedPrinter.protocol === 'RAW_TCP') {
      const hasHost = !!selectedPrinter.host?.trim();
      return { online: hasHost, text: hasHost ? 'RAW TCP Online' : 'IP Não Configurado' };
    }
    if (!selectedPrinter.agentId) {
      return { online: true, text: 'Dispositivo Direto' };
    }
    const agent = agentsMap.get(selectedPrinter.agentId);
    if (!agent) return { online: false, text: 'Agent Não Encontrado' };
    const isOnline = agent.status === 'ONLINE';
    return { online: isOnline, text: isOnline ? `Agent ${agent.machineName} (Online)` : `Agent ${agent.machineName} (Offline)` };
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

  // Alterar Quantidade de um Registro Especifico
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

  // Validação para habilitar o botão de Envio
  const isPrintButtonEnabled = useMemo(() => {
    if (!selectedTemplateId) return false;
    if (!selectedPrinterId) return false;
    if (!agentStatus.online) return false;
    if (totalSelectedRecords < 1) return false;
    if (totalSelectedLabels < 1) return false;
    return true;
  }, [selectedTemplateId, selectedPrinterId, agentStatus.online, totalSelectedRecords, totalSelectedLabels]);

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
    <div className="print-center-page p-6 max-w-7xl mx-auto space-y-6 text-gray-100 font-sans">
      {/* CABEÇALHO DO MÓDULO */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-gray-800 pb-4 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-100 flex items-center gap-2">
            <Printer className="w-7 h-7 text-indigo-400" />
            Central de Impressão Universal
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            Selecione registros, modelo e impressora para disparar etiquetas industriais em lote.
          </p>
        </div>
        <button
          onClick={loadInitialData}
          disabled={loadingInitial}
          className="px-3 py-1.5 text-xs font-medium bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg border border-gray-700 flex items-center gap-1.5 transition"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loadingInitial ? 'animate-spin' : ''}`} />
          Atualizar Dados
        </button>
      </div>

      {/* BANNER DE ERRO SE EXISTIR */}
      {errorMessage && (
        <div className="bg-red-950/50 border border-red-500/50 p-4 rounded-xl text-red-300 text-sm flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h4 className="font-semibold text-red-200">Aviso da Central</h4>
            <p className="mt-0.5">{errorMessage}</p>
          </div>
          <button
            onClick={() => setErrorMessage(null)}
            className="text-red-400 hover:text-red-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* FEEDBACK DE SUCESSO DE BATCH CRIADO */}
      {batchResult ? (
        <div className="bg-emerald-950/40 border border-emerald-500/50 p-6 rounded-xl space-y-4">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-8 h-8 text-emerald-400 flex-shrink-0" />
            <div>
              <h3 className="text-lg font-bold text-emerald-200">
                Lote de Impressão Enviado com Sucesso!
              </h3>
              <p className="text-xs text-emerald-400">
                ID do Lote: <span className="font-mono text-gray-200 font-bold">{batchResult.id}</span>
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-gray-900/60 p-4 rounded-lg border border-emerald-900/60 text-xs">
            <div>
              <span className="text-gray-400 block">Total Registros:</span>
              <span className="text-base font-bold text-gray-200">{batchResult.totalRecords}</span>
            </div>
            <div>
              <span className="text-gray-400 block">Total Etiquetas:</span>
              <span className="text-base font-bold text-indigo-300">{batchResult.totalLabels}</span>
            </div>
            <div>
              <span className="text-gray-400 block">Status Atual:</span>
              <span className="inline-block px-2 py-0.5 text-[11px] font-semibold bg-indigo-900/60 text-indigo-300 rounded-full mt-0.5">
                {batchResult.status}
              </span>
            </div>
            <div>
              <span className="text-gray-400 block">Criado em:</span>
              <span className="text-gray-300">{new Date(batchResult.createdAt).toLocaleTimeString()}</span>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              onClick={handleNewPrintJob}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm rounded-lg shadow transition flex items-center gap-2"
            >
              <Send className="w-4 h-4" />
              Nova Impressão
            </button>
          </div>
        </div>
      ) : (
        /* CORPO DA CENTRAL (SELEÇÃO, BUSCA, GRID E PREVIEW) */
        <div className="space-y-6">
          {/* BARRA SUPERIOR DE SELEÇÃO: MODELO, ORIGEM, IMPRESSORA & AGENT */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-gray-900/70 p-4 rounded-xl border border-gray-800 shadow-sm">
            {/* 1. SELEÇÃO DE MODELO */}
            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-indigo-400" />
                Modelo de Etiqueta
              </label>
              <select
                value={selectedTemplateId}
                onChange={(e) => setSelectedTemplateId(e.target.value)}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-100 font-medium focus:border-indigo-500 focus:outline-none"
              >
                {templateSummaries.length === 0 ? (
                  <option value="">Nenhum modelo cadastrado</option>
                ) : (
                  templateSummaries.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title} ({t.widthMm}x{t.heightMm}mm - {t.printerLanguage})
                    </option>
                  ))
                )}
              </select>
            </div>

            {/* 2. ORIGEM DE DADOS / FONTE */}
            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1 flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5 text-indigo-400" />
                Origem de Dados
              </label>
              <select
                defaultValue="mock-catalog"
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-100 font-medium focus:border-indigo-500 focus:outline-none"
              >
                <option value="mock-catalog">Catálogo Varejo / Integração Mock (Disponível)</option>
                <option value="erp-connector" disabled>
                  Conector ERP Externo (Fase Futura)
                </option>
              </select>
            </div>

            {/* 3. SELEÇÃO DE IMPRESSORA E STATUS DO AGENT */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-xs font-semibold text-gray-400 flex items-center gap-1.5">
                  <Printer className="w-3.5 h-3.5 text-indigo-400" />
                  Impressora Destino
                </label>
                <span
                  className={`text-[11px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 ${
                    agentStatus.online
                      ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                      : 'bg-red-950 text-red-400 border border-red-800'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      agentStatus.online ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'
                    }`}
                  />
                  {agentStatus.text}
                </span>
              </div>
              <select
                value={selectedPrinterId}
                onChange={(e) => setSelectedPrinterId(e.target.value)}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-100 font-medium focus:border-indigo-500 focus:outline-none"
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

          {/* CONTROLES DA TABELA: BUSCA E AÇÕES EM LOTE */}
          <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-4 bg-gray-900/40 p-4 rounded-xl border border-gray-800">
            {/* CAMPO DE BUSCA */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Buscar por código, descrição, EAN ou chave..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-100 focus:border-indigo-500 focus:outline-none"
              />
            </div>

            {/* AÇÕES EM LOTE */}
            <div className="flex items-center gap-3">
              <button
                onClick={handleToggleSelectAll}
                className="px-3 py-2 text-xs font-semibold bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-200 rounded-lg transition flex items-center gap-1.5"
              >
                <CheckSquare className="w-4 h-4 text-indigo-400" />
                Selecionar Filtrados
              </button>

              <div className="flex items-center gap-1 bg-gray-800 border border-gray-700 p-1 rounded-lg">
                <span className="text-xs text-gray-400 pl-2 font-medium">Qtd Lote:</span>
                <input
                  type="number"
                  min={1}
                  max={999}
                  value={batchQuantityInput}
                  onChange={(e) => setBatchQuantityInput(parseInt(e.target.value, 10) || 1)}
                  className="w-16 px-2 py-1 bg-gray-900 border border-gray-700 rounded text-center text-xs font-bold text-gray-100 focus:outline-none"
                />
                <button
                  onClick={handleApplyBatchQuantity}
                  disabled={selectedIds.size === 0}
                  className="px-2.5 py-1 text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded transition"
                >
                  Aplicar
                </button>
              </div>
            </div>
          </div>

          {/* LAYOUT GRID DINÂMICO + PAINEL LATERAL DE PREVIEW */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* GRID PRINCIPAL (2/3 DAS COLUNAS) */}
            <div className="lg:col-span-2">
              <PrintCenterGrid
                records={records}
                requiredFields={requiredFields}
                selectedIds={selectedIds}
                quantities={quantities}
                activeRecordId={activeRecordId}
                onToggleSelect={handleToggleSelect}
                onToggleSelectAll={handleToggleSelectAll}
                onChangeQuantity={handleChangeQuantity}
                onSelectRecord={(id) => setActiveRecordId(id)}
                searchQuery={searchQuery}
                loading={loadingInitial}
              />
            </div>

            {/* PAINEL DE PREVIEW CONTEXTUAL E RESUMO DE DISPARO (1/3 DA LARGURA) */}
            <div className="space-y-4">
              {/* CARD DE PREVIEW DA ETIQUETA COM REGISTRO ATIVO */}
              <div className="bg-gray-900/70 border border-gray-800 p-4 rounded-xl space-y-3">
                <div className="flex items-center justify-between border-b border-gray-800 pb-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-gray-300 flex items-center gap-1.5">
                    <Eye className="w-4 h-4 text-indigo-400" />
                    Prévia Contextual
                  </h3>
                  <span className="text-[11px] text-gray-400 truncate max-w-[150px]">
                    {activeRecord ? activeRecord.data['retail.description'] || activeRecord.id : 'Nenhum'}
                  </span>
                </div>

                {/* CONTAINER SIMULADO DE RENDERIZAÇÃO DE PREVIEW */}
                <div className="bg-white text-black p-4 rounded-lg shadow-inner min-h-[140px] flex flex-col justify-between border border-gray-300">
                  <div>
                    <div className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">
                      {selectedTemplate?.title || 'Modelo Selecionado'}
                    </div>
                    <div className="text-sm font-extrabold text-gray-900 mt-1 line-clamp-2">
                      {activeRecord
                        ? resolveFieldValue('retail.description', activeRecord.data) ||
                          resolveFieldValue('produto.descricao', activeRecord.data) ||
                          'PRODUTO SEM DESCRIÇÃO'
                        : 'SELECIONE UM REGISTRO'}
                    </div>
                  </div>

                  <div className="flex justify-between items-end border-t border-gray-200 pt-2 mt-2">
                    <div>
                      <div className="text-[10px] font-mono text-gray-600">
                        CÓD: {activeRecord ? activeRecord.data['retail.code'] || activeRecord.id : '000000'}
                      </div>
                      <div className="text-[10px] font-mono text-gray-600">
                        EAN: {activeRecord ? activeRecord.data['retail.ean'] || '7890000000000' : '-'}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[9px] text-gray-500 font-bold uppercase">Preço R$</div>
                      <div className="text-xl font-black text-gray-900 leading-none">
                        {activeRecord ? activeRecord.data['retail.price'] || '0.00' : '0.00'}
                      </div>
                    </div>
                  </div>
                </div>

                <p className="text-[11px] text-gray-500 text-center">
                  A prévia utiliza dados em tempo real do registro selecionado sem alterar o modelo.
                </p>
              </div>

              {/* CARD DE AÇÃO DE DISPARO */}
              <div className="bg-gray-900/70 border border-gray-800 p-5 rounded-xl space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-300 flex items-center gap-1.5 border-b border-gray-800 pb-2">
                  <Layers className="w-4 h-4 text-indigo-400" />
                  Resumo da Seleção
                </h3>

                <div className="space-y-2 text-xs">
                  <div className="flex justify-between text-gray-400">
                    <span>Registros Selecionados:</span>
                    <span className="font-bold text-gray-200">{totalSelectedRecords}</span>
                  </div>
                  <div className="flex justify-between text-gray-400">
                    <span>Total de Etiquetas:</span>
                    <span className="font-bold text-indigo-400 text-sm">{totalSelectedLabels}</span>
                  </div>
                  <div className="flex justify-between text-gray-400">
                    <span>Linguagem de Impressão:</span>
                    <span className="font-semibold text-gray-300">
                      {selectedTemplate?.printerLanguage || 'PPLB'}
                    </span>
                  </div>
                </div>

                <button
                  disabled={!isPrintButtonEnabled}
                  onClick={() => setIsConfirmModalOpen(true)}
                  className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-800 disabled:text-gray-500 disabled:cursor-not-allowed text-white font-bold text-sm rounded-xl shadow-lg transition flex items-center justify-center gap-2"
                >
                  <Send className="w-4 h-4" />
                  Imprimir Seleção ({totalSelectedLabels} etiquetas)
                </button>

                {!agentStatus.online && (
                  <p className="text-[11px] text-red-400 text-center font-medium">
                    A impressora selecionada ou seu Agente está offline. Conecte o hardware para habilitar a impressão.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL COMPACTO DE CONFIRMAÇÃO DE DISPARO */}
      {isConfirmModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 max-w-md w-full shadow-2xl space-y-4 animate-in fade-in zoom-in duration-150">
            <div className="flex justify-between items-center border-b border-gray-800 pb-3">
              <h3 className="text-base font-bold text-gray-100 flex items-center gap-2">
                <Printer className="w-5 h-5 text-indigo-400" />
                Confirmar Impressão em Lote
              </h3>
              <button
                onClick={() => setIsConfirmModalOpen(false)}
                className="text-gray-400 hover:text-gray-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs bg-gray-800/50 p-4 rounded-lg border border-gray-700/60">
              <div>
                <span className="text-gray-400 block font-medium">Modelo de Etiqueta:</span>
                <span className="text-sm font-bold text-gray-100">{selectedTemplate?.title}</span>
              </div>
              <div>
                <span className="text-gray-400 block font-medium">Impressora Destino:</span>
                <span className="text-sm font-bold text-gray-100">{selectedPrinter?.name}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-700/60">
                <div>
                  <span className="text-gray-400 block font-medium">Registros:</span>
                  <span className="text-base font-bold text-gray-200">{totalSelectedRecords}</span>
                </div>
                <div>
                  <span className="text-gray-400 block font-medium">Total Etiquetas:</span>
                  <span className="text-base font-bold text-indigo-400">{totalSelectedLabels}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setIsConfirmModalOpen(false)}
                disabled={isSubmitting}
                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 font-semibold text-xs rounded-lg border border-gray-700 transition"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmPrintBatch}
                disabled={isSubmitting}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-lg shadow transition flex items-center gap-1.5"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Enviando Lote...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    Enviar para Impressão
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PrintCenterPage;
