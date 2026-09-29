import type { JsonValue } from "./types.js";

export class HttpProviderError extends Error {
  public constructor(
    message: string,
    public readonly status: number | null,
    public readonly endpoint: string,
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = "HttpProviderError";
  }
}

export interface HttpJsonClientOptions {
  readonly fetchImpl?: typeof fetch;
  readonly timeoutMs?: number;
  readonly maxRetries?: number;
  readonly sleep?: (milliseconds: number) => Promise<void>;
}

export class HttpJsonClient {
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly sleep: (milliseconds: number) => Promise<void>;

  public constructor(options: HttpJsonClientOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.maxRetries = options.maxRetries ?? 2;
    this.sleep =
      options.sleep ??
      ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  }

  public get<T extends JsonValue>(
    url: string,
    headers?: Readonly<Record<string, string>>,
  ): Promise<T> {
    return this.request<T>(
      url,
      headers === undefined ? { method: "GET" } : { method: "GET", headers },
    );
  }

  public post<T extends JsonValue>(
    url: string,
    body: JsonValue,
    headers?: Readonly<Record<string, string>>,
  ): Promise<T> {
    return this.request<T>(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
  }

  private async request<T extends JsonValue>(url: string, init: RequestInit): Promise<T> {
    let attempt = 0;
    while (true) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const response = await this.fetchImpl(url, { ...init, signal: controller.signal });
        if (!response.ok) {
          const retryable =
            response.status === 408 || response.status === 429 || response.status >= 500;
          if (retryable && attempt < this.maxRetries) {
            attempt += 1;
            await this.sleep(100 * 2 ** (attempt - 1));
            continue;
          }
          throw new HttpProviderError(
            `provider returned HTTP ${response.status}`,
            response.status,
            url,
            retryable,
          );
        }
        let payload: unknown;
        try {
          payload = await response.json();
        } catch {
          throw new HttpProviderError(
            "provider returned malformed JSON",
            response.status,
            url,
            false,
          );
        }
        return payload as T;
      } catch (error) {
        if (error instanceof HttpProviderError) throw error;
        if (attempt < this.maxRetries) {
          attempt += 1;
          await this.sleep(100 * 2 ** (attempt - 1));
          continue;
        }
        const message = error instanceof Error ? error.message : "provider request failed";
        throw new HttpProviderError(message, null, url, true);
      } finally {
        clearTimeout(timeout);
      }
    }
  }
}
