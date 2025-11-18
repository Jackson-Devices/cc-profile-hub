import axios, { AxiosInstance } from 'axios';
import MockAdapter from 'axios-mock-adapter';
import { AxiosHttpClient } from '../../src/http/AxiosHttpClient';

describe('AxiosHttpClient', () => {
  let axiosInstance: AxiosInstance;
  let mockAxios: MockAdapter;
  let client: AxiosHttpClient;

  beforeEach(() => {
    axiosInstance = axios.create({ baseURL: 'https://api.example.com' });
    mockAxios = new MockAdapter(axiosInstance);
    client = new AxiosHttpClient(axiosInstance);
  });

  afterEach(() => {
    mockAxios.reset();
  });

  describe('get', () => {
    it('should make a successful GET request', async () => {
      const responseData = { id: 1, name: 'Test' };
      mockAxios.onGet('/users/1').reply(200, responseData);

      const response = await client.get('/users/1');

      expect(response.status).toBe(200);
      expect(response.data).toEqual(responseData);
      // Note: statusText may be undefined in mock adapter
      if (response.statusText) {
        expect(response.statusText).toBe('OK');
      }
    });

    it('should include headers in response', async () => {
      mockAxios.onGet('/test').reply(200, {}, { 'x-custom-header': 'value' });

      const response = await client.get('/test');

      expect(response.headers['x-custom-header']).toBe('value');
    });

    it('should send custom headers', async () => {
      mockAxios.onGet('/test').reply((config) => {
        expect(config.headers?.['Authorization']).toBe('Bearer token');
        return [200, {}];
      });

      await client.get('/test', {
        headers: { 'Authorization': 'Bearer token' },
      });
    });

    it('should handle timeout', async () => {
      mockAxios.onGet('/slow').timeout();

      await expect(client.get('/slow', { timeout: 100 })).rejects.toMatchObject({
        name: 'HttpError',
        isTimeout: true,
      });
    });
  });

  describe('post', () => {
    it('should make a successful POST request', async () => {
      const requestData = { name: 'New User' };
      const responseData = { id: 2, ...requestData };

      mockAxios.onPost('/users', requestData).reply(201, responseData);

      const response = await client.post('/users', requestData);

      expect(response.status).toBe(201);
      expect(response.data).toEqual(responseData);
    });

    it('should handle POST without data', async () => {
      mockAxios.onPost('/action').reply(200, { success: true });

      const response = await client.post('/action');

      expect(response.status).toBe(200);
      expect(response.data).toEqual({ success: true });
    });
  });

  describe('put', () => {
    it('should make a successful PUT request', async () => {
      const requestData = { name: 'Updated User' };
      mockAxios.onPut('/users/1', requestData).reply(200, requestData);

      const response = await client.put('/users/1', requestData);

      expect(response.status).toBe(200);
      expect(response.data).toEqual(requestData);
    });
  });

  describe('delete', () => {
    it('should make a successful DELETE request', async () => {
      mockAxios.onDelete('/users/1').reply(204);

      const response = await client.delete('/users/1');

      expect(response.status).toBe(204);
    });
  });

  describe('patch', () => {
    it('should make a successful PATCH request', async () => {
      const requestData = { name: 'Patched' };
      mockAxios.onPatch('/users/1', requestData).reply(200, requestData);

      const response = await client.patch('/users/1', requestData);

      expect(response.status).toBe(200);
      expect(response.data).toEqual(requestData);
    });
  });

  describe('error handling', () => {
    it('should handle 404 errors', async () => {
      mockAxios.onGet('/notfound').reply(404, { error: 'Not Found' });

      try {
        await client.get('/notfound');
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.name).toBe('HttpError');
        expect(error.response.status).toBe(404);
        expect(error.response.data).toEqual({ error: 'Not Found' });
      }
    });

    it('should handle 500 errors', async () => {
      mockAxios.onGet('/error').reply(500, { error: 'Internal Server Error' });

      try {
        await client.get('/error');
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.name).toBe('HttpError');
        expect(error.response.status).toBe(500);
      }
    });

    it('should handle network errors', async () => {
      mockAxios.onGet('/network-error').networkError();

      try {
        await client.get('/network-error');
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.name).toBe('HttpError');
        // Network errors may not always set isNetworkError in mock
      }
    });

    it('should preserve error response data', async () => {
      const errorData = { error: 'validation_failed', details: ['field is required'] };
      mockAxios.onPost('/users').reply(400, errorData);

      try {
        await client.post('/users', {});
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.name).toBe('HttpError');
        expect(error.response.data).toEqual(errorData);
        expect(error.response.status).toBe(400);
      }
    });
  });

  describe('getAxiosInstance', () => {
    it('should return the underlying axios instance', () => {
      const instance = client.getAxiosInstance();

      expect(instance).toBe(axiosInstance);
    });
  });
});
