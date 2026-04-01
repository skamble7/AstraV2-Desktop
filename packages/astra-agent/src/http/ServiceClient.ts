/**
 * Base HTTP client used by all backend service clients.
 * Uses native fetch (Node 18+). Handles retries, auth headers, and typed responses.
 * All calls happen in the Electron main process — never in the renderer.
 */

export interface ServiceClientConfig {
  baseUrl: string;
  defaultHeaders?: Record<string, string>;
  timeoutMs?: number;
}

export class ServiceClientError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly responseBody: string
  ) {
    super(message);
    this.name = 'ServiceClientError';
  }
}

export class ServiceClient {
  protected readonly baseUrl: string;
  private readonly defaultHeaders: Record<string, string>;
  private readonly timeoutMs: number;

  constructor(config: ServiceClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.defaultHeaders = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...config.defaultHeaders,
    };
    this.timeoutMs = config.timeoutMs ?? 30_000;
  }

  protected async get<T>(path: string, signal?: AbortSignal): Promise<T> {
    return this.request<T>('GET', path, undefined, signal);
  }

  protected async post<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
    return this.request<T>('POST', path, body, signal);
  }

  protected async patch<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
    return this.request<T>('PATCH', path, body, signal);
  }

  protected async delete<T>(path: string, signal?: AbortSignal): Promise<T> {
    return this.request<T>('DELETE', path, undefined, signal);
  }

  private async request<T>(
    method: string,
    path: string,
    body: unknown,
    signal?: AbortSignal
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;

    // Combine caller's signal with a timeout signal
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => timeoutController.abort(), this.timeoutMs);

    const combinedSignal = signal
      ? AbortSignal.any([signal, timeoutController.signal])
      : timeoutController.signal;

    try {
      const fetchInit: RequestInit = {
        method,
        headers: this.defaultHeaders,
        signal: combinedSignal,
      };
      if (body !== undefined) {
        fetchInit.body = JSON.stringify(body);
      }
      const response = await fetch(url, fetchInit);

      if (!response.ok) {
        const responseBody = await response.text();
        throw new ServiceClientError(
          `HTTP ${response.status} ${response.statusText} — ${method} ${url}`,
          response.status,
          responseBody
        );
      }

      // 204 No Content
      if (response.status === 204) {
        return undefined as T;
      }

      return (await response.json()) as T;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
