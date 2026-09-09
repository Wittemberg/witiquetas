import React, { useState } from 'react';
import { ShieldCheck, ShieldAlert, Lock, Mail, AlertCircle, Loader2, KeyRound, ArrowLeft } from 'lucide-react';
import { loginUser, resolveLoginMode, fetchSessionContext, SessionContext } from './session.js';
import { devControlApi } from '../services/devControlApi.js';

interface LoginFormProps {
  onLoginSuccess: (context: SessionContext) => void;
  onDeveloperLoginSuccess?: () => void;
}

export const LoginForm: React.FC<LoginFormProps> = ({ onLoginSuccess, onDeveloperLoginSuccess }) => {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [mode, setMode] = useState<'TENANT_PASSWORD' | 'DEVELOPER_TOTP'>('TENANT_PASSWORD');
  const [developerName, setDeveloperName] = useState('Marcel');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Verifica em tempo hábil se o identificador digitado é o desenvolvedor
  const handleIdentifierBlur = async () => {
    const trimmed = identifier.trim();
    if (!trimmed) return;

    try {
      const res = await resolveLoginMode(trimmed);
      if (res.authMode === 'DEVELOPER_TOTP') {
        setMode('DEVELOPER_TOTP');
        setDeveloperName(res.identifier || 'Marcel');
        setError(null);
      }
    } catch {
      // Em caso de falha de rede na resolução, mantém modo comercial
    }
  };

  const handleCommercialSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = identifier.trim();
    if (!trimmed) {
      setError('Informe o e-mail ou usuário.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // 1. Resolve server-authoritatively se é Developer TOTP ou Tenant Password
      const modeResult = await resolveLoginMode(trimmed);
      if (modeResult.authMode === 'DEVELOPER_TOTP') {
        setMode('DEVELOPER_TOTP');
        setDeveloperName(modeResult.identifier || 'Marcel');
        setLoading(false);
        return;
      }

      // 2. Se for Tenant, exige senha
      if (!password.trim()) {
        setError('Informe a senha.');
        setLoading(false);
        return;
      }

      const result = await loginUser(trimmed, password);
      if (result.success && result.context) {
        onLoginSuccess(result.context);
      } else {
        setError(result.error || 'Credenciais inválidas.');
      }
    } catch (err: any) {
      setError(err.message || 'Erro ao conectar ao servidor.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeveloperSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!totpCode || totpCode.trim().length !== 6) {
      setError('Informe o código TOTP de 6 dígitos.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await devControlApi.developerLogin(developerName, totpCode.trim());
      // Plataforma Developer: carrega o SessionContext e entra diretamente no Dashboard / Shell
      const context = await fetchSessionContext();
      if (context) {
        onLoginSuccess(context);
      } else if (onDeveloperLoginSuccess) {
        onDeveloperLoginSuccess();
      } else {
        window.location.hash = '#home';
        window.location.reload();
      }
    } catch (err: any) {
      setError(err.message || 'Falha ao autenticar desenvolvedor.');
    } finally {
      setLoading(false);
    }
  };

  const handleBackToCommercial = () => {
    setMode('TENANT_PASSWORD');
    setTotpCode('');
    setError(null);
  };

  return (
    <div className="login-page-container">
      <div className="login-card">
        <div className="login-header">
          <div className="login-logo-badge" style={mode === 'DEVELOPER_TOTP' ? { background: 'rgba(139, 92, 246, 0.15)', borderColor: 'rgba(139, 92, 246, 0.4)', color: 'var(--accent-purple, #a855f7)' } : undefined}>
            {mode === 'DEVELOPER_TOTP' ? <ShieldAlert size={28} /> : <ShieldCheck size={28} className="login-icon" />}
          </div>
          <h1 className="login-title">
            {mode === 'DEVELOPER_TOTP' ? 'Acesso do Desenvolvedor' : 'Witiquetas'}
          </h1>
          <p className="login-subtitle">
            {mode === 'DEVELOPER_TOTP' ? 'Identidade de Plataforma' : 'Acesso ao Sistema'}
          </p>
        </div>

        {error && (
          <div className="login-error-alert" role="alert">
            <AlertCircle size={18} className="login-error-icon" />
            <span>{error}</span>
          </div>
        )}

        {mode === 'DEVELOPER_TOTP' ? (
          /* Fluxo de Autenticação do Desenvolvedor (RFC 6238 TOTP) */
          <form className="login-form" onSubmit={handleDeveloperSubmit} noValidate>
            <div className="login-field">
              <label className="login-label">
                Identidade do Desenvolvedor
              </label>
              <div className="login-input-wrapper">
                <input
                  type="text"
                  className="login-input"
                  value={developerName}
                  disabled={true}
                  style={{ opacity: 0.8, cursor: 'not-allowed', paddingLeft: '1rem' }}
                />
              </div>
            </div>

            <div className="login-field">
              <label htmlFor="login-totp" className="login-label">
                Código do Google Authenticator (6 dígitos)
              </label>
              <div className="login-input-wrapper">
                <KeyRound size={18} className="login-input-icon" />
                <input
                  id="login-totp"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  className="login-input"
                  placeholder="000000"
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                  disabled={loading}
                  autoFocus
                  required
                  autoComplete="one-time-code"
                  style={{ letterSpacing: '0.2em', textAlign: 'center', fontSize: '1.2rem', fontWeight: 700 }}
                />
              </div>
            </div>

            <button
              type="submit"
              className="login-submit-btn"
              disabled={loading || totpCode.length !== 6}
              style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)' }}
            >
              {loading ? (
                <>
                  <Loader2 size={18} className="btn-spinner" />
                  <span>Validando Código...</span>
                </>
              ) : (
                <span>Acessar o Sistema</span>
              )}
            </button>

            <button
              type="button"
              onClick={handleBackToCommercial}
              disabled={loading}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                background: 'transparent',
                border: '1px solid var(--border-color)',
                color: 'var(--text-secondary)',
                borderRadius: '0.5rem',
                padding: '0.65rem',
                cursor: 'pointer',
                fontSize: '0.85rem',
                fontWeight: 600,
                marginTop: '0.25rem',
              }}
            >
              <ArrowLeft size={16} />
              <span>Voltar ao Login Normal</span>
            </button>
          </form>
        ) : (
          /* Fluxo Comercial Normal do Tenant */
          <form className="login-form" onSubmit={handleCommercialSubmit} noValidate>
            <div className="login-field">
              <label htmlFor="login-identifier" className="login-label">
                E-mail ou usuário
              </label>
              <div className="login-input-wrapper">
                <Mail size={18} className="login-input-icon" />
                <input
                  id="login-identifier"
                  type="text"
                  className="login-input"
                  placeholder="usuario@empresa.com ou Marcel"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  onBlur={handleIdentifierBlur}
                  disabled={loading}
                  autoFocus
                  required
                  autoComplete="username"
                />
              </div>
            </div>

            <div className="login-field">
              <label htmlFor="login-password" className="login-label">
                Senha
              </label>
              <div className="login-input-wrapper">
                <Lock size={18} className="login-input-icon" />
                <input
                  id="login-password"
                  type="password"
                  className="login-input"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  autoComplete="current-password"
                />
              </div>
            </div>

            <button
              type="submit"
              className="login-submit-btn"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 size={18} className="btn-spinner" />
                  <span>Entrando...</span>
                </>
              ) : (
                <span>Entrar</span>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default LoginForm;
