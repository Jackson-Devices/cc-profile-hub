/**
 * HTTP request configuration for platform-agnostic requests.
 */
export interface HttpRequestConfig {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers?: Record<string, string>;
  timeout?: number;
  data?: unknown;
}

/**
 * HTTP response structure for platform-agnostic responses.
 */
export interface HttpResponse<T = unknown> {
  data: T;
  status: number;
  statusText: string;
  headers: Record<string, string>;
}

/**
 * HTTP error structure for platform-agnostic error handling.
 */
export interface HttpError extends Error {
  response?: {
    status: number;
    statusText: string;
    data?: unknown;
  };
  code?: string;
  isTimeout?: boolean;
  isNetworkError?: boolean;
}

/**
 * Platform-agnostic HTTP client interface.
 * Allows swapping between different HTTP implementations (axios, fetch, etc.)
 * for better testing and platform compatibility.
 */
export interface HttpClient {
  /**
   * Send a GET request.
   */
  get<T = unknown>(url: string, config?: HttpRequestConfig): Promise<HttpResponse<T>>;

  /**
   * Send a POST request.
   */
  post<T = unknown>(url: string, data?: unknown, config?: HttpRequestConfig): Promise<HttpResponse<T>>;

  /**
   * Send a PUT request.
   */
  put<T = unknown>(url: string, data?: unknown, config?: HttpRequestConfig): Promise<HttpResponse<T>>;

  /**
   * Send a DELETE request.
   */
  delete<T = unknown>(url: string, config?: HttpRequestConfig): Promise<HttpResponse<T>>;

  /**
   * Send a PATCH request.
   */
  patch<T = unknown>(url: string, data?: unknown, config?: HttpRequestConfig): Promise<HttpResponse<T>>;
}
