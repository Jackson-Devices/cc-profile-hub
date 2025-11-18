import axios, { AxiosInstance, AxiosError, AxiosResponse } from 'axios';
import { HttpClient, HttpRequestConfig, HttpResponse, HttpError } from './HttpClient';

/**
 * Axios-based HTTP client adapter.
 * Wraps axios to conform to the platform-agnostic HttpClient interface.
 */
export class AxiosHttpClient implements HttpClient {
  constructor(private axiosInstance: AxiosInstance = axios.create()) {}

  /**
   * Convert axios-specific config to our generic config format.
   */
  private convertConfig(config?: HttpRequestConfig) {
    if (!config) return undefined;

    return {
      headers: config.headers,
      timeout: config.timeout,
    };
  }

  /**
   * Convert axios response to our generic response format.
   */
  private convertResponse<T>(axiosResponse: AxiosResponse<T>): HttpResponse<T> {
    return {
      data: axiosResponse.data,
      status: axiosResponse.status,
      statusText: axiosResponse.statusText,
      headers: axiosResponse.headers as Record<string, string>,
    };
  }

  /**
   * Convert axios error to our generic error format.
   */
  private convertError(error: unknown): HttpError {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;
      const httpError = new Error(axiosError.message) as HttpError;
      httpError.name = 'HttpError';

      if (axiosError.response) {
        httpError.response = {
          status: axiosError.response.status,
          statusText: axiosError.response.statusText,
          data: axiosError.response.data,
        };
      }

      httpError.code = axiosError.code;
      httpError.isTimeout = axiosError.code === 'ECONNABORTED';
      httpError.isNetworkError = !axiosError.response && !!axiosError.request;

      return httpError;
    }

    // Non-axios error
    const httpError = new Error(error instanceof Error ? error.message : 'Unknown error') as HttpError;
    httpError.name = 'HttpError';
    return httpError;
  }

  async get<T = unknown>(url: string, config?: HttpRequestConfig): Promise<HttpResponse<T>> {
    try {
      const response = await this.axiosInstance.get<T>(url, this.convertConfig(config));
      return this.convertResponse(response);
    } catch (error) {
      throw this.convertError(error);
    }
  }

  async post<T = unknown>(url: string, data?: unknown, config?: HttpRequestConfig): Promise<HttpResponse<T>> {
    try {
      const response = await this.axiosInstance.post<T>(url, data, this.convertConfig(config));
      return this.convertResponse(response);
    } catch (error) {
      throw this.convertError(error);
    }
  }

  async put<T = unknown>(url: string, data?: unknown, config?: HttpRequestConfig): Promise<HttpResponse<T>> {
    try {
      const response = await this.axiosInstance.put<T>(url, data, this.convertConfig(config));
      return this.convertResponse(response);
    } catch (error) {
      throw this.convertError(error);
    }
  }

  async delete<T = unknown>(url: string, config?: HttpRequestConfig): Promise<HttpResponse<T>> {
    try {
      const response = await this.axiosInstance.delete<T>(url, this.convertConfig(config));
      return this.convertResponse(response);
    } catch (error) {
      throw this.convertError(error);
    }
  }

  async patch<T = unknown>(url: string, data?: unknown, config?: HttpRequestConfig): Promise<HttpResponse<T>> {
    try {
      const response = await this.axiosInstance.patch<T>(url, data, this.convertConfig(config));
      return this.convertResponse(response);
    } catch (error) {
      throw this.convertError(error);
    }
  }

  /**
   * Get the underlying axios instance for advanced use cases.
   * Use sparingly - prefer using the HttpClient interface.
   */
  getAxiosInstance(): AxiosInstance {
    return this.axiosInstance;
  }
}
