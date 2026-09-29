import React, { useState, useEffect } from 'react';
import {
  Printer,
  Plus,
  Trash2,
  Save,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Radio,
  Star,
  Cpu,
  MapPin,
  Settings2,
  Layers,
  HelpCircle,
} from 'lucide-react';
import { printersApi } from '../../services/printersApi.js';
import { agentsApi } from '../../services/agentsApi.js';
import type {
  PrinterDTO,
  CreatePrinterDTO,
  UpdatePrinterDTO,
  AgentDTO,
  CanonicalPrinterProtocol,
  PrinterConnectionType,
  SerialFlowControl,
} from '@witiquetas/contracts';

interface PrintersAdminViewProps {
  canManage?: boolean;
}

const PRESET_MODELS = [
  { id: 'elgin-l42-pro', name: 'Elgin L42 Pro', manufacturer: 'Elgin', protocol: 'PPLB' as CanonicalPrinterProtocol, dpi: 203, defaultConn: 'RAW_TCP' as PrinterConnectionType },
  { id: 'zebra-zd220', name: 'Zebra ZD220', manufacturer: 'Zebra', protocol: 'ZPL' as CanonicalPrinterProtocol, dpi: 203, defaultConn: 'RAW_TCP' as PrinterConnectionType },
  { id: 'argox-os214plus', name: 'Argox OS-214plus', manufacturer: 'Argox', protocol: 'PPLA' as CanonicalPrinterProtocol, dpi: 203, defaultConn: 'RAW_TCP' as PrinterConnectionType },
  { id: 'generic-zpl', name: 'Térmica Genérica ZPL', manufacturer: 'Genérico', protocol: 'ZPL' as CanonicalPrinterProtocol, dpi: 203, defaultConn: 'RAW_TCP' as PrinterConnectionType },
  { id: 'generic-pplb', name: 'Térmica Genérica PPLB', manufacturer: 'Genérico', protocol: 'PPLB' as CanonicalPrinterProtocol, dpi: 203, defaultConn: 'RAW_TCP' as PrinterConnectionType },
  { id: 'generic-ppla', name: 'Térmica Genérica PPLA', manufacturer: 'Genérico', protocol: 'PPLA' as CanonicalPrinterProtocol, dpi: 203, defaultConn: 'RAW_TCP' as PrinterConnectionType },
  { id: 'custom', name: 'Personalizado / Outro Modelo', manufacturer: '', protocol: 'ZPL' as CanonicalPrinterProtocol, dpi: 203, defaultConn: 'RAW_TCP' as PrinterConnectionType },
];

export const PrintersAdminView: React.FC<PrintersAdminViewProps> = ({ canManage = true }) => {
  const [printers, setPrinters] = useState<PrinterDTO[]>([]);
  const [agents, setAgents] = useState<AgentDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // Seleção e modo do painel de detalhes
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Form State
  const [formName, setFormName] = useState('');
  const [formModelPreset, setFormModelPreset] = useState('elgin-l42-pro');
  const [formManufacturer, setFormManufacturer] = useState('Elgin');
  const [formProtocol, setFormProtocol] = useState<CanonicalPrinterProtocol>('PPLB');
  const [formDpi, setFormDpi] = useState(203);
  const [formConnectionType, setFormConnectionType] = useState<PrinterConnectionType>('RAW_TCP');
  const [formIp, setFormIp] = useState('192.168.1.200');
  const [formPort, setFormPort] = useState(9100);
  const [formSpoolerName, setFormSpoolerName] = useState('');
  const [formSerialPort, setFormSerialPort] = useState('COM1');
  const [formBaudRate, setFormBaudRate] = useState(9600);
  const [formSerialFlowControl, setFormSerialFlowControl] = useState<SerialFlowControl>('RTS_CTS');
  const [formAgentId, setFormAgentId] = useState<string>('');
  const [formLocation, setFormLocation] = useState('');
  const [formIsDefault, setFormIsDefault] = useState(false);
  const [formStatus, setFormStatus] = useState<'ACTIVE' | 'INACTIVE'>('ACTIVE');
  const [saving, setSaving] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [printersList, agentsList] = await Promise.all([
        printersApi.listPrinters(),
        agentsApi.listAgents(),
      ]);
      setPrinters(printersList);
      setAgents(agentsList);

      if (printersList.length > 0 && !selectedId && !isCreating) {
        setSelectedId(printersList[0].id);
      }
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar dados de impressoras.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const selectedPrinter = printers.find((p) => p.id === selectedId) || null;

  // Popula formulário ao selecionar impressora
  useEffect(() => {
    if (selectedPrinter && !isCreating) {
      setFormName(selectedPrinter.name);
      const foundPreset = PRESET_MODELS.find((m) => m.id === selectedPrinter.modelId);
      setFormModelPreset(foundPreset ? foundPreset.id : 'custom');
      setFormManufacturer(selectedPrinter.manufacturer || '');
      setFormProtocol((selectedPrinter.protocol as CanonicalPrinterProtocol) || 'ZPL');
      setFormDpi(selectedPrinter.dpi || 203);
      setFormConnectionType(selectedPrinter.connectionType || 'RAW_TCP');
      setFormIp(selectedPrinter.ip || selectedPrinter.host || '');
      setFormPort(selectedPrinter.port || 9100);
      setFormSpoolerName(selectedPrinter.spoolerName || '');
      setFormSerialPort(selectedPrinter.serialPort || 'COM1');
      setFormBaudRate(selectedPrinter.baudRate || 9600);
      setFormSerialFlowControl(selectedPrinter.serialFlowControl || 'RTS_CTS');
      setFormAgentId(selectedPrinter.agentId || '');
      setFormLocation(selectedPrinter.location || '');
      setFormIsDefault(!!selectedPrinter.isDefault);
      setFormStatus(selectedPrinter.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE');
    }
  }, [selectedPrinter, isCreating]);

  const handleStartCreate = () => {
    setIsCreating(true);
    setSelectedId(null);
    setFormName('');
    setFormModelPreset('elgin-l42-pro');
    setFormManufacturer('Elgin');
    setFormProtocol('PPLB');
    setFormDpi(203);
    setFormConnectionType('RAW_TCP');
    setFormIp('192.168.1.200');
    setFormPort(9100);
    setFormSpoolerName('');
    setFormSerialPort('COM1');
    setFormBaudRate(9600);
    setFormSerialFlowControl('RTS_CTS');
    setFormAgentId('');
    setFormLocation('');
    setFormIsDefault(printers.length === 0); // Se for a primeira, sugere default
    setFormStatus('ACTIVE');
  };

  const handleModelPresetChange = (presetId: string) => {
    setFormModelPreset(presetId);
    const preset = PRESET_MODELS.find((m) => m.id === presetId);
    if (preset && preset.id !== 'custom') {
      setFormManufacturer(preset.manufacturer);
      setFormProtocol(preset.protocol);
      setFormDpi(preset.dpi);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage) return;

    if (!formName.trim()) {
      setError('O nome da impressora é obrigatório.');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      setSuccessMsg(null);

      const payload: CreatePrinterDTO = {
        name: formName.trim(),
        modelId: formModelPreset,
        model: formModelPreset,
        manufacturer: formManufacturer.trim() || undefined,
        protocol: formProtocol,
        language: formProtocol,
        dpi: Number(formDpi),
        connectionType: formConnectionType,
        ip: formConnectionType === 'RAW_TCP' ? formIp.trim() : undefined,
        host: formConnectionType === 'RAW_TCP' ? formIp.trim() : undefined,
        port: formConnectionType === 'RAW_TCP' ? Number(formPort) : undefined,
        spoolerName: formConnectionType === 'WINDOWS_SPOOLER' ? formSpoolerName.trim() : undefined,
        serialPort: formConnectionType === 'SERIAL' ? formSerialPort.trim() : undefined,
        baudRate: formConnectionType === 'SERIAL' ? Number(formBaudRate) : undefined,
        serialFlowControl: formConnectionType === 'SERIAL' ? formSerialFlowControl : undefined,
        agentId: formAgentId.trim() || null,
        location: formLocation.trim() || null,
        isDefault: formIsDefault,
        status: formStatus,
        active: formStatus === 'ACTIVE',
      };

      if (isCreating) {
        const created = await printersApi.createPrinter(payload);
        setSuccessMsg(`Impressora "${created.name}" cadastrada com sucesso!`);
        await loadData();
        setIsCreating(false);
        setSelectedId(created.id);
      } else if (selectedId) {
        const updated = await printersApi.updatePrinter(selectedId, payload);
        setSuccessMsg(`Impressora "${updated.name}" atualizada com sucesso!`);
        await loadData();
      }
    } catch (err: any) {
      setError(err.message || 'Falha ao salvar impressora.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!canManage) return;
    if (!window.confirm(`Tem certeza de que deseja excluir a impressora "${name}"?`)) return;

    try {
      setSaving(true);
      setError(null);
      await printersApi.deletePrinter(id);
      setSuccessMsg(`Impressora "${name}" removida com sucesso.`);
      setSelectedId(null);
      setIsCreating(false);
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Erro ao remover impressora.');
    } finally {
      setSaving(false);
    }
  };

  const handleSetDefault = async (id: string) => {
    if (!canManage) return;
    try {
      setSaving(true);
      setError(null);
      await printersApi.setDefaultPrinter(id);
      setSuccessMsg('Impressora definida como padrão com sucesso.');
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Erro ao definir impressora como padrão.');
    } finally {
      setSaving(false);
    }
  };

  const filteredPrinters = printers.filter((p) => {
    const term = search.toLowerCase();
    return (
      p.name.toLowerCase().includes(term) ||
      (p.location && p.location.toLowerCase().includes(term)) ||
      (p.protocol && p.protocol.toLowerCase().includes(term)) ||
      (p.ip && p.ip.toLowerCase().includes(term))
    );
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Mensagens de Feedback */}
      {error && (
        <div className="alert alert-danger" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.85rem 1.25rem', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.12)', border: '1px solid var(--status-danger)', color: 'var(--status-danger)' }}>
          <AlertCircle size={20} />
          <span>{error}</span>
        </div>
      )}
      {successMsg && (
        <div className="alert alert-success" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.85rem 1.25rem', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.12)', border: '1px solid var(--status-success)', color: 'var(--status-success)' }}>
          <CheckCircle2 size={20} />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Grid Principal Landscape Master-Detail */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(320px, 380px) minmax(0, 1fr)',
          gap: '1.5rem',
          alignItems: 'start',
        }}
      >
        {/* Painel Esquerdo: Lista de Impressoras */}
        <div className="card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                Impressoras Físicas
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                {printers.length} impressora(s) cadastrada(s)
              </div>
            </div>

            {canManage && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleStartCreate}
                style={{ fontSize: '0.8rem', padding: '0.4rem 0.75rem' }}
                title="Cadastrar nova impressora"
              >
                <Plus size={16} />
                Nova
              </button>
            )}
          </div>

          {/* Campo de Busca */}
          <div>
            <input
              type="text"
              placeholder="Buscar por nome, local ou IP..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="form-control"
              style={{ width: '100%', fontSize: '0.85rem', padding: '0.5rem 0.75rem' }}
            />
          </div>

          {/* Lista de Cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '600px', overflowY: 'auto' }}>
            {loading ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                <RefreshCw size={24} className="spin" style={{ margin: '0 auto 0.5rem auto' }} />
                Carregando impressoras...
              </div>
            ) : filteredPrinters.length === 0 ? (
              <div style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--text-muted)', background: 'rgba(255, 255, 255, 0.02)', borderRadius: '8px', border: '1px dashed var(--border-color)' }}>
                <Printer size={32} style={{ margin: '0 auto 0.5rem auto', opacity: 0.4 }} />
                <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.25rem' }}>
                  Nenhuma impressora cadastrada
                </div>
                <div style={{ fontSize: '0.75rem', marginBottom: '0.75rem' }}>
                  Novas empresas iniciam sem impressoras por padrão.
                </div>
                {canManage && (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleStartCreate}
                    style={{ fontSize: '0.75rem', padding: '0.35rem 0.75rem' }}
                  >
                    Adicionar Primeira Impressora
                  </button>
                )}
              </div>
            ) : (
              filteredPrinters.map((p) => {
                const isSelected = !isCreating && selectedId === p.id;
                return (
                  <div
                    key={p.id}
                    onClick={() => {
                      setIsCreating(false);
                      setSelectedId(p.id);
                    }}
                    style={{
                      padding: '0.85rem',
                      borderRadius: '8px',
                      border: `1px solid ${isSelected ? 'var(--accent-blue)' : 'var(--border-color)'}`,
                      background: isSelected ? 'rgba(59, 130, 246, 0.08)' : 'var(--card-bg, rgba(255, 255, 255, 0.03))',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.35rem',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontWeight: 700, fontSize: '0.9rem', color: isSelected ? 'var(--accent-blue)' : 'var(--text-primary)' }}>
                        {p.name}
                      </span>
                      {p.isDefault && (
                        <span
                          style={{
                            fontSize: '0.65rem',
                            fontWeight: 700,
                            padding: '0.15rem 0.45rem',
                            borderRadius: '4px',
                            background: 'rgba(245, 158, 11, 0.15)',
                            color: 'var(--status-warning, #f59e0b)',
                            border: '1px solid rgba(245, 158, 11, 0.4)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.2rem',
                          }}
                        >
                          <Star size={10} fill="currentColor" />
                          PADRÃO
                        </span>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      <span className={`badge ${p.status === 'ACTIVE' ? 'badge-success' : 'badge-secondary'}`}>
                        {p.status === 'ACTIVE' ? 'Ativa' : 'Inativa'}
                      </span>
                      <span>{p.protocol} ({p.dpi} DPI)</span>
                      <span>• {p.connectionType}</span>
                    </div>

                    {(p.location || p.ip || p.spoolerName || p.serialPort) && (
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.35rem', marginTop: '0.15rem' }}>
                        {p.location && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                            <MapPin size={11} /> {p.location}
                          </span>
                        )}
                        {p.ip && <span>({p.ip}:{p.port || 9100})</span>}
                        {p.spoolerName && <span>({p.spoolerName})</span>}
                        {p.serialPort && <span>({p.serialPort})</span>}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Painel Direito: Detalhes / Formulário de Cadastro e Edição */}
        <div className="card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.85rem' }}>
            <div>
              <div style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                {isCreating ? 'Cadastrar Nova Impressora' : selectedPrinter ? `Configuração: ${selectedPrinter.name}` : 'Selecione uma Impressora'}
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                {isCreating ? 'Preencha os parâmetros físicos e de transporte do equipamento' : selectedPrinter ? `ID: ${selectedPrinter.id}` : 'Escolha uma impressora na lista lateral ou crie uma nova'}
              </div>
            </div>

            {!isCreating && selectedPrinter && canManage && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {!selectedPrinter.isDefault && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => handleSetDefault(selectedPrinter.id)}
                    disabled={saving}
                    style={{ fontSize: '0.8rem', padding: '0.35rem 0.65rem' }}
                    title="Definir esta impressora como a padrão da empresa"
                  >
                    <Star size={14} />
                    Tornar Padrão
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() => handleDelete(selectedPrinter.id, selectedPrinter.name)}
                  disabled={saving}
                  style={{ fontSize: '0.8rem', padding: '0.35rem 0.65rem' }}
                  title="Excluir impressora"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            )}
          </div>

          {(isCreating || selectedPrinter) ? (
            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
              {/* Linha 1: Nome da Impressora & Status */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 180px', gap: '1rem' }}>
                <div>
                  <label className="metric-label" style={{ marginBottom: '0.35rem', display: 'block' }}>
                    Nome da Impressora *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Elgin L42 Pro - Expedição 01"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="form-control"
                    disabled={!canManage || saving}
                    style={{ width: '100%' }}
                  />
                </div>

                <div>
                  <label className="metric-label" style={{ marginBottom: '0.35rem', display: 'block' }}>
                    Status Operacional
                  </label>
                  <select
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value as any)}
                    className="form-control"
                    disabled={!canManage || saving}
                    style={{ width: '100%' }}
                  >
                    <option value="ACTIVE">Ativa (Habilitada)</option>
                    <option value="INACTIVE">Inativa (Desabilitada)</option>
                  </select>
                </div>
              </div>

              {/* Linha 2: Perfil / Modelo & Fabricante */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label className="metric-label" style={{ marginBottom: '0.35rem', display: 'block' }}>
                    Modelo / Perfil de Equipamento
                  </label>
                  <select
                    value={formModelPreset}
                    onChange={(e) => handleModelPresetChange(e.target.value)}
                    className="form-control"
                    disabled={!canManage || saving}
                    style={{ width: '100%' }}
                  >
                    {PRESET_MODELS.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} ({m.protocol} - {m.dpi} DPI)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="metric-label" style={{ marginBottom: '0.35rem', display: 'block' }}>
                    Fabricante
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Elgin, Zebra, Argox"
                    value={formManufacturer}
                    onChange={(e) => setFormManufacturer(e.target.value)}
                    className="form-control"
                    disabled={!canManage || saving}
                    style={{ width: '100%' }}
                  />
                </div>
              </div>

              {/* Linha 3: Protocolo / Linguagem & Resolução (DPI) */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label className="metric-label" style={{ marginBottom: '0.35rem', display: 'block' }}>
                    Linguagem / Protocolo Térmico *
                  </label>
                  <select
                    value={formProtocol}
                    onChange={(e) => setFormProtocol(e.target.value as any)}
                    className="form-control"
                    disabled={!canManage || saving}
                    style={{ width: '100%' }}
                  >
                    <option value="ZPL">ZPL (Zebra Programming Language)</option>
                    <option value="PPLB">PPLB (Argox / Elgin L42 Pro)</option>
                    <option value="PPLA">PPLA (Argox OS-214plus)</option>
                    <option value="TSPL">TSPL (TSC / Gprinter)</option>
                    <option value="DPL">DPL (Datamax)</option>
                    <option value="CPCL">CPCL (Zebra Mobile)</option>
                    <option value="RAW_TEXT">RAW_TEXT (Texto Bruto)</option>
                  </select>
                </div>

                <div>
                  <label className="metric-label" style={{ marginBottom: '0.35rem', display: 'block' }}>
                    Resolução de Impressão (DPI)
                  </label>
                  <select
                    value={formDpi}
                    onChange={(e) => setFormDpi(Number(e.target.value))}
                    className="form-control"
                    disabled={!canManage || saving}
                    style={{ width: '100%' }}
                  >
                    <option value={203}>203 DPI (8 pontos/mm - Padrão Comercial)</option>
                    <option value={300}>300 DPI (12 pontos/mm - Alta Resolução)</option>
                    <option value={600}>600 DPI (24 pontos/mm - Precisão Industrial)</option>
                  </select>
                </div>
              </div>

              {/* Linha 4: Tipo de Conexão Física */}
              <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '0.85rem' }}>
                <label className="metric-label" style={{ marginBottom: '0.35rem', display: 'block' }}>
                  Tipo de Conexão / Transporte *
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem', marginBottom: '0.85rem' }}>
                  {[
                    { id: 'RAW_TCP', label: 'Rede TCP/IP', desc: 'Porta 9100 / Socket Direto' },
                    { id: 'WINDOWS_SPOOLER', label: 'Windows Spooler', desc: 'Fila de Impressão do SO' },
                    { id: 'SERIAL', label: 'Porta Serial (RS-232)', desc: 'COM / Baud Rate / Flow' },
                    { id: 'USB_DIRECT', label: 'USB Direto', desc: 'Identificador USB nativo' },
                  ].map((ct) => (
                    <button
                      key={ct.id}
                      type="button"
                      onClick={() => setFormConnectionType(ct.id as any)}
                      disabled={!canManage || saving}
                      style={{
                        padding: '0.65rem 0.5rem',
                        borderRadius: '6px',
                        border: `1px solid ${formConnectionType === ct.id ? 'var(--accent-blue)' : 'var(--border-color)'}`,
                        background: formConnectionType === ct.id ? 'rgba(59, 130, 246, 0.12)' : 'rgba(255, 255, 255, 0.02)',
                        textAlign: 'left',
                        cursor: canManage ? 'pointer' : 'default',
                      }}
                    >
                      <div style={{ fontSize: '0.8rem', fontWeight: 700, color: formConnectionType === ct.id ? 'var(--accent-blue)' : 'var(--text-primary)' }}>
                        {ct.label}
                      </div>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{ct.desc}</div>
                    </button>
                  ))}
                </div>

                {/* Parâmetros Condicionais por Tipo de Conexão */}
                {formConnectionType === 'RAW_TCP' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem', padding: '0.85rem', background: 'rgba(255, 255, 255, 0.02)', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                    <div>
                      <label className="metric-label" style={{ marginBottom: '0.35rem', display: 'block' }}>
                        Endereço IP / Host de Rede *
                      </label>
                      <input
                        type="text"
                        placeholder="Ex: 192.168.1.200 ou impressora-expedicao.local"
                        value={formIp}
                        onChange={(e) => setFormIp(e.target.value)}
                        className="form-control"
                        disabled={!canManage || saving}
                        style={{ width: '100%' }}
                      />
                    </div>
                    <div>
                      <label className="metric-label" style={{ marginBottom: '0.35rem', display: 'block' }}>
                        Porta TCP (Padrão 9100)
                      </label>
                      <input
                        type="number"
                        value={formPort}
                        onChange={(e) => setFormPort(Number(e.target.value))}
                        className="form-control"
                        disabled={!canManage || saving}
                        style={{ width: '100%' }}
                      />
                    </div>
                  </div>
                )}

                {formConnectionType === 'WINDOWS_SPOOLER' && (
                  <div style={{ padding: '0.85rem', background: 'rgba(255, 255, 255, 0.02)', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                    <label className="metric-label" style={{ marginBottom: '0.35rem', display: 'block' }}>
                      Nome da Impressora no Spooler do Windows *
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: Elgin L42Pro ou Zebra ZD220 Direct"
                      value={formSpoolerName}
                      onChange={(e) => setFormSpoolerName(e.target.value)}
                      className="form-control"
                      disabled={!canManage || saving}
                      style={{ width: '100%' }}
                    />
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.25rem', display: 'block' }}>
                      Deve corresponder exatamente ao nome registrado no Painel de Controle / Dispositivos do Windows.
                    </span>
                  </div>
                )}

                {formConnectionType === 'SERIAL' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', padding: '0.85rem', background: 'rgba(255, 255, 255, 0.02)', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                    <div>
                      <label className="metric-label" style={{ marginBottom: '0.35rem', display: 'block' }}>
                        Porta Serial (COM / tty) *
                      </label>
                      <input
                        type="text"
                        placeholder="Ex: COM1, COM3, /dev/ttyUSB0"
                        value={formSerialPort}
                        onChange={(e) => setFormSerialPort(e.target.value)}
                        className="form-control"
                        disabled={!canManage || saving}
                        style={{ width: '100%' }}
                      />
                    </div>
                    <div>
                      <label className="metric-label" style={{ marginBottom: '0.35rem', display: 'block' }}>
                        Baud Rate
                      </label>
                      <select
                        value={formBaudRate}
                        onChange={(e) => setFormBaudRate(Number(e.target.value))}
                        className="form-control"
                        disabled={!canManage || saving}
                        style={{ width: '100%' }}
                      >
                        <option value={9600}>9600 bps (Padrão)</option>
                        <option value={19200}>19200 bps</option>
                        <option value={38400}>38400 bps</option>
                        <option value={57600}>57600 bps</option>
                        <option value={115200}>115200 bps</option>
                      </select>
                    </div>
                    <div>
                      <label className="metric-label" style={{ marginBottom: '0.35rem', display: 'block' }}>
                        Controle de Fluxo Serial *
                      </label>
                      <select
                        value={formSerialFlowControl}
                        onChange={(e) => setFormSerialFlowControl(e.target.value as any)}
                        className="form-control"
                        disabled={!canManage || saving}
                        style={{ width: '100%' }}
                      >
                        <option value="RTS_CTS">RTS / CTS (Hardware - Recomendado)</option>
                        <option value="XON_XOFF">XON / XOFF (Software)</option>
                        <option value="NONE">NONE (Sem controle de fluxo)</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>

              {/* Linha 5: Localização Física & Vínculo com Agente Local */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', borderTop: '1px solid var(--border-color)', paddingTop: '0.85rem' }}>
                <div>
                  <label className="metric-label" style={{ marginBottom: '0.35rem', display: 'block' }}>
                    Localização Física (Opcional, máx. 100 caracteres)
                  </label>
                  <input
                    type="text"
                    maxLength={100}
                    placeholder="Ex: Bancada Expedição 02, Balcão de Caixa 04"
                    value={formLocation}
                    onChange={(e) => setFormLocation(e.target.value)}
                    className="form-control"
                    disabled={!canManage || saving}
                    style={{ width: '100%' }}
                  />
                </div>

                <div>
                  <label className="metric-label" style={{ marginBottom: '0.35rem', display: 'block' }}>
                    Agente de Impressão Local Vinculado (Same-Tenant)
                  </label>
                  <select
                    value={formAgentId}
                    onChange={(e) => setFormAgentId(e.target.value)}
                    className="form-control"
                    disabled={!canManage || saving}
                    style={{ width: '100%' }}
                  >
                    <option value="">Nenhum (Rede Direta / Servidor Central)</option>
                    {agents.map((ag) => (
                      <option key={ag.id} value={ag.id}>
                        {ag.machineName} ({ag.os} {ag.architecture} - {ag.status})
                      </option>
                    ))}
                  </select>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.2rem', display: 'block' }}>
                    Apenas agentes pareados da sua empresa podem ser vinculados.
                  </span>
                </div>
              </div>

              {/* Linha 6: Opção Default */}
              <div style={{ padding: '0.75rem', background: 'rgba(255, 255, 255, 0.02)', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', cursor: canManage ? 'pointer' : 'default', margin: 0 }}>
                  <input
                    type="checkbox"
                    checked={formIsDefault}
                    onChange={(e) => setFormIsDefault(e.target.checked)}
                    disabled={!canManage || saving}
                    style={{ width: 16, height: 16 }}
                  />
                  <div>
                    <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                      Definir como Impressora Padrão da Empresa
                    </span>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block' }}>
                      No máximo uma impressora padrão é permitida por empresa. A seleção desta desmarcará automaticamente qualquer outra impressora do seu tenant.
                    </span>
                  </div>
                </label>
              </div>

              {/* Botões de Ação */}
              {canManage && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.75rem', borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
                  {isCreating && (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => {
                        setIsCreating(false);
                        if (printers.length > 0) setSelectedId(printers[0].id);
                      }}
                      disabled={saving}
                    >
                      Cancelar
                    </button>
                  )}
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={saving}
                    style={{ minWidth: '140px' }}
                  >
                    <Save size={16} />
                    {saving ? 'Salvando...' : isCreating ? 'Cadastrar Impressora' : 'Salvar Alterações'}
                  </button>
                </div>
              )}
            </form>
          ) : (
            <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              Selecione uma impressora na lista lateral para visualizar e editar as configurações.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
