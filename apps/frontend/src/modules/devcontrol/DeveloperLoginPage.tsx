import React, { useState } from 'react';
import { ShieldAlert, KeyRound, Lock, RefreshCw, ArrowLeft } from 'lucide-react';
import { devControlApi } from '../../services/devControlApi.js';

interface DeveloperLoginPageProps {
  onSuccess: () => void;
  onGoHome: () => void;
}

export const DeveloperLoginPage: React.FC<DeveloperLoginPageProps> = ({ onSuccess, onGoHome }) => {
  const [username, setUsername] = useState('Marcel');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code || code.trim().length !== 6) {
      setError('Informe o código TOTP de 6 dígitos.');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await devControlApi.developerLogin(username.trim(), code.trim());
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Falha ao autenticar desenvolvedor.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '70vh',
        padding: '2rem 1rem',
      }}
    >
      <div
        className="card"
        style={{
          width: '100%',
          maxWidth: '440px',
          padding: '2.5rem',
          borderRadius: '16px',
          border: '1px solid rgba(139, 92, 246, 0.3)',
          boxShadow: '0 20px 40px -15px rgba(0, 0, 0, 0.5)',
          background: 'var(--surface-primary, #18181b)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
          <div
            style={{
              padding: '0.75rem',
              borderRadius: '12px',
              background: 'rgba(139, 92, 246, 0.15)',
              color: 'var(--accent-purple, #a855f7)',
              display: 'flex',
            }}
          >
            <ShieldAlert size={28} />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)' }}>
              Acesso do Desenvolvedor
            </h2>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Development Control Center (Plataforma)
            </span>
          </div>
        </div>

        <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '1.5rem' }}>
          Ambiente interno de governança e controle de engenharia. Autenticação restrita com chave TOTP RFC 6238.
        </p>

        {error && (
          <div
            style={{
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              padding: '0.875rem 1rem',
              borderRadius: '8px',
              color: 'var(--status-danger, #ef4444)',
              marginBottom: '1.25rem',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <Lock size={16} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>
              Identidade do Desenvolvedor
            </label>
            <input
              type="text"
              className="input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Nome do desenvolvedor"
              style={{ padding: '0.75rem 1rem', borderRadius: '8px' }}
              disabled={loading}
              autoComplete="username"
            />
          </div>

          <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>
              Código TOTP (6 dígitos)
            </label>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              className="input"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              placeholder="000000"
              style={{
                padding: '0.75rem 1rem',
                borderRadius: '8px',
                fontSize: '1.25rem',
                letterSpacing: '0.25em',
                textAlign: 'center',
                fontWeight: 700,
              }}
              disabled={loading}
              autoFocus
              autoComplete="one-time-code"
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.5rem' }}>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading || code.length !== 6}
              style={{
                width: '100%',
                padding: '0.85rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                fontWeight: 700,
                background: 'linear-gradient(135deg, #7c3aed, #4f46e5)',
              }}
            >
              {loading ? (
                <>
                  <RefreshCw className="spin" size={16} />
                  <span>Validando Chave...</span>
                </>
              ) : (
                <>
                  <KeyRound size={16} />
                  <span>Autenticar no DCC</span>
                </>
              )}
            </button>

            <button
              type="button"
              className="btn btn-secondary"
              onClick={onGoHome}
              disabled={loading}
              style={{
                width: '100%',
                padding: '0.75rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                background: 'transparent',
                border: '1px solid var(--border-color)',
              }}
            >
              <ArrowLeft size={16} />
              <span>Voltar ao Início</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
