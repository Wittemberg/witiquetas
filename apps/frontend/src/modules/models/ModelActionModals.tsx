import React, { useState, useEffect } from 'react';

interface RenameModalProps {
  isOpen: boolean;
  currentTitle: string;
  onConfirm: (newTitle: string) => void;
  onClose: () => void;
  isLoading?: boolean;
}

export const RenameModelModal: React.FC<RenameModalProps> = ({
  isOpen,
  currentTitle,
  onConfirm,
  onClose,
  isLoading,
}) => {
  const [title, setTitle] = useState(currentTitle);
  const [error, setError] = useState('');

  useEffect(() => {
    setTitle(currentTitle);
    setError('');
  }, [currentTitle, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) {
      setError('O nome do modelo não pode ser vazio.');
      return;
    }
    setError('');
    onConfirm(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <div className="wizard-modal-overlay" onKeyDown={handleKeyDown}>
      <div className="wizard-modal-content" style={{ maxWidth: '440px' }}>
        <div className="wizard-header">
          <h2>Renomear Modelo</h2>
          <button type="button" className="wizard-close-btn" onClick={onClose}>
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="wizard-body" style={{ padding: '1.5rem 0' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>
              Nome do Modelo:
            </label>
            <input
              type="text"
              className="niche-search-input"
              style={{ width: '100%', padding: '0.6rem 0.8rem' }}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Digite o novo nome do modelo..."
              autoFocus
              maxLength={120}
              disabled={isLoading}
            />
            {error && (
              <span style={{ color: '#ef4444', fontSize: '0.85rem', marginTop: '0.4rem', display: 'block' }}>
                {error}
              </span>
            )}
          </div>

          <div className="wizard-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
            <button
              type="button"
              className="niche-card-btn"
              style={{ background: 'transparent', border: '1px solid var(--border-color, #cbd5e1)' }}
              onClick={onClose}
              disabled={isLoading}
            >
              Cancelar
            </button>
            <button type="submit" className="wizard-primary-btn" disabled={isLoading || !title.trim()}>
              {isLoading ? 'Salvando...' : 'Renomear'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

interface DeleteModalProps {
  isOpen: boolean;
  modelTitle: string;
  onConfirm: () => void;
  onClose: () => void;
  isLoading?: boolean;
}

export const DeleteModelModal: React.FC<DeleteModalProps> = ({
  isOpen,
  modelTitle,
  onConfirm,
  onClose,
  isLoading,
}) => {
  if (!isOpen) return null;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <div className="wizard-modal-overlay" onKeyDown={handleKeyDown}>
      <div className="wizard-modal-content" style={{ maxWidth: '440px' }}>
        <div className="wizard-header">
          <h2 style={{ color: '#ef4444' }}>Excluir Modelo</h2>
          <button type="button" className="wizard-close-btn" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="wizard-body" style={{ padding: '1.5rem 0' }}>
          <p style={{ fontSize: '1rem', color: 'var(--text-main, #0f172a)', marginBottom: '0.5rem' }}>
            Tem certeza que deseja excluir o modelo <strong>"{modelTitle}"</strong>?
          </p>
          <p style={{ fontSize: '0.875rem', color: '#64748b' }}>
            Esta ação remove o modelo da sua lista de trabalho.
          </p>
        </div>

        <div className="wizard-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
          <button
            type="button"
            className="niche-card-btn"
            style={{ background: 'transparent', border: '1px solid var(--border-color, #cbd5e1)' }}
            onClick={onClose}
            disabled={isLoading}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="wizard-primary-btn"
            style={{ backgroundColor: '#dc2626', borderColor: '#dc2626' }}
            onClick={onConfirm}
            disabled={isLoading}
          >
            {isLoading ? 'Excluindo...' : 'Excluir Modelo'}
          </button>
        </div>
      </div>
    </div>
  );
};
