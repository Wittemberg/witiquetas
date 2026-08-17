export function Router() {
  const routes = [];
  const router = function (req, res, next) {
    if (next) next();
  };
  router.get = function (path, ...handlers) {
    routes.push({ method: 'GET', path, handlers });
    return router;
  };
  router.post = function (path, ...handlers) {
    routes.push({ method: 'POST', path, handlers });
    return router;
  };
  router.put = function (path, ...handlers) {
    routes.push({ method: 'PUT', path, handlers });
    return router;
  };
  router.patch = function (path, ...handlers) {
    routes.push({ method: 'PATCH', path, handlers });
    return router;
  };
  router.delete = function (path, ...handlers) {
    routes.push({ method: 'DELETE', path, handlers });
    return router;
  };
  router.use = function (...handlers) {
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
