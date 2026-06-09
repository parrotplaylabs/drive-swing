function patternToRegex(pattern) {
  const keys = [];
  const source = pattern
    .split('/')
    .map((segment) => {
      if (segment.startsWith(':')) {
        keys.push(segment.slice(1));
        return '([^/]+)';
      }
      return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('/');
  return { regex: new RegExp(`^${source}$`), keys };
}

export class Router {
  constructor() {
    this.routes = [];
  }

  get(path, ...handlers) {
    this.routes.push({ method: 'GET', path, handlers });
  }

  post(path, ...handlers) {
    this.routes.push({ method: 'POST', path, handlers });
  }

  match(method, pathname) {
    for (const route of this.routes) {
      if (route.method !== method) continue;
      const { regex, keys } = patternToRegex(route.path);
      const match = pathname.match(regex);
      if (!match) continue;
      const params = {};
      keys.forEach((key, i) => {
        params[key] = match[i + 1];
      });
      return { handlers: route.handlers, params };
    }
    return null;
  }

  async dispatch(req, res) {
    const found = this.match(req.method, req.pathname);
    if (!found) return false;
    req.params = found.params;
    for (const handler of found.handlers) {
      await handler(req, res);
      if (res.ended) break;
    }
    return true;
  }
}
