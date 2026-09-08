import React from 'react';
import { ShieldAlert, ArrowLeft } from 'lucide-react';

interface AccessDeniedViewProps {
  onGoHome: () => void;
  title?: string;
  message?: string;
}

export const AccessDeniedView: React.FC<AccessDeniedViewProps> = ({
  onGoHome,
  title = 'Você não tem acesso a esta área',
  message = 'Seu perfil não possui permissão para acessar este recurso. Se precisar deste acesso, procure o administrador da sua empresa.',
}) => {
  return (
    <div className="access-denied-container">
      <div className="access-denied-card">
        <div className="access-denied-icon-badge">
          <ShieldAlert size={36} color="var(--status-warning)" />
        </div>
        <h2 className="access-denied-title">{title}</h2>
        <p className="access-denied-message">{message}</p>
        <button
          type="button"
          className="btn btn-primary access-denied-btn"
          onClick={onGoHome}
        >
          <ArrowLeft size={16} />
          <span>Voltar ao Dashboard</span>
        </button>
      </div>
    </div>
  );
};
