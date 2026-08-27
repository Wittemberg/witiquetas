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

import { PrintPreview } from './PrintPreview.js';

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

  // Carregar documento completo do modelo selecionado (Etapa 3: tratamento gracioso de modelo inexistente/removido)
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
          templatesApi.listTemplates().then((tpls) => {
            if (isMounted) {
              setTemplateSummaries(tpls);
              if (tpls.length > 0) {
                setSelectedTemplateId(tpls[0].id);
              }
            }
          }).catch(() => {});
        }
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
    <div className="print-center-page">
      {/* CABEÇALHO DO MÓDULO */}
      <div className="print-center-header">
        <div className="print-center-title-container">
          <h1>
            <Printer className="print-center-icon-blue" style={{ width: '1.75rem', height: '1.75rem' }} />
            Central de Impressão Universal
          </h1>
          <p>
            Selecione registros, modelo e impressora para disparar etiquetas industriais em lote.
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
          {/* BARRA SUPERIOR DE SELEÇÃO: MODELO, ORIGEM, IMPRESSORA & AGENT */}
          <div className="print-center-config-card">
            {/* 1. SELEÇÃO DE MODELO */}
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
            <div className="print-center-field-group">
              <label className="print-center-label">
                <Database style={{ width: '0.875rem', height: '0.875rem' }} className="print-center-icon-blue" />
                Origem de Dados
              </label>
              <select defaultValue="mock-catalog" className="print-center-select">
                <option value="mock-catalog">Catálogo Varejo / Integração Mock (Disponível)</option>
                <option value="erp-connector" disabled>
                  Conector ERP Externo (Fase Futura)
                </option>
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

          {/* CONTROLES DA TABELA: BUSCA E AÇÕES EM LOTE */}
          <div className="print-center-toolbar">
            {/* CAMPO DE BUSCA */}
            <div className="print-center-search-wrapper">
              <Search className="print-center-search-icon" />
              <input
                type="text"
                placeholder="Buscar por código, descrição, EAN ou chave..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="print-center-input print-center-search-input"
              />
            </div>

            {/* AÇÕES EM LOTE */}
            <div className="print-center-batch-controls">
              <button
                onClick={handleToggleSelectAll}
                className="print-center-btn print-center-btn-secondary"
              >
                <CheckSquare style={{ width: '1rem', height: '1rem' }} className="print-center-icon-blue" />
                Selecionar Filtrados
              </button>

              <div className="print-center-batch-quantity-group">
                <span className="print-center-batch-quantity-label">Qtd. lote:</span>
                <input
                  type="number"
                  min={1}
                  max={999}
                  value={batchQuantityInput}
                  onChange={(e) => setBatchQuantityInput(parseInt(e.target.value, 10) || 1)}
                  className="print-center-batch-quantity-input"
                />
                <button
                  onClick={handleApplyBatchQuantity}
                  disabled={selectedIds.size === 0}
                  className="print-center-btn print-center-btn-primary"
                  style={{ padding: '0.25rem 0.625rem', fontSize: '0.75rem' }}
                >
                  Aplicar
                </button>
              </div>
            </div>
          </div>

          {/* LAYOUT GRID DINÂMICO + PAINEL LATERAL DE PREVIEW */}
          <div className="print-center-content-grid">
            {/* GRID PRINCIPAL (70% DA LARGURA) */}
            <div>
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

            {/* PAINEL DE PREVIEW CONTEXTUAL E RESUMO DE DISPARO (30% DA LARGURA) */}
            <div className="print-center-sidebar-column">
              {/* COMPONENTE DE PREVIEW REAL DE IMPRESSÃO (REUTILIZA RENDERER HOMOLOGADO DO EDITOR) */}
              <PrintPreview
                document={selectedTemplate?.document || null}
                data={(activeRecord?.data as Record<string, unknown>) || null}
                modelName={selectedTemplate?.title}
                printerLanguage={selectedTemplate?.printerLanguage || 'PPLB'}
              />

              {/* CARD DE AÇÃO DE DISPARO */}
              <div className="print-center-card">
                <div className="print-center-card-header">
                  <h3 className="print-center-card-title">
                    <Layers style={{ width: '1rem', height: '1rem' }} className="print-center-icon-blue" />
                    Resumo da Seleção
                  </h3>
                </div>

                <div className="print-center-summary-list">
                  <div className="print-center-summary-item">
                    <span>Registros Selecionados:</span>
                    <span className="print-center-summary-value">{totalSelectedRecords}</span>
                  </div>
                  <div className="print-center-summary-item">
                    <span>Total de Etiquetas:</span>
                    <span className="print-center-summary-value-accent">{totalSelectedLabels}</span>
                  </div>
                  <div className="print-center-summary-item">
                    <span>Linguagem de Impressão:</span>
                    <span className="print-center-summary-value">
                      {selectedTemplate?.printerLanguage || 'PPLB'}
                    </span>
                  </div>
                </div>

                <button
                  disabled={!isPrintButtonEnabled}
                  onClick={() => setIsConfirmModalOpen(true)}
                  className="print-center-btn print-center-btn-primary"
                  style={{ width: '100%', padding: '0.75rem 1rem', fontSize: '0.875rem', fontWeight: 700 }}
                >
                  <Send style={{ width: '1rem', height: '1rem' }} />
                  Imprimir Seleção ({totalSelectedLabels} etiquetas)
                </button>

                {!agentStatus.online && (
                  <p style={{ fontSize: '0.6875rem', color: 'var(--status-danger)', textAlign: 'center', fontWeight: 500, margin: 0 }}>
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
        <div className="print-center-modal-overlay">
          <div className="print-center-modal-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Printer style={{ width: '1.25rem', height: '1.25rem' }} className="print-center-icon-blue" />
                Confirmar Impressão em Lote
              </h3>
              <button
                onClick={() => setIsConfirmModalOpen(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X style={{ width: '1.25rem', height: '1.25rem' }} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.8125rem', background: 'var(--bg-input)', padding: '1rem', borderRadius: '0.5rem', border: '1px solid var(--border-color)' }}>
              <div>
                <span style={{ color: 'var(--text-muted)', display: 'block', fontWeight: 500 }}>Modelo de Etiqueta:</span>
                <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-primary)' }}>{selectedTemplate?.title}</span>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)', display: 'block', fontWeight: 500 }}>Impressora Destino:</span>
                <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-primary)' }}>{selectedPrinter?.name}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid var(--border-color)' }}>
                <div>
                  <span style={{ color: 'var(--text-muted)', display: 'block', fontWeight: 500 }}>Registros:</span>
                  <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>{totalSelectedRecords}</span>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)', display: 'block', fontWeight: 500 }}>Total Etiquetas:</span>
                  <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--accent-blue)' }}>{totalSelectedLabels}</span>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifySelf: 'end', alignSelf: 'end', gap: '0.75rem', paddingTop: '0.5rem' }}>
              <button
                onClick={() => setIsConfirmModalOpen(false)}
                disabled={isSubmitting}
                className="print-center-btn print-center-btn-secondary"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmPrintBatch}
                disabled={isSubmitting}
                className="print-center-btn print-center-btn-primary"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw style={{ width: '1rem', height: '1rem' }} className="animate-spin" />
                    Enviando Lote...
                  </>
                ) : (
                  <>
                    <Send style={{ width: '1rem', height: '1rem' }} />
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
