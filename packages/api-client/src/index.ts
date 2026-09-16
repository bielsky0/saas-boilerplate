/**
 * Typed HTTP client for the NestJS API (`apps/api`, REST `/v1/*`).
 *
 * One client, three runtimes:
 * - browser (Client Components, future React Native/Electron): cookies ride
 *   along via `credentials: "include"`, no `getCookie` needed;
 * - Next.js server (Server Components, route handlers, proxy): `fetch` from
 *   the server carries no cookies, so pass `getCookie` to forward the
 *   incoming request's `Cookie` header — that forward is what lets Nest
 *   resolve the Better Auth session. Without it every call is anonymous.
 *
 * The error envelope mirrors the validation layer (`{ error, issues? }`),
 * so API failures render through the same `FormState` shape as local ones.
 */

export interface ApiClientOptions {
  /** API origin, e.g. `http://localhost:3001`. Trailing slash is stripped. */
  baseUrl: string;
  /**
   * Server-side cookie forward (see above). Omit in the browser. May be async
   * so Next.js can `await cookies()` inside.
   */
  getCookie?: () => string | undefined | Promise<string | undefined>;
}

export interface ApiErrorBody {
  error: string;
  issues?: unknown;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly issues: unknown;

  constructor(status: number, body: ApiErrorBody) {
    super(body.error);
    this.name = "ApiError";
    this.status = status;
    this.code = body.error;
    this.issues = body.issues;
  }
}

export type HttpMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

export interface RequestOptions {
  query?: Record<string, string | number | boolean | undefined | null>;
  init?: Omit<RequestInit, "method" | "body" | "headers">;
}

async function parseError(res: Response): Promise<ApiErrorBody> {
  try {
    const body = (await res.json()) as Partial<ApiErrorBody>;
    if (typeof body.error === "string") return { error: body.error, issues: body.issues };
  } catch {
    // Non-JSON error page (proxy, gateway) — fall through to status text.
  }
  return { error: res.statusText || "REQUEST_FAILED" };
}

export interface ApiClient {
  request<T>(method: HttpMethod, path: string, body?: unknown, opts?: RequestOptions): Promise<T>;
  get<T>(path: string, opts?: RequestOptions): Promise<T>;
  post<T>(path: string, body?: unknown, opts?: RequestOptions): Promise<T>;
  patch<T>(path: string, body?: unknown, opts?: RequestOptions): Promise<T>;
  put<T>(path: string, body?: unknown, opts?: RequestOptions): Promise<T>;
  del<T>(path: string, opts?: RequestOptions): Promise<T>;
}

export function createApiClient(options: ApiClientOptions): ApiClient {
  const baseUrl = options.baseUrl.replace(/\/+$/, "");

  async function request<T>(
    method: HttpMethod,
    path: string,
    body?: unknown,
    opts?: RequestOptions,
  ): Promise<T> {
    if (!path.startsWith("/")) throw new Error(`API path must start with "/": ${path}`);
    const url = new URL(`${baseUrl}${path}`);
    if (opts?.query) {
      for (const [key, value] of Object.entries(opts.query)) {
        if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
      }
    }
    const headers = new Headers();
    headers.set("content-type", "application/json");
    const cookie = await options.getCookie?.();
    // The session-cookie forward: server-to-server fetch carries no cookies
    // unless the incoming `Cookie` header is copied explicitly.
    if (cookie) headers.set("cookie", cookie);
    const res = await fetch(url, {
      ...opts?.init,
      method,
      headers,
      credentials: "include",
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) throw new ApiError(res.status, await parseError(res));
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  return {
    request,
    get: <T>(path: string, opts?: RequestOptions) => request<T>("GET", path, undefined, opts),
    post: <T>(path: string, body?: unknown, opts?: RequestOptions) =>
      request<T>("POST", path, body, opts),
    patch: <T>(path: string, body?: unknown, opts?: RequestOptions) =>
      request<T>("PATCH", path, body, opts),
    put: <T>(path: string, body?: unknown, opts?: RequestOptions) =>
      request<T>("PUT", path, body, opts),
    del: <T>(path: string, opts?: RequestOptions) => request<T>("DELETE", path, undefined, opts),
  };
}
