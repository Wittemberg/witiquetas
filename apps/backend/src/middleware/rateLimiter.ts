import { Request, Response, NextFunction } from 'express';

interface RateLimitRecord {
  count: number;
  resetTime: number;
}

const ipAttempts: Map<string, RateLimitRecord> = new Map();

export function clearRateLimiterStore(): void {
  ipAttempts.clear();
}

export function createRateLimiter(options: {
  windowMs: number;
  max: number;
  message?: string;
}) {
  const { windowMs, max, message = 'Muitas requisições. Tente novamente mais tarde.' } = options;

  return (req: Request, res: Response, next: NextFunction): void => {
    // In Express with app.set('trust proxy', 1), req.ip is the verified client IP
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown-ip';
    const now = Date.now();

    const record = ipAttempts.get(clientIp);

    if (!record || now > record.resetTime) {
      ipAttempts.set(clientIp, {
        count: 1,
        resetTime: now + windowMs,
      });
      return next();
    }

    if (record.count >= max) {
      const retryAfterSeconds = Math.ceil((record.resetTime - now) / 1000);
      res.set('Retry-After', String(retryAfterSeconds));
      res.status(429).json({
        error: message,
        retryAfter: retryAfterSeconds,
      });
      return;
    }

    record.count += 1;
    return next();
  };
}

/**
 * Pre-configured rate limiter for login endpoint
 * 10 requests per 15 minutes window per IP
 */
export const loginRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Muitas tentativas de login. Tente novamente mais tarde.',
});
