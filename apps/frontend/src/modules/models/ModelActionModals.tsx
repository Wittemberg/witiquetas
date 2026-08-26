import React, { useState, useEffect } from 'react';
import { X, AlertTriangle, Edit3 } from 'lucide-react';

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
      <div className="wizard-modal-content" style={{ maxWidth: '460px' }}>
        <div className="wizard-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <div className="niche-card-icon" style={{ width: '32px', height: '32px', borderRadius: '8px' }}>
              <Edit3 size={16} />
            </div>
            <h2 style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)' }}>
              Renomear Modelo
            </h2>
          </div>
          <button
            type="button"
            className="btn"
            style={{ padding: '0.4rem', border: 'none', background: 'transparent' }}
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="wizard-body" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <label style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              Nome do modelo
            </label>
            <input
              type="text"
              className="size-search-input"
              style={{
                width: '100%',
                height: '42px',
                padding: '0 0.85rem',
                borderRadius: '10px',
                border: '1px solid var(--border-color)',
                background: 'var(--bg-input)',
                fontSize: '0.875rem',
                color: 'var(--text-primary)',
                boxSizing: 'border-box',
              }}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Digite o novo nome do modelo..."
              autoFocus
              maxLength={120}
              disabled={isLoading}
            />
            {error && (
              <span style={{ color: 'var(--status-danger)', fontSize: '0.8rem', fontWeight: 500 }}>
                {error}
              </span>
            )}
          </div>

          <div className="wizard-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
            <button
              type="button"
              className="btn"
              onClick={onClose}
              disabled={isLoading}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isLoading || !title.trim()}
            >
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
      <div className="wizard-modal-content" style={{ maxWidth: '460px' }}>
        <div className="wizard-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              background: 'rgba(239, 68, 68, 0.12)',
              color: 'var(--status-danger)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <AlertTriangle size={16} />
            </div>
            <h2 style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)' }}>
              Excluir Modelo
            </h2>
          </div>
          <button
            type="button"
            className="btn"
            style={{ padding: '0.4rem', border: 'none', background: 'transparent' }}
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>

        <div className="wizard-body" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <p style={{ fontSize: '0.925rem', color: 'var(--text-primary)', lineHeight: 1.5 }}>
            Tem certeza que deseja excluir:
          </p>
          <div style={{
            padding: '0.65rem 0.85rem',
            borderRadius: '8px',
            background: 'var(--bg-input)',
            border: '1px solid var(--border-color)',
            fontSize: '0.9rem',
            fontWeight: 700,
            color: 'var(--text-primary)',
          }}>
            {modelTitle}
          </div>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            Esta ação remove o modelo da sua lista.
          </p>
        </div>

        <div className="wizard-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
          <button
            type="button"
            className="btn"
            onClick={onClose}
            disabled={isLoading}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="btn btn-danger"
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
