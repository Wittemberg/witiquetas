import React, { useState, useEffect, useMemo } from 'react';
import { useEditorStore, MOCK_PRODUCT_DATA } from './useEditorStore';
import { LegacyCompiler } from './importers';
import { PrinterDTO } from '@witiquetas/contracts';
import {
  X,
  Printer,
  FileCode,
  CheckCircle2,
  AlertTriangle,
  Play,
  Copy,
  Download,
  Terminal,
  Layers,
  Sparkles,
  ChevronDown,
  ChevronRight
} from 'lucide-react';

interface CompileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function CompileModal({ isOpen, onClose }: CompileModalProps) {
  const { document, selectedPrinter, setSelectedPrinter } = useEditorStore();

  const [printers, setPrinters] = useState<PrinterDTO[]>([]);
  const [selectedPrinterId, setSelectedPrinterId] = useState<string>('');
  const [copies, setCopies] = useState<number>(1);
  const [compiledCode, setCompiledCode] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isPrinting, setIsPrinting] = useState<boolean>(false);
  const [printSuccess, setPrintSuccess] = useState<boolean>(false);
  const [printError, setPrintError] = useState<string | null>(null);
  const [createdJobId, setCreatedJobId] = useState<string | null>(null);

  // Accordion avançado para visualização técnica de código
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [showDiff, setShowDiff] = useState(false);

  // Resumo de Round-Trip e Diff
  const roundTripData = useMemo(() => {
    return LegacyCompiler.compile(document);
  }, [document]);

  // Carregar impressoras disponíveis no backend
  useEffect(() => {
    if (!isOpen) return;

    fetch('/api/printers')
      .then((r) => r.json())
      .then((data) => {
        if (data.printers && data.printers.length > 0) {
          setPrinters(data.printers);
          const defaultPrn = data.printers.find((p: PrinterDTO) => p.isDefault) || data.printers[0];
          setSelectedPrinterId(defaultPrn.id);
          setSelectedPrinter(defaultPrn);
        }
      })
      .catch(() => {
        // Fallback local se backend não responder
        const fallback: PrinterDTO = {
          id: 'prn-local-elgin',
          companyId: 'comp-01',
          name: 'Elgin L42 Pro (PPLB)',
          protocol: 'RAW_TCP',
          host: '192.168.1.200',
          port: 9100,
          language: 'PPLB',
          dpi: 203,
          active: true,
          isDefault: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        setPrinters([fallback]);
        setSelectedPrinterId(fallback.id);
        setSelectedPrinter(fallback);
      });
  }, [isOpen, setSelectedPrinter]);

  // Compilar comandos quando mudar o modelo ou a impressora
  useEffect(() => {
    if (!isOpen) return;

    const currentPrinter = printers.find((p) => p.id === selectedPrinterId);
    const lang = currentPrinter?.language || 'PPLB';

    setIsLoading(true);
    fetch('/api/compile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        document,
        target: lang,
        options: {
          dpi: currentPrinter?.dpi || document.dimensions.dpi || 203,
          data: MOCK_PRODUCT_DATA,
        },
      }),
    })
      .then((r) => r.json())
      .then((data) => {
        setCompiledCode(data.compiled || data.code || '');
        setIsLoading(false);
      })
      .catch(() => {
        setCompiledCode(`; Compilado Witiquetas (${lang})\nN\nq800\nQ240,24\nB40,40,0,1,2,6,50,B,"7894900011517"\nA40,120,0,4,1,1,N,"REFRIGERANTE COCA-COLA 2L"\nP1\n`);
        setIsLoading(false);
      });
  }, [isOpen, selectedPrinterId, document, printers]);

  // Se o modal estiver fechado, não renderiza o DOM, mas os hooks acima já foram avaliados de forma estável
  if (!isOpen) return null;

  const currentPrinter = printers.find((p) => p.id === selectedPrinterId);

  // Disparar Impressão Direta (Ponte Segura Web -> Backend -> PrintJob)
  const handlePrint = async () => {
    if (!selectedPrinterId) return;

    setIsPrinting(true);
    setPrintError(null);
    setPrintSuccess(false);
    setCreatedJobId(null);

    try {
      const res = await fetch('/api/print-jobs', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          printerId: selectedPrinterId,
          document,
          compiledCommand: compiledCode,
          language: currentPrinter?.language || 'PPLB',
          copies: Math.max(1, copies),
          data: MOCK_PRODUCT_DATA,
        }),
      });

      if (res.status === 401 || res.status === 403 || res.status === 503) {
        setPrintError('Não foi possível autorizar a impressão neste ambiente.');
        return;
      }

      const data = await res.json();
      if (res.ok) {
        const jobId = data.job?.id || data.jobId || 'pendente';
        setCreatedJobId(jobId);
        setPrintSuccess(true);
        setTimeout(() => setPrintSuccess(false), 6000);
      } else {
        setPrintError(data.error || 'Falha ao enviar comando para a impressora.');
      }
    } catch (err: any) {
      setPrintError('Não foi possível autorizar a impressão neste ambiente.');
    } finally {
      setIsPrinting(false);
    }
  };

  // Exportar Modelo no Formato Original / TXT / PRN (Round-Trip Fiel)
  const handleExportModel = (formatType: 'TXT' | 'PRN' | 'ORIGINAL' = 'ORIGINAL') => {
    const res = LegacyCompiler.compile(document);
    const blob = new Blob([res.compiledCode], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = window.document.createElement('a');
    a.href = url;

    let baseName = document.sourceFile?.originalFileName || `${document.title.toLowerCase().replace(/[^a-z0-9]/g, '-')}.txt`;
    const cleanBaseName = baseName.replace(/\.[^/.]+$/, '');

    let finalFileName = `${cleanBaseName}.txt`;
    if (formatType === 'PRN') {
      finalFileName = `${cleanBaseName}.prn`;
    } else if (formatType === 'ORIGINAL' && document.sourceFile?.originalExtension) {
      finalFileName = `${cleanBaseName}${document.sourceFile.originalExtension}`;
    }

    a.download = finalFileName;
    window.document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  // Exportar JSON do Modelo
  const handleExportJSON = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(document, null, 2));
    const downloadAnchor = window.document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `${document.title.toLowerCase().replace(/[^a-z0-9]/g, '-')}.json`);
    window.document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <div className="wizard-modal-overlay">
      <div className="wizard-modal-content" style={{ maxWidth: '720px' }}>
        {/* Header */}
        <div className="wizard-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <div className="niche-card-icon" style={{ width: '36px', height: '36px' }}>
              <Printer size={18} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                Imprimir & Exportar Modelo
              </h2>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Envio direto para impressora ({currentPrinter?.language || 'PPLB'}) ou download em formato original.
              </p>
            </div>
          </div>
          <button className="btn" style={{ padding: '0.4rem', border: 'none' }} onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Corpo */}
        <div className="wizard-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Opção Destacada de Round-Trip quando o modelo foi importado (Item 309-320) */}
          <div style={{ background: 'var(--canvas-bg)', padding: '0.85rem', borderRadius: '8px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Sparkles size={15} color="var(--accent-blue)" />
                <span style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                  Round-Trip & Exportação para o ERP
                </span>
              </div>
              <span className="preview-dimension-badge" style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem' }}>
                {document.sourceFile ? `${document.sourceFile.format.toUpperCase()} (Original)` : 'PPLB Nativo'}
              </span>
            </div>

            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
              Preservação de 100% dos comentários, macros ERP e comandos técnicos do arquivo original.
            </div>

            {/* Resumo de Preservação (Item 329) */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', fontSize: '0.68rem' }}>
              <span className="badge-tag" style={{ background: 'rgba(16, 185, 129, 0.1)', color: 'var(--status-success)', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                ✓ {roundTripData.diffSummary.preservedCommentsCount} comentários preservados
              </span>
              <span className="badge-tag" style={{ background: 'rgba(59, 130, 246, 0.1)', color: 'var(--accent-blue)', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
                ✓ {roundTripData.diffSummary.preservedConfigCommandsCount} comandos de configuração
              </span>
              <span className="badge-tag" style={{ background: 'rgba(139, 92, 246, 0.1)', color: 'var(--accent-purple)', border: '1px solid rgba(139, 92, 246, 0.2)' }}>
                ✓ {roundTripData.diffSummary.preservedConditionalsCount} regras condicionais
              </span>
              {roundTripData.diffSummary.modifiedCount > 0 && (
                <span className="badge-tag" style={{ background: 'rgba(245, 158, 11, 0.1)', color: 'var(--status-warning)', border: '1px solid rgba(245, 158, 11, 0.2)' }}>
                  ~ {roundTripData.diffSummary.modifiedCount} comandos modificados
                </span>
              )}
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.2rem' }}>
              <button
                className="btn btn-primary"
                style={{ fontSize: '0.75rem', padding: '0.35rem 0.75rem' }}
                onClick={() => handleExportModel('ORIGINAL')}
                title="Baixar modelo no formato original com preservação exata"
              >
                <Download size={13} />
                <span>Baixar Modelo</span>
              </button>

              <button
                className="btn"
                style={{ fontSize: '0.75rem', padding: '0.35rem 0.6rem' }}
                onClick={() => handleExportModel('TXT')}
                title="Baixar como arquivo de texto (.txt - recomendado)"
              >
                <span>TXT (Padrão)</span>
              </button>

              <button
                className="btn"
                style={{ fontSize: '0.75rem', padding: '0.35rem 0.6rem' }}
                onClick={() => handleExportModel('PRN')}
                title="Baixar como RAW de impressão (.prn)"
              >
                <span>PRN (RAW)</span>
              </button>

              <button
                className="btn"
                style={{ fontSize: '0.75rem', padding: '0.35rem 0.6rem' }}
                onClick={() => setShowDiff(!showDiff)}
                title="Comparar alterações realizadas no modelo (Diff)"
              >
                <FileCode size={13} />
                <span>{showDiff ? 'Ocultar Alterações' : 'Ver Alterações (Diff)'}</span>
              </button>

              <button
                className="btn"
                style={{ fontSize: '0.75rem', padding: '0.35rem 0.6rem' }}
                onClick={handleExportJSON}
                title="Exportar JSON do modelo Witiquetas (Avançado)"
              >
                <span>JSON</span>
              </button>
            </div>

            {/* Painel de Diff (Item 328) */}
            {showDiff && (
              <div style={{ marginTop: '0.5rem', borderTop: '1px solid var(--border-color)', paddingTop: '0.5rem' }}>
                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                  Comparação do Código Original vs. Exportado:
                </span>
                <pre className="code-block" style={{ maxHeight: '160px', overflowY: 'auto', fontSize: '0.68rem', marginTop: '0.3rem' }}>
                  {roundTripData.diffSummary.lines.map((l, idx) => (
                    <div
                      key={idx}
                      style={{
                        color:
                          l.type === 'modified'
                            ? 'var(--status-warning)'
                            : l.type === 'added'
                            ? 'var(--status-success)'
                            : l.type === 'deleted'
                            ? 'var(--status-danger)'
                            : 'var(--text-muted)',
                      }}
                    >
                      {l.type === 'added'
                        ? `+ ${l.newLine}`
                        : l.type === 'deleted'
                        ? `- ${l.originalLine}`
                        : l.type === 'modified'
                        ? `~ ${l.newLine} (antes: ${l.originalLine})`
                        : `  ${l.originalLine}`}
                    </div>
                  ))}
                </pre>
              </div>
            )}
          </div>

          {/* Seleção de Impressora */}
          <div>
            <label className="metric-label">Selecione a Impressora de Destino</label>
            <select
              className="inspector-select"
              value={selectedPrinterId}
              onChange={(e) => {
                setSelectedPrinterId(e.target.value);
                const prn = printers.find((p) => p.id === e.target.value);
                if (prn) setSelectedPrinter(prn);
              }}
              style={{ fontWeight: 600, fontSize: '0.85rem' }}
            >
              {printers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {p.language} ({p.dpi} DPI) {p.isDefault ? '★ Padrão' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Informações da Impressora & Quantidade de Cópias */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '1rem', background: 'var(--bg-card)', padding: '0.85rem', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
            <div>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600 }}>Protocolo & Cabeçote:</span>
              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '0.1rem' }}>
                {currentPrinter?.protocol} • {currentPrinter?.dpi} DPI (104 mm)
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--status-success)', marginTop: '0.2rem' }}>
                ✓ Impressão direta sem conversão para PDF
              </div>
            </div>

            {/* Input Numérico Único de Cópias */}
            <div>
              <label className="metric-label">Número de Cópias</label>
              <input
                type="number"
                min="1"
                max="999"
                className="inspector-input"
                value={copies}
                onChange={(e) => setCopies(Math.max(1, parseInt(e.target.value) || 1))}
                style={{ fontWeight: 700, fontSize: '0.9rem', textAlign: 'center' }}
              />
            </div>
          </div>

          {/* Feedback de Sucesso ou Erro */}
          {printSuccess && (
            <div style={{ padding: '0.75rem', background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '8px', color: 'var(--status-success)', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', fontWeight: 600 }}>
              <CheckCircle2 size={16} />
              <span>Job criado com sucesso! Aguardando Agent ({createdJobId || 'em fila'}).</span>
            </div>
          )}

          {printError && (
            <div style={{ padding: '0.75rem', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '8px', color: 'var(--status-danger)', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem' }}>
              <AlertTriangle size={16} />
              <span>{printError}</span>
            </div>
          )}

          {/* Accordion Técnico: Código Compilado para Impressão */}
          <div className="inspector-accordion" style={{ border: '1px solid var(--border-color)', borderRadius: '8px', overflow: 'hidden' }}>
            <div className="inspector-accordion-header" onClick={() => setIsAdvancedOpen(!isAdvancedOpen)}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Terminal size={14} color="var(--accent-blue)" />
                <span>Avançado: Ver Comandos RAW de Hardware</span>
              </span>
              {isAdvancedOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
            </div>

            {isAdvancedOpen && (
              <div className="inspector-accordion-content" style={{ padding: '0.75rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Payload de Comandos ({currentPrinter?.language}):</span>
                  <button
                    className="btn"
                    style={{ padding: '0.2rem 0.5rem', fontSize: '0.7rem' }}
                    onClick={() => navigator.clipboard.writeText(compiledCode)}
                    title="Copiar código"
                  >
                    <Copy size={12} /> Copiar
                  </button>
                </div>

                <pre className="code-block" style={{ maxHeight: '120px', fontSize: '0.7rem' }}>
                  {isLoading ? 'Compilando comandos de hardware...' : compiledCode}
                </pre>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="wizard-footer">
          <button className="btn" onClick={onClose}>
            Fechar
          </button>

          <button
            className="btn btn-primary"
            onClick={handlePrint}
            disabled={isPrinting || !selectedPrinterId}
            style={{ padding: '0.5rem 1.25rem' }}
          >
            <Printer size={16} />
            <span>{isPrinting ? 'Enviando...' : `Imprimir ${copies} ${copies > 1 ? 'Cópias' : 'Cópia'}`}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
