import { Router, Request, Response, NextFunction } from 'express';
import { DevelopmentControlService } from '../services/developmentControlService.js';
import {
  developerAuthService,
  DCC_SESSION_COOKIE_NAME,
  DCC_SESSION_TTL_MS,
  DEVELOPER_IDENTITY,
} from '../services/developerAuthService.js';

const router = Router();
const service = new DevelopmentControlService();

export const isDccEnabled = (): boolean => {
  if (process.env.DCC_ENABLED !== undefined) {
    return process.env.DCC_ENABLED === 'true';
  }
  return (
    process.env.ENABLE_DEV_CONTROL_CENTER === 'true' ||
    process.env.VITE_ENABLE_DEV_CONTROL_CENTER === 'true' ||
    process.env.NODE_ENV !== 'production'
  );
};

// Middleware de proteção de ambiente e prevenção de cache (Seção 6 e 9 do Hotfix 5.3.5)
const devControlGuard = (_req: Request, res: Response, next: NextFunction) => {
  // Impede armazenamento em cache de respostas de governança/autenticação interna
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  if (!isDccEnabled()) {
    res.status(404).json({
      error: 'Módulo indisponível.',
      code: 'DCC_DISABLED',
    });
    return;
  }
  next();
};

export const getDccSessionTokenFromRequest = (req: Request): string | null => {
  const headerToken = req.headers['x-dcc-session'];
  if (typeof headerToken === 'string' && headerToken.trim().length > 0) {
    return headerToken.trim();
  }

  const rawCookieHeader = req.headers.cookie;
  if (!rawCookieHeader) {
    return null;
  }

  const cookies = rawCookieHeader.split(';').map((c) => c.trim());
  for (const cookie of cookies) {
    const [name, ...rest] = cookie.split('=');
    if (name === DCC_SESSION_COOKIE_NAME) {
      return decodeURIComponent(rest.join('='));
    }
  }

  return null;
};

// Middleware exclusivo para acesso de Desenvolvedor da Plataforma ao DCC
export const requireDeveloperAuth = (req: Request, res: Response, next: NextFunction) => {
  if (!isDccEnabled()) {
    res.status(404).json({
      error: 'Módulo indisponível.',
      code: 'DCC_DISABLED',
    });
    return;
  }

  const token = getDccSessionTokenFromRequest(req);
  if (!token) {
    res.status(401).json({
      error: 'Autenticação de desenvolvedor necessária.',
      code: 'DEVELOPER_AUTH_REQUIRED',
    });
    return;
  }

  const session = developerAuthService.validateSession(token);
  if (!session) {
    res.status(401).json({
      error: 'Sessão de desenvolvedor inválida ou expirada.',
      code: 'DEVELOPER_SESSION_INVALID',
    });
    return;
  }

  (req as any).developerSession = session;
  next();
};

router.use(devControlGuard);

// ---------------------------------------------------------------------------
// Rotas de Autenticação do Desenvolvedor (RFC 6238 TOTP)
// ---------------------------------------------------------------------------

// POST /api/development-control/auth/login
router.post('/auth/login', async (req: Request, res: Response) => {
  try {
    const { username, code } = req.body ?? {};
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';

    const authResult = await developerAuthService.authenticate(username, code, ip);
    if (!authResult.success) {
      const statusCode = authResult.rateLimited ? 429 : 401;
      res.status(statusCode).json({
        error: authResult.error,
        code: authResult.code,
      });
      return;
    }

    // Define cookie dedicado para sessão de desenvolvedor (completamente separado do cookie tenant)
    const isProduction = process.env.NODE_ENV === 'production';
    res.cookie(DCC_SESSION_COOKIE_NAME, authResult.sessionToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      maxAge: DCC_SESSION_TTL_MS,
      path: '/',
    });

    res.json({
      success: true,
      username: DEVELOPER_IDENTITY.username,
      token: authResult.sessionToken,
      csrfToken: authResult.csrfToken,
      expiresAt: authResult.expiresAt,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Erro interno ao autenticar desenvolvedor.', details: err.message });
  }
});

// POST /api/development-control/auth/logout
router.post('/auth/logout', (req: Request, res: Response) => {
  try {
    const token = getDccSessionTokenFromRequest(req);
    if (token) {
      developerAuthService.revokeSession(token);
    }

    const isProduction = process.env.NODE_ENV === 'production';
    res.clearCookie(DCC_SESSION_COOKIE_NAME, {
      path: '/',
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      maxAge: 0,
      expires: new Date(0),
    });

    res.json({ success: true, message: 'Sessão de desenvolvedor encerrada.' });
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao encerrar sessão de desenvolvedor.', details: err.message });
  }
});

// GET /api/development-control/auth/me
router.get('/auth/me', (req: Request, res: Response) => {
  try {
    const token = getDccSessionTokenFromRequest(req);
    if (!token) {
      res.json({ authenticated: false });
      return;
    }

    const session = developerAuthService.validateSession(token);
    if (!session) {
      res.json({ authenticated: false });
      return;
    }

    res.json({
      authenticated: true,
      username: session.username,
      expiresAt: session.expiresAt.toISOString(),
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao verificar sessão de desenvolvedor.', details: err.message });
  }
});

// ---------------------------------------------------------------------------
// Rotas de Dados do DCC (Protegidas exclusivamente por requireDeveloperAuth)
// ---------------------------------------------------------------------------

// GET /api/development-control/overview
router.get('/overview', requireDeveloperAuth, (_req: Request, res: Response) => {
  try {
    const overview = service.getOverview();
    res.json(overview);
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao gerar visão geral do desenvolvimento.', details: err.message });
  }
});

// GET /api/development-control/roadmap
router.get('/roadmap', requireDeveloperAuth, (_req: Request, res: Response) => {
  try {
    const phases = service.getPhases();
    res.json({ phases });
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao carregar roadmap.', details: err.message });
  }
});

// GET /api/development-control/checkpoints
router.get('/checkpoints', requireDeveloperAuth, (_req: Request, res: Response) => {
  try {
    const checkpoints = service.getCheckpoints();
    res.json({ checkpoints });
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao carregar histórico de checkpoints.', details: err.message });
  }
});

// GET /api/development-control/modules
router.get('/modules', requireDeveloperAuth, (_req: Request, res: Response) => {
  try {
    const modules = service.getModuleProgressList();
    res.json({ modules });
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao carregar progresso dos módulos.', details: err.message });
  }
});

// GET /api/development-control/health
router.get('/health', requireDeveloperAuth, (_req: Request, res: Response) => {
  try {
    const health = service.getHealth();
    res.json(health);
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao carregar visão de saúde do projeto.', details: err.message });
  }
});

export default router;
