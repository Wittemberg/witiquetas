import React from 'react';
import { ArrowLeft, Clock } from 'lucide-react';

interface PlaceholderModulePageProps {
  title: string;
  icon: React.ComponentType<{ className?: string; size?: number }> | string;
  description: string;
  upcomingFeatures?: string[];
  onGoHome?: () => void;
}

export const PlaceholderModulePage: React.FC<PlaceholderModulePageProps> = ({
  title,
  icon: IconProp,
  description,
  onGoHome,
}) => {
  const renderIcon = () => {
    if (typeof IconProp === 'string') {
      return <span className="placeholder-emoji">{IconProp}</span>;
    }
    const IconComponent = IconProp;
    return <IconComponent size={40} className="placeholder-icon-svg" />;
  };

  return (
    <div className="placeholder-module-container">
      <div className="placeholder-card">
        <div className="placeholder-icon-wrapper">
          {renderIcon()}
        </div>

        <div className="placeholder-badge">
          <Clock size={14} />
          <span>EM DESENVOLVIMENTO</span>
        </div>

        <h1 className="placeholder-title">{title}</h1>
        <p className="placeholder-description">{description}</p>

        <div className="placeholder-card-footer">
          {onGoHome && (
            <button type="button" className="btn-placeholder-action" onClick={onGoHome}>
              <ArrowLeft size={16} />
              <span>Voltar para o Início</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

