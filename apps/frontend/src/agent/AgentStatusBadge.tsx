import React from 'react';
import { CheckCircle2, XCircle, AlertTriangle, ShieldAlert, RefreshCw } from 'lucide-react';
import type { AgentStatus } from '@witiquetas/contracts';

interface AgentStatusBadgeProps {
  status: AgentStatus | string;
  size?: 'sm' | 'md';
}

export const AgentStatusBadge: React.FC<AgentStatusBadgeProps> = ({ status, size = 'md' }) => {
  const normalized = (status || 'OFFLINE').toUpperCase();
  const iconSize = size === 'sm' ? 12 : 13;

  switch (normalized) {
    case 'ONLINE':
      return (
        <span
          className="badge badge-success"
          data-testid="agent-status-badge-online"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.35rem',
            fontWeight: 600,
            fontSize: size === 'sm' ? '0.75rem' : '0.8rem',
            padding: size === 'sm' ? '0.2rem 0.55rem' : '0.25rem 0.65rem',
          }}
        >
          <CheckCircle2 size={iconSize} />
          <span>Online</span>
        </span>
      );

    case 'OFFLINE':
      return (
        <span
          className="badge badge-danger"
          data-testid="agent-status-badge-offline"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.35rem',
            fontWeight: 600,
            fontSize: size === 'sm' ? '0.75rem' : '0.8rem',
            padding: size === 'sm' ? '0.2rem 0.55rem' : '0.25rem 0.65rem',
          }}
        >
          <XCircle size={iconSize} />
          <span>Offline</span>
        </span>
      );

    case 'PAIRING':
      return (
        <span
          className="badge badge-warning"
          data-testid="agent-status-badge-pairing"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.35rem',
            fontWeight: 600,
            fontSize: size === 'sm' ? '0.75rem' : '0.8rem',
            padding: size === 'sm' ? '0.2rem 0.55rem' : '0.25rem 0.65rem',
          }}
        >
          <RefreshCw size={iconSize} className="spin" />
          <span>Pareando</span>
        </span>
      );

    case 'REVOKED':
    case 'UNAUTHORIZED':
      return (
        <span
          className="badge badge-secondary"
          data-testid="agent-status-badge-revoked"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.35rem',
            fontWeight: 600,
            fontSize: size === 'sm' ? '0.75rem' : '0.8rem',
            padding: size === 'sm' ? '0.2rem 0.55rem' : '0.25rem 0.65rem',
            opacity: 0.85,
          }}
        >
          <ShieldAlert size={iconSize} />
          <span>Revogado</span>
        </span>
      );

    case 'ERROR':
    case 'DEGRADED':
    default:
      return (
        <span
          className="badge badge-warning"
          data-testid="agent-status-badge-error"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.35rem',
            fontWeight: 600,
            fontSize: size === 'sm' ? '0.75rem' : '0.8rem',
            padding: size === 'sm' ? '0.2rem 0.55rem' : '0.25rem 0.65rem',
          }}
        >
          <AlertTriangle size={iconSize} />
          <span>{normalized === 'DEGRADED' ? 'Degradado' : 'Erro'}</span>
        </span>
      );
  }
};
