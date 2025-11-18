import { HttpClient, HttpRequestConfig, HttpResponse, HttpError } from './HttpClient';

/**
 * Fetch-based HTTP client adapter.
 * Uses native fetch API for platform independence (works in Node.js 18+ and browsers).
 */
export class FetchHttpClient implements HttpClient {
  constructor(private baseUrl?: string) {}

  /**
   * Build full URL from base URL and path.
   */
  private buildUrl(url: string): string {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }
    if (this.baseUrl) {
      return `${this.baseUrl}${url}`;
    }
    return url;
  }

  /**
   * Convert fetch response to our generic response format.
   */
  private async convertResponse<T>(response: Response): Promise<HttpResponse<T>> {
    // Parse response body based on content type
    const contentType = response.headers.get('content-type') || '';
    let data: T;

    if (contentType.includes('application/json')) {
      data = await response.json();
    } else if (contentType.includes('text/')) {
      data = (await response.text()) as unknown as T;
    } else {
      data = (await response.blob()) as unknown as T;
    }

    // Convert Headers to plain object
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key] = value;
    });

    return {
      data,
      status: response.status,
      statusText: response.statusText,
      headers,
    };
  }

  /**
   * Create an HTTP error from a fetch response.
   */
  private async createError(response: Response, message?: string): Promise<HttpError> {
    const error = new Error(message || `HTTP ${response.status}: ${response.statusText}`) as HttpError;
    error.name = 'HttpError';

    try {
      const contentType = response.headers.get('content-type') || '';
      let errorData: unknown;

      if (contentType.includes('application/json')) {
        errorData = await response.json();
      } else if (contentType.includes('text/')) {
        errorData = await response.text();
      }

      error.response = {
        status: response.status,
        statusText: response.statusText,
        data: errorData,
      };
    } catch {
      // Ignore error parsing errors
      error.response = {
        status: response.status,
        statusText: response.statusText,
      };
    }

    return error;
  }

  /**
   * Execute a fetch request with error handling.
   */
  private async request<T>(
    url: string,
    method: string,
    data?: unknown,
    config?: HttpRequestConfig
  ): Promise<HttpResponse<T>> {
    const fullUrl = this.buildUrl(url);
    const controller = new AbortController();
    const timeout = config?.timeout;

    // Set up timeout if specified
    let timeoutId: NodeJS.Timeout | undefined;
    if (timeout) {
      timeoutId = setTimeout(() => controller.abort(), timeout);
    }

    try {
      const headers: Record<string, string> = {
        ...config?.headers,
      };

      // Add Content-Type header for POST/PUT/PATCH with JSON data
      if (data && !headers['Content-Type'] && !headers['content-type']) {
        headers['Content-Type'] = 'application/json';
      }

      const response = await fetch(fullUrl, {
        method,
        headers,
        body: data ? JSON.stringify(data) : undefined,
        signal: controller.signal,
      });

      // Clear timeout
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      // Check for HTTP errors
      if (!response.ok) {
        throw await this.createError(response);
      }

      return await this.convertResponse<T>(response);
    } catch (error) {
      // Clear timeout
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      // Handle abort/timeout errors
      if (error instanceof Error && error.name === 'AbortError') {
        const httpError = new Error('Request timeout') as HttpError;
        httpError.name = 'HttpError';
        httpError.isTimeout = true;
        httpError.code = 'ECONNABORTED';
        throw httpError;
      }

      // Handle network errors
      if (error instanceof TypeError) {
        const httpError = new Error(`Network error: ${error.message}`) as HttpError;
        httpError.name = 'HttpError';
        httpError.isNetworkError = true;
        throw httpError;
      }

      // Re-throw our HTTP errors
      if (error instanceof Error && error.name === 'HttpError') {
        throw error;
      }

      // Wrap unknown errors
      const httpError = new Error(error instanceof Error ? error.message : 'Unknown error') as HttpError;
      httpError.name = 'HttpError';
      throw httpError;
    }
  }

  async get<T = unknown>(url: string, config?: HttpRequestConfig): Promise<HttpResponse<T>> {
    return this.request<T>(url, 'GET', undefined, config);
  }

  async post<T = unknown>(url: string, data?: unknown, config?: HttpRequestConfig): Promise<HttpResponse<T>> {
    return this.request<T>(url, 'POST', data, config);
  }

  async put<T = unknown>(url: string, data?: unknown, config?: HttpRequestConfig): Promise<HttpResponse<T>> {
    return this.request<T>(url, 'PUT', data, config);
  }

  async delete<T = unknown>(url: string, config?: HttpRequestConfig): Promise<HttpResponse<T>> {
    return this.request<T>(url, 'DELETE', undefined, config);
  }

  async patch<T = unknown>(url: string, data?: unknown, config?: HttpRequestConfig): Promise<HttpResponse<T>> {
    return this.request<T>(url, 'PATCH', data, config);
  }
}
