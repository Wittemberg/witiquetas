export function Router() {
  const routes = [];
  const middlewares = [];

  function matchPath(routePath, reqPath) {
    if (routePath === reqPath) return { match: true, params: {} };
    const routeParts = routePath.split('/').filter(Boolean);
    const reqParts = reqPath.split('?')[0].split('/').filter(Boolean);
    if (routeParts.length !== reqParts.length) return { match: false, params: {} };
    const params = {};
    for (let i = 0; i < routeParts.length; i++) {
      if (routeParts[i].startsWith(':')) {
        params[routeParts[i].slice(1)] = reqParts[i];
      } else if (routeParts[i] !== reqParts[i]) {
        return { match: false, params: {} };
      }
    }
    return { match: true, params };
  }

  const router = async function (req, res, done) {
    const method = (req.method || 'GET').toUpperCase();
    const url = req.url || '/';

    const matchingRoute = routes.find((r) => r.method === method && matchPath(r.path, url).match);
    if (matchingRoute) {
      const { params } = matchPath(matchingRoute.path, url);
      req.params = { ...(req.params || {}), ...params };
    }

    const allHandlers = [...middlewares, ...(matchingRoute ? matchingRoute.handlers : [])];
    let idx = 0;

    async function nextHandler(err) {
      if (err) {
        if (done) done(err);
        return;
      }
      if (idx < allHandlers.length) {
        const h = allHandlers[idx++];
        try {
          await h(req, res, nextHandler);
        } catch (e) {
          if (done) done(e);
        }
      } else if (done) {
        done();
      }
    }

    await nextHandler();
  };

  router.get = function (path, ...handlers) {
    routes.push({ method: 'GET', path, handlers: handlers.flat() });
    return router;
  };
  router.post = function (path, ...handlers) {
    routes.push({ method: 'POST', path, handlers: handlers.flat() });
    return router;
  };
  router.put = function (path, ...handlers) {
    routes.push({ method: 'PUT', path, handlers: handlers.flat() });
    return router;
  };
  router.patch = function (path, ...handlers) {
    routes.push({ method: 'PATCH', path, handlers: handlers.flat() });
    return router;
  };
  router.delete = function (path, ...handlers) {
    routes.push({ method: 'DELETE', path, handlers: handlers.flat() });
    return router;
  };
  router.use = function (...handlers) {
    middlewares.push(...handlers.flat());
    return router;
  };
  router.routes = routes;
  return router;
}

export class Request {}
export class Response {}
export class NextFunction {}

export default {
  Router,
  Request,
  Response,
  NextFunction,
  json: () => (req, res, next) => next && next(),
};
