import React, { useState, useEffect } from 'react';
import {
  Download,
  CheckCircle2,
  Clock,
  Laptop,
  Smartphone,
  ChevronDown,
  ChevronUp,
  X,
  AlertCircle,
  HelpCircle,
  Monitor,
  Terminal,
  Layers,
  Sparkles,
} from 'lucide-react';
import {
  detectPlatform,
  type PlatformDetectionResult,
  type PlatformKey,
} from './agentPlatformDetector';
import {
  AGENT_RELEASE_MANIFEST,
  getReleaseForPlatform,
  getDesktopPlatformReleases,
  type AgentPlatformInfo,
} from './agentReleaseManifest';

interface DownloadAgentModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function DownloadAgentModal({ isOpen, onClose }: DownloadAgentModalProps) {
  const [detection, setDetection] = useState<PlatformDetectionResult | null>(null);
  const [isLoadingDetection, setIsLoadingDetection] = useState(true);
  const [showAllPlatforms, setShowAllPlatforms] = useState(false);
  const [downloadingPlatformKey, setDownloadingPlatformKey] = useState<PlatformKey | null>(null);
  const [downloadSuccess, setDownloadSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    setIsLoadingDetection(true);
    detectPlatform()
      .then((res) => {
        setDetection(res);
        // Se for desconhecido ou mobile, abre a grade completa por padrão
        if (res.platformKey === 'UNKNOWN' || res.isMobile) {
          setShowAllPlatforms(true);
        } else {
          setShowAllPlatforms(false);
        }
      })
      .catch(() => {
        setDetection({
          platformKey: 'WINDOWS_X64',
          osKey: 'windows',
          osName: 'Windows',
          arch: 'x86_64',
          archName: '64 bits (x64)',
          confidence: 'partial',
          isMobile: false,
        });
      })
      .finally(() => {
        setIsLoadingDetection(false);
      });
  }, [isOpen]);

  if (!isOpen) return null;

  const detectedRelease = detection ? getReleaseForPlatform(detection.platformKey) : null;
  const desktopReleases = getDesktopPlatformReleases();

  const handleDownload = (release: AgentPlatformInfo) => {
    if (release.status !== 'AVAILABLE' || !release.downloadUrl) {
      return;
    }

    setDownloadingPlatformKey(release.key);
    setDownloadSuccess(null);

    // Inicia download direto do binário sem expor credenciais
    const link = window.document.createElement('a');
    link.href = release.downloadUrl;
    link.download = release.fileName || 'witiquetas-agent.exe';
    window.document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(() => {
      setDownloadingPlatformKey(null);
      setDownloadSuccess(release.fileName || 'witiquetas-agent');
      setTimeout(() => setDownloadSuccess(null), 5000);
    }, 600);
  };

  const getOsIcon = (osKey: string) => {
    switch (osKey) {
      case 'windows':
        return <span style={{ fontSize: '1.25rem' }}>🪟</span>;
      case 'macos':
        return <span style={{ fontSize: '1.25rem' }}>🍎</span>;
      case 'linux':
        return <span style={{ fontSize: '1.25rem' }}>🐧</span>;
      case 'freebsd':
        return <span style={{ fontSize: '1.25rem' }}>😈</span>;
      case 'android':
      case 'ios':
        return <Smartphone size={20} color="var(--accent-purple)" />;
      default:
        return <Monitor size={20} color="var(--accent-blue)" />;
    }
  };

  return (
    <div className="wizard-modal-overlay" onClick={onClose}>
      <div
        className="wizard-modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: '720px',
          width: '95%',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          padding: 0,
          overflow: 'hidden',
          borderRadius: '16px',
          border: '1px solid var(--border-color)',
          background: 'var(--modal-bg)',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.4)',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '1.25rem 1.5rem',
            borderBottom: '1px solid var(--border-color)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'var(--bg-card-hover)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, var(--accent-blue), var(--accent-purple))',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)',
              }}
            >
              <Download size={18} color="#ffffff" />
            </div>
            <div>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                Baixar Agent de Impressão
              </h2>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0.15rem 0 0 0' }}>
                Versão v{AGENT_RELEASE_MANIFEST.version} • O Agent conecta este computador às impressoras locais
              </p>
            </div>
          </div>

          <button
            className="btn"
            onClick={onClose}
            style={{
              padding: '0.4rem',
              borderRadius: '50%',
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              color: 'var(--text-muted)',
            }}
            title="Fechar"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div
          style={{
            padding: '1.5rem',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.25rem',
          }}
        >
          {/* Alerta de Download Concluído */}
          {downloadSuccess && (
            <div
              style={{
                padding: '0.75rem 1rem',
                background: 'rgba(16, 185, 129, 0.15)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                borderRadius: '10px',
                color: 'var(--status-success)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                fontSize: '0.85rem',
                fontWeight: 600,
              }}
            >
              <CheckCircle2 size={16} />
              <span>Download iniciado: <strong>{downloadSuccess}</strong>. Execute o binário no computador da impressora.</span>
            </div>
          )}

          {/* Caso 1: Detecção Mobile (Android / iOS) */}
          {detection?.isMobile && (
            <div
              style={{
                padding: '1.25rem',
                background: 'rgba(245, 158, 11, 0.1)',
                border: '1px solid rgba(245, 158, 11, 0.3)',
                borderRadius: '12px',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--status-warning)', fontWeight: 700, fontSize: '0.95rem' }}>
                <Smartphone size={18} />
                <span>Dispositivo móvel detectado ({detection.osName})</span>
              </div>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>
                Não há Agent de Impressão para dispositivos móveis. Baixe o Agent em um computador (Windows, Linux ou Mac) conectado às impressoras térmicas.
              </p>
            </div>
          )}

          {/* Caso 2: Card de Detecção Automática Recomendada (Desktop) */}
          {!detection?.isMobile && detectedRelease && (
            <div
              style={{
                padding: '1.25rem 1.5rem',
                background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(16, 185, 129, 0.08))',
                border: '1px solid var(--accent-blue)',
                borderRadius: '14px',
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem',
                position: 'relative',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--accent-blue)', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    <Sparkles size={14} />
                    <span>Detectamos este computador</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginTop: '0.3rem' }}>
                    {getOsIcon(detectedRelease.osKey)}
                    <h3 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                      {detectedRelease.name} <span style={{ color: 'var(--accent-blue)' }}>{detectedRelease.architectureName}</span>
                    </h3>
                  </div>
                </div>

                <span
                  style={{
                    fontSize: '0.75rem',
                    padding: '0.25rem 0.6rem',
                    borderRadius: '20px',
                    fontWeight: 700,
                    background: detectedRelease.status === 'AVAILABLE' ? 'rgba(16, 185, 129, 0.18)' : 'rgba(245, 158, 11, 0.18)',
                    color: detectedRelease.status === 'AVAILABLE' ? 'var(--status-success)' : 'var(--status-warning)',
                    border: `1px solid ${detectedRelease.status === 'AVAILABLE' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`,
                  }}
                >
                  {detectedRelease.badge}
                </span>
              </div>

              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>
                {detectedRelease.description}
              </p>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', paddingTop: '0.5rem', borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
                <button
                  className="btn btn-primary"
                  onClick={() => handleDownload(detectedRelease)}
                  disabled={detectedRelease.status !== 'AVAILABLE' || downloadingPlatformKey === detectedRelease.key}
                  style={{
                    padding: '0.6rem 1.4rem',
                    fontSize: '0.9rem',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    boxShadow: '0 4px 14px rgba(59, 130, 246, 0.35)',
                  }}
                >
                  <Download size={16} />
                  <span>
                    {downloadingPlatformKey === detectedRelease.key
                      ? 'Baixando...'
                      : `Baixar Agent para ${detectedRelease.name} ${detectedRelease.architectureName}`}
                  </span>
                </button>

                <button
                  className="btn"
                  onClick={() => setShowAllPlatforms(!showAllPlatforms)}
                  style={{
                    fontSize: '0.8rem',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--accent-blue)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.3rem',
                    padding: '0.3rem 0.5rem',
                  }}
                >
                  <span>{showAllPlatforms ? 'Ocultar outras versões' : 'Sistema incorreto? Escolher outra versão'}</span>
                  {showAllPlatforms ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
              </div>
            </div>
          )}

          {/* Caso 3: Grid Completo de Sistemas e Arquiteturas */}
          {(showAllPlatforms || !detectedRelease || detection?.isMobile) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h4 style={{ fontSize: '0.9rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                  Selecione seu sistema operacional e arquitetura:
                </h4>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Binários compilados nativamente em Rust
                </span>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                  gap: '0.75rem',
                }}
              >
                {desktopReleases.map((release) => {
                  const isAvailable = release.status === 'AVAILABLE';
                  const isDownloading = downloadingPlatformKey === release.key;
                  const isCurrent = detection?.platformKey === release.key;

                  return (
                    <div
                      key={release.key}
                      onClick={() => isAvailable && handleDownload(release)}
                      style={{
                        padding: '1rem',
                        borderRadius: '12px',
                        border: isCurrent
                          ? '1.5px solid var(--accent-blue)'
                          : '1px solid var(--border-color)',
                        background: isAvailable
                          ? 'var(--bg-card)'
                          : 'rgba(255, 255, 255, 0.02)',
                        cursor: isAvailable ? 'pointer' : 'not-allowed',
                        opacity: isAvailable ? 1 : 0.65,
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        gap: '0.75rem',
                        transition: 'all 0.15s ease',
                      }}
                      onMouseEnter={(e) => {
                        if (isAvailable) {
                          e.currentTarget.style.transform = 'translateY(-2px)';
                          e.currentTarget.style.borderColor = 'var(--accent-blue)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (isAvailable) {
                          e.currentTarget.style.transform = 'none';
                          e.currentTarget.style.borderColor = isCurrent ? 'var(--accent-blue)' : 'var(--border-color)';
                        }
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          {getOsIcon(release.osKey)}
                          <div>
                            <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                              {release.name}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                              {release.architectureName}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.25rem' }}>
                        <span
                          style={{
                            fontSize: '0.7rem',
                            padding: '0.15rem 0.5rem',
                            borderRadius: '12px',
                            fontWeight: 700,
                            background: isAvailable ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255, 255, 255, 0.06)',
                            color: isAvailable ? 'var(--status-success)' : 'var(--text-muted)',
                          }}
                        >
                          {isAvailable ? '✓ Disponível' : 'Em breve'}
                        </span>

                        {isAvailable && (
                          <button
                            className="btn btn-primary"
                            style={{
                              padding: '0.3rem 0.6rem',
                              fontSize: '0.75rem',
                              borderRadius: '6px',
                            }}
                            disabled={isDownloading}
                          >
                            <Download size={12} />
                            <span>{isDownloading ? '...' : 'Baixar'}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Card Resumo de Instruções de Execução */}
          <div
            style={{
              padding: '1rem 1.25rem',
              background: 'var(--bg-card-hover)',
              borderRadius: '12px',
              border: '1px solid var(--border-color)',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.4rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              <Terminal size={15} color="var(--accent-cyan)" />
              <span>Como executar o Agent após o download:</span>
            </div>
            <ol style={{ margin: '0.2rem 0 0 1.2rem', padding: 0, fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
              <li>Execute o arquivo <code>witiquetas-agent-windows-x64.exe</code> no computador conectado à impressora.</li>
              <li>O Agent iniciará automaticamente e solicitará o pareamento de segurança.</li>
              <li>Pronto! Todas as impressões disparadas pelo navegador serão enviadas diretamente em RAW TCP.</li>
            </ol>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '1rem 1.5rem',
            borderTop: '1px solid var(--border-color)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'var(--bg-card)',
          }}
        >
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <CheckCircle2 size={13} color="var(--status-success)" />
            <span>Binário assinado e livre de dependências de runtime.</span>
          </div>

          <button className="btn" onClick={onClose} style={{ padding: '0.5rem 1.2rem' }}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
