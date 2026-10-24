import React, { useState, useEffect, useCallback } from 'react';
import {
  ScrollText,
  Search,
  RefreshCw,
  Filter,
  Eye,
  X,
  AlertCircle,
  User,
  Shield,
  Building,
  Sparkles,
  Lock,
  ChevronLeft,
  ChevronRight,
  Info,
} from 'lucide-react';
import {
  AdminAuditLogEntryDTO,
  AdminAuditCategory,
  AdminAuditListResponseDTO,
} from '@witiquetas/contracts';
import { fetchAdminAuditLogs } from '../../services/adminAuditApi.js';

interface AuditAdminViewProps {
  onFeedback?: (msg: string, type: 'success' | 'error' | 'info') => void;
}

export const AuditAdminView: React.FC<AuditAdminViewProps> = ({ onFeedback }) => {
  const [logs, setLogs] = useState<AdminAuditLogEntryDTO[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filtros e Paginação
  const [page, setPage] = useState<number>(1);
  const [limit] = useState<number>(15);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalCount, setTotalCount] = useState<number>(0);

  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [searchAction, setSearchAction] = useState<string>('');
  const [periodFilter, setPeriodFilter] = useState<'ALL' | 'TODAY' | '7D' | '30D'>('ALL');

  // Modal de Detalhes
  const [selectedLog, setSelectedLog] = useState<AdminAuditLogEntryDTO | null>(null);

  const calculateDateRange = useCallback((period: 'ALL' | 'TODAY' | '7D' | '30D') => {
    if (period === 'ALL') return { startDate: undefined, endDate: undefined };

    const now = new Date();
    if (period === 'TODAY') {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      return { startDate: start.toISOString(), endDate: undefined };
    }
    if (period === '7D') {
      const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return { startDate: start.toISOString(), endDate: undefined };
    }
    if (period === '30D') {
      const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      return { startDate: start.toISOString(), endDate: undefined };
    }
    return { startDate: undefined, endDate: undefined };
  }, []);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { startDate, endDate } = calculateDateRange(periodFilter);
      const res: AdminAuditListResponseDTO = await fetchAdminAuditLogs({
        page,
        limit,
        category: categoryFilter !== 'ALL' ? (categoryFilter as AdminAuditCategory) : undefined,
        action: searchAction.trim() || undefined,
        startDate,
        endDate,
      });

      setLogs(res.logs);
      setTotalPages(res.totalPages);
      setTotalCount(res.total);
    } catch (err: any) {
      const msg = err.message || 'Erro ao carregar registros de auditoria.';
      setError(msg);
      if (onFeedback) onFeedback(msg, 'error');
    } finally {
      setLoading(false);
    }
  }, [page, limit, categoryFilter, searchAction, periodFilter, calculateDateRange, onFeedback]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    loadLogs();
  };

  const getCategoryIcon = (category: AdminAuditCategory) => {
    switch (category) {
      case 'USER':
        return <User size={14} className="category-icon" />;
      case 'ROLE':
        return <Shield size={14} className="category-icon" />;
      case 'COMPANY':
        return <Building size={14} className="category-icon" />;
      case 'UPDATES':
        return <Sparkles size={14} className="category-icon" />;
      case 'SECURITY':
        return <Lock size={14} className="category-icon" />;
      default:
        return <ScrollText size={14} className="category-icon" />;
    }
  };

  const getSeverityBadgeClass = (severity: string) => {
    switch (severity) {
      case 'CRITICAL':
        return 'badge badge-danger';
      case 'WARN':
        return 'badge badge-warning';
      default:
        return 'badge badge-info';
    }
  };

  const formatDate = (isoStr: string) => {
    try {
      const d = new Date(isoStr);
      return d.toLocaleString('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'medium',
      });
    } catch {
      return isoStr;
    }
  };

  return (
    <div className="admin-audit-view" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Cabeçalho */}
      <div className="admin-header-toolbar">
        <div>
          <h3 className="admin-section-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <ScrollText size={20} /> Trilha de Auditoria Administrativa
          </h3>
          <p className="admin-section-subtitle">
            Registro imutável de eventos operacionais, alterações de usuários, perfis, configurações e notas da plataforma.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => {
              setPage(1);
              loadLogs();
            }}
            disabled={loading}
            title="Atualizar lista"
          >
            <RefreshCw size={15} className={loading ? 'spin' : ''} />
            Atualizar
          </button>
        </div>
      </div>

      {/* Barra de Filtros */}
      <div className="admin-filter-bar" style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center', justifyContent: 'space-between' }}>
        <form onSubmit={handleSearchSubmit} className="admin-search-wrapper" style={{ display: 'flex', alignItems: 'center', flex: '1 1 280px' }}>
          <Search size={16} className="search-icon" />
          <input
            type="text"
            className="admin-search-input"
            placeholder="Buscar por ação (ex: user.create, role.update)..."
            value={searchAction}
            onChange={(e) => setSearchAction(e.target.value)}
          />
        </form>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' }}>
          {/* Filtro de Categoria */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Filter size={15} style={{ opacity: 0.6 }} />
            <select
              className="admin-select"
              value={categoryFilter}
              onChange={(e) => {
                setCategoryFilter(e.target.value);
                setPage(1);
              }}
              style={{
                padding: '0.45rem 0.75rem',
                borderRadius: '6px',
                border: '1px solid var(--border-color, #cbd5e1)',
                background: 'var(--bg-surface, #ffffff)',
                color: 'inherit',
                fontSize: '0.875rem',
              }}
            >
              <option value="ALL">Todas as Categorias</option>
              <option value="USER">Usuários</option>
              <option value="ROLE">Perfis & Permissões</option>
              <option value="COMPANY">Configuração da Empresa</option>
              <option value="UPDATES">Atualizações & Releases</option>
              <option value="SECURITY">Segurança & Autenticação</option>
            </select>
          </div>

          {/* Filtro de Período */}
          <div className="admin-filter-tabs">
            <button
              type="button"
              className={`admin-filter-tab ${periodFilter === 'ALL' ? 'active' : ''}`}
              onClick={() => {
                setPeriodFilter('ALL');
                setPage(1);
              }}
            >
              Tudo
            </button>
            <button
              type="button"
              className={`admin-filter-tab ${periodFilter === 'TODAY' ? 'active' : ''}`}
              onClick={() => {
                setPeriodFilter('TODAY');
                setPage(1);
              }}
            >
              Hoje
            </button>
            <button
              type="button"
              className={`admin-filter-tab ${periodFilter === '7D' ? 'active' : ''}`}
              onClick={() => {
                setPeriodFilter('7D');
                setPage(1);
              }}
            >
              7 dias
            </button>
            <button
              type="button"
              className={`admin-filter-tab ${periodFilter === '30D' ? 'active' : ''}`}
              onClick={() => {
                setPeriodFilter('30D');
                setPage(1);
              }}
            >
              30 dias
            </button>
          </div>
        </div>
      </div>

      {/* Feedback de Erro */}
      {error && (
        <div className="admin-feedback-banner error" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* Tabela de Eventos */}
      <div className="admin-table-container">
        <table className="admin-table">
          <thead>
            <tr>
              <th style={{ width: '160px' }}>Data / Hora</th>
              <th style={{ width: '130px' }}>Categoria</th>
              <th>Ação</th>
              <th>Operador</th>
              <th style={{ width: '100px' }}>Severidade</th>
              <th style={{ width: '80px', textAlign: 'center' }}>Detalhes</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '2.5rem' }}>
                  <div className="btn-spinner" style={{ margin: '0 auto 0.75rem auto' }} />
                  <span style={{ fontSize: '0.875rem', opacity: 0.7 }}>Carregando eventos de auditoria...</span>
                </td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={6} className="admin-table-empty" style={{ textAlign: 'center', padding: '2.5rem' }}>
                  <Info size={24} style={{ margin: '0 auto 0.5rem auto', opacity: 0.5 }} />
                  <div>Nenhum registro de auditoria encontrado com os filtros atuais.</div>
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr key={log.id}>
                  <td style={{ fontSize: '0.85rem', whiteSpace: 'nowrap', opacity: 0.85 }}>
                    {formatDate(log.createdAt)}
                  </td>
                  <td>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        padding: '0.2rem 0.5rem',
                        borderRadius: '4px',
                        background: 'var(--bg-subtle, #f1f5f9)',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                      }}
                    >
                      {getCategoryIcon(log.category)}
                      {log.category}
                    </span>
                  </td>
                  <td>
                    <code style={{ fontSize: '0.85rem', fontWeight: 600 }}>{log.action}</code>
                    {log.targetType && log.targetId && (
                      <span style={{ display: 'block', fontSize: '0.75rem', opacity: 0.65 }}>
                        Alvo: {log.targetType} ({log.targetId.slice(0, 12)}...)
                      </span>
                    )}
                  </td>
                  <td>
                    <div style={{ fontWeight: 500, fontSize: '0.875rem' }}>
                      {log.userName || 'Sistema'}
                    </div>
                    {log.userEmail && (
                      <div style={{ fontSize: '0.75rem', opacity: 0.65 }}>{log.userEmail}</div>
                    )}
                  </td>
                  <td>
                    <span className={getSeverityBadgeClass(log.severity)}>{log.severity}</span>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <button
                      type="button"
                      className="btn btn-outline"
                      style={{ padding: '0.3rem 0.6rem' }}
                      onClick={() => setSelectedLog(log)}
                      title="Ver detalhes do evento"
                    >
                      <Eye size={14} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Paginação */}
      {!loading && totalCount > 0 && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '0.5rem 0',
            fontSize: '0.875rem',
          }}
        >
          <div style={{ opacity: 0.7 }}>
            Mostrando {logs.length} de {totalCount} registro(s)
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              style={{ padding: '0.35rem 0.6rem' }}
            >
              <ChevronLeft size={16} />
              Anterior
            </button>
            <span style={{ fontWeight: 500, margin: '0 0.25rem' }}>
              Página {page} de {totalPages}
            </span>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              style={{ padding: '0.35rem 0.6rem' }}
            >
              Próxima
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Modal de Detalhes do Evento */}
      {selectedLog && (
        <div
          className="admin-modal-backdrop"
          onClick={() => setSelectedLog(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1rem',
          }}
        >
          <div
            className="admin-modal"
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--bg-surface, #ffffff)',
              color: 'var(--text-main, #0f172a)',
              borderRadius: '10px',
              width: '100%',
              maxWidth: '640px',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
              border: '1px solid var(--border-color, #e2e8f0)',
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '1.25rem 1.5rem',
                borderBottom: '1px solid var(--border-color, #e2e8f0)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <ScrollText size={20} />
                <h4 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>Detalhes do Evento de Auditoria</h4>
              </div>
              <button
                type="button"
                className="btn-icon"
                onClick={() => setSelectedLog(null)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', opacity: 0.7 }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '1.5rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', fontSize: '0.875rem' }}>
                <div>
                  <strong style={{ display: 'block', opacity: 0.6, fontSize: '0.75rem' }}>ID DO REGISTRO</strong>
                  <code style={{ fontSize: '0.8rem' }}>{selectedLog.id}</code>
                </div>
                <div>
                  <strong style={{ display: 'block', opacity: 0.6, fontSize: '0.75rem' }}>DATA / HORA (UTC)</strong>
                  <span>{formatDate(selectedLog.createdAt)}</span>
                </div>
                <div>
                  <strong style={{ display: 'block', opacity: 0.6, fontSize: '0.75rem' }}>AÇÃO EXECUTADA</strong>
                  <code>{selectedLog.action}</code>
                </div>
                <div>
                  <strong style={{ display: 'block', opacity: 0.6, fontSize: '0.75rem' }}>CATEGORIA & SEVERIDADE</strong>
                  <span style={{ display: 'inline-flex', gap: '0.5rem', alignItems: 'center' }}>
                    <span style={{ fontWeight: 600 }}>{selectedLog.category}</span>
                    <span className={getSeverityBadgeClass(selectedLog.severity)}>{selectedLog.severity}</span>
                  </span>
                </div>
                <div>
                  <strong style={{ display: 'block', opacity: 0.6, fontSize: '0.75rem' }}>OPERADOR</strong>
                  <span>{selectedLog.userName || 'Sistema'}</span>
                  {selectedLog.userEmail && <span style={{ opacity: 0.65 }}> ({selectedLog.userEmail})</span>}
                </div>
                <div>
                  <strong style={{ display: 'block', opacity: 0.6, fontSize: '0.75rem' }}>IP DE ORIGEM</strong>
                  <span>{selectedLog.ipAddress || 'Não informado'}</span>
                </div>
                {selectedLog.targetId && (
                  <div style={{ gridColumn: 'span 2' }}>
                    <strong style={{ display: 'block', opacity: 0.6, fontSize: '0.75rem' }}>ALVO DA OPERAÇÃO</strong>
                    <span>
                      {selectedLog.targetType ? `${selectedLog.targetType}: ` : ''}
                      <code>{selectedLog.targetId}</code>
                    </span>
                  </div>
                )}
              </div>

              {/* Detalhes JSON Sanitizados */}
              <div>
                <strong style={{ display: 'block', marginBottom: '0.35rem', opacity: 0.6, fontSize: '0.75rem' }}>
                  DADOS E PARÂMETROS DO EVENTO (SANITIZADOS)
                </strong>
                <pre
                  style={{
                    margin: 0,
                    padding: '0.85rem',
                    borderRadius: '6px',
                    background: 'var(--bg-code, #0f172a)',
                    color: 'var(--text-code, #f8fafc)',
                    fontSize: '0.8rem',
                    overflowX: 'auto',
                    fontFamily: 'monospace',
                    maxHeight: '220px',
                  }}
                >
                  {selectedLog.details && Object.keys(selectedLog.details).length > 0
                    ? JSON.stringify(selectedLog.details, null, 2)
                    : '// Sem parâmetros adicionais registrados'}
                </pre>
              </div>
            </div>

            {/* Modal Footer */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                padding: '1rem 1.5rem',
                borderTop: '1px solid var(--border-color, #e2e8f0)',
              }}
            >
              <button type="button" className="btn btn-outline" onClick={() => setSelectedLog(null)}>
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
