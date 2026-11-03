// Just enough of Express for the browser-only demo to run the real route files (server/routes/*.ts)
// in the page: Router with get/post/put/patch/delete/use, path params, middleware with next(),
// and a response that resolves when a handler answers. Aliased as 'express' in vite.demo.config.ts.

type Next = (err?: unknown) => void;
export type Handler = (req: DemoRequest, res: DemoResponse, next: Next) => unknown;

export interface DemoRequest {
  method: string;
  path: string;
  params: Record<string, string>;
  query: Record<string, string>;
  body: unknown;
  headers: Record<string, string>;
  get: (name: string) => string | undefined;
  [extra: string]: unknown;
}

export interface DemoResult {
  status: number;
  headers: Record<string, string>;
  body: unknown;
  /** True when the body is JSON; otherwise it is a file (string or bytes). */
  json: boolean;
}

export class DemoResponse {
  statusCode = 200;
  headers: Record<string, string> = {};
  private done!: (r: DemoResult) => void;
  readonly finished: Promise<DemoResult>;
  sent = false;

  constructor() {
    this.finished = new Promise((resolve) => (this.done = resolve));
  }

  status(code: number) {
    this.statusCode = code;
    return this;
  }

  setHeader(name: string, value: string) {
    this.headers[name.toLowerCase()] = value;
    return this;
  }

  json(body: unknown) {
    if (this.sent) return this;
    this.sent = true;
    // Copy, as a network hop would: the page must never hold references into the data store.
    this.done({ status: this.statusCode, headers: { 'content-type': 'application/json', ...this.headers }, body: JSON.parse(JSON.stringify(body ?? null)), json: true });
    return this;
  }

  send(body: unknown) {
    if (this.sent) return this;
    this.sent = true;
    this.done({ status: this.statusCode, headers: this.headers, body, json: false });
    return this;
  }
}

interface Layer {
  method: string | null;
  paths: string[];
  handlers: Handler[];
}

function match(pattern: string, path: string, prefix: boolean): Record<string, string> | null {
  const p = pattern.split('/').filter(Boolean);
  const s = path.split('/').filter(Boolean);
  if (prefix ? s.length < p.length : s.length !== p.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(':')) params[p[i].slice(1)] = decodeURIComponent(s[i]);
    else if (p[i] !== s[i]) return null;
  }
  return params;
}

export class DemoRouter {
  layers: Layer[] = [];

  private add(method: string | null, path: string | string[], handlers: Handler[]) {
    this.layers.push({ method, paths: Array.isArray(path) ? path : [path], handlers });
    return this;
  }

  get = (path: string, ...h: Handler[]) => this.add('GET', path, h);
  post = (path: string, ...h: Handler[]) => this.add('POST', path, h);
  put = (path: string, ...h: Handler[]) => this.add('PUT', path, h);
  patch = (path: string, ...h: Handler[]) => this.add('PATCH', path, h);
  delete = (path: string, ...h: Handler[]) => this.add('DELETE', path, h);

  use(pathOrHandler: string | string[] | Handler, ...h: Handler[]) {
    if (typeof pathOrHandler === 'function') return this.add(null, '/', [pathOrHandler, ...h]);
    return this.add(null, pathOrHandler, h);
  }
}

export function Router(): DemoRouter {
  return new DemoRouter();
}

/** Run a request through routers in order, like app.use('/api', ...routers). */
export async function dispatch(routers: DemoRouter[], req: DemoRequest): Promise<DemoResult> {
  const res = new DemoResponse();
  const layers = routers.flatMap((r) => r.layers);
  let i = 0;

  const runLayer = (): void => {
    while (i < layers.length) {
      const layer = layers[i++];
      if (layer.method && layer.method !== req.method) continue;
      const params = layer.paths.map((p) => match(p, req.path, layer.method === null)).find((x) => x !== null);
      if (!params) continue;
      req.params = { ...params };
      let h = 0;
      const next: Next = () => {
        if (h < layer.handlers.length) {
          const handler = layer.handlers[h++];
          Promise.resolve()
            .then(() => handler(req, res, next))
            .catch(() => res.status(500).json({ error: 'Something went wrong' }));
        } else runLayer();
      };
      next();
      return;
    }
    res.status(404).json({ error: 'Not found' });
  };

  runLayer();
  return res.finished;
}

export default Router;
