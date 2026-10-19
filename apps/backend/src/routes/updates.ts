import { Router, Request, Response } from 'express';
import { requireAuthenticatedUser, requireCsrf } from '../middleware/authMiddleware.js';
import { UpdatesCenterService } from '../services/updatesCenterService.js';
import type { UpdateReleaseNoteDTO, ReleaseChannel } from '@witiquetas/contracts';

const router = Router();

// Todas as rotas da Central de Atualizações exigem autenticação prévia
router.use(requireAuthenticatedUser);

/**
 * Validador de autorização de leitura da Central de Atualizações.
 * Concede acesso a portadores de updates.view, wildcard '*', ADMIN, SUPERVISOR, DESIGNER ou PLATFORM_DEVELOPER.
 */
function checkCanView(req: Request): boolean {
  if (!req.principal) return false;
  if ((req as any).isPlatformDeveloper) return true;
  const { permissions, roles } = req.principal;
  if (permissions.includes('*') || permissions.includes('updates.view')) return true;
  if (roles && roles.some((r) => r.code === 'ADMIN' || r.code === 'SUPERVISOR' || r.code === 'DESIGNER')) {
    return true;
  }
  return false;
}

/**
 * Validador de autorização de gerenciamento / edição de notas da Central de Atualizações.
 * Concede acesso estrito a portadores de updates.manage, wildcard '*', ADMIN ou PLATFORM_DEVELOPER.
 */
function checkCanManage(req: Request): boolean {
  if (!req.principal) return false;
  if ((req as any).isPlatformDeveloper) return true;
  const { permissions, roles } = req.principal;
  if (permissions.includes('*') || permissions.includes('updates.manage')) return true;
  if (roles && roles.some((r) => r.code === 'ADMIN')) {
    return true;
  }
  return false;
}

// 1. Visão Geral da Central de Atualizações
router.get('/overview', (req: Request, res: Response) => {
  if (!checkCanView(req)) {
    return res.status(403).json({
      error: 'Permissão insuficiente para visualizar a Central de Atualizações.',
      code: 'FORBIDDEN',
      requiredPermission: 'updates.view',
    });
  }

  const canManage = checkCanManage(req);
  const overview = UpdatesCenterService.getOverview(canManage);
  return res.json(overview);
});

// 2. Histórico de Versões e Releases
router.get('/history', (req: Request, res: Response) => {
  if (!checkCanView(req)) {
    return res.status(403).json({
      error: 'Permissão insuficiente para visualizar o histórico de atualizações.',
      code: 'FORBIDDEN',
      requiredPermission: 'updates.view',
    });
  }

  const history = UpdatesCenterService.getHistory();
  return res.json({
    total: history.length,
    releases: history,
  });
});

// 3. Detalhes de uma Release Específica
router.get('/releases/:version', (req: Request, res: Response) => {
  if (!checkCanView(req)) {
    return res.status(403).json({
      error: 'Permissão insuficiente para visualizar notas de versão.',
      code: 'FORBIDDEN',
      requiredPermission: 'updates.view',
    });
  }

  const { version } = req.params;
  const release = UpdatesCenterService.getReleaseByVersion(version);
  if (!release) {
    return res.status(404).json({
      error: `Release versão '${version}' não encontrada.`,
      code: 'RELEASE_NOT_FOUND',
    });
  }

  return res.json(release);
});

// 4. Checagem Simulada de Atualizações (Sprint 1: Zero deploy ativo)
router.post('/check', (req: Request, res: Response) => {
  if (!checkCanView(req)) {
    return res.status(403).json({
      error: 'Permissão insuficiente para verificar atualizações.',
      code: 'FORBIDDEN',
      requiredPermission: 'updates.view',
    });
  }

  const channel = req.body?.channel as ReleaseChannel | undefined;
  const checkResult = UpdatesCenterService.checkForUpdates(channel);
  return res.json(checkResult);
});

// 5. Cadastrar ou Atualizar Notas de Versão
router.put('/releases/:version', requireCsrf, (req: Request, res: Response) => {
  if (!checkCanManage(req)) {
    return res.status(403).json({
      error: 'Permissão insuficiente para gerenciar notas de versão.',
      code: 'FORBIDDEN',
      requiredPermission: 'updates.manage',
    });
  }

  const { version } = req.params;
  const body = req.body as UpdateReleaseNoteDTO;

  if (!body || typeof body !== 'object') {
    return res.status(400).json({
      error: 'Corpo da requisição inválido para atualização de notas.',
      code: 'INVALID_PAYLOAD',
    });
  }

  if (body.title !== undefined && (!body.title || !body.title.trim())) {
    return res.status(400).json({
      error: 'O título da release não pode ser vazio.',
      code: 'INVALID_TITLE',
    });
  }

  try {
    const authorName = req.principal?.user?.name || 'Administrador';
    const updated = UpdatesCenterService.updateReleaseNote(version, body, authorName);
    return res.json(updated);
  } catch (err: any) {
    return res.status(err.statusCode || 500).json({
      error: err.message || 'Erro ao atualizar notas de versão.',
      code: 'UPDATE_FAILED',
    });
  }
});

export default router;
