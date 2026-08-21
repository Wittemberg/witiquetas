import React from 'react';

interface PlaceholderModulePageProps {
  title: string;
  icon: string;
  description: string;
  upcomingFeatures: string[];
}

export const PlaceholderModulePage: React.FC<PlaceholderModulePageProps> = ({
  title,
  icon,
  description,
  upcomingFeatures,
}) => {
  return (
    <div className="placeholder-module-container">
      <div className="placeholder-card">
        <div className="placeholder-icon-wrapper">
          <span className="placeholder-icon">{icon}</span>
        </div>

        <div className="placeholder-badge">EM DESENVOLVIMENTO</div>

        <h1 className="placeholder-title">{title}</h1>
        <p className="placeholder-description">{description}</p>

        <div className="placeholder-features-section">
          <h3>Recursos em Preparação para os Próximos Commits:</h3>
          <ul className="placeholder-features-list">
            {upcomingFeatures.map((feature, idx) => (
              <li key={idx}>
                <span className="bullet">✓</span>
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="placeholder-info-footer">
          <small>
            O módulo <strong>{title}</strong> estará totalmente integrado nas próximas fases da plataforma Witiquetas.
          </small>
        </div>
      </div>
    </div>
  );
};
