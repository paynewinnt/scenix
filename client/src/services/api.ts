import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 30_000,
});

// ---- Test Cases ----

export interface TestCase {
  id: string;
  name: string;
  platform: 'web' | 'android' | 'ios';
  steps: string;
  createdAt: string;
  updatedAt: string;
}

export const testCaseApi = {
  list: () => api.get<TestCase[]>('/test-cases').then((r) => r.data),
  get: (id: string) => api.get<TestCase>(`/test-cases/${id}`).then((r) => r.data),
  create: (data: Omit<TestCase, 'id' | 'createdAt' | 'updatedAt'>) =>
    api.post<TestCase>('/test-cases', data).then((r) => r.data),
  update: (id: string, data: Partial<TestCase>) =>
    api.put<TestCase>(`/test-cases/${id}`, data).then((r) => r.data),
  delete: (id: string) => api.delete(`/test-cases/${id}`),
};

// ---- Test Suites ----

export interface TestSuite {
  id: string;
  name: string;
  platform: 'web' | 'android' | 'ios';
  testCaseIds: string[];
  testCases: TestCase[];
  createdAt: string;
  updatedAt: string;
}

export const testSuiteApi = {
  list: () => api.get<TestSuite[]>('/test-suites').then((r) => r.data),
  get: (id: string) => api.get<TestSuite>(`/test-suites/${id}`).then((r) => r.data),
  create: (data: { name: string; testCaseIds: string[] }) =>
    api.post<TestSuite>('/test-suites', data).then((r) => r.data),
  update: (id: string, data: Partial<{ name: string; testCaseIds: string[] }>) =>
    api.put<TestSuite>(`/test-suites/${id}`, data).then((r) => r.data),
  delete: (id: string) => api.delete(`/test-suites/${id}`),
};

// ---- Test Runs ----

export interface TestRunItem {
  id: string;
  testRunId: string;
  testCaseId: string;
  testCaseName: string;
  platform: string;
  status: 'pending' | 'running' | 'passed' | 'failed' | 'error';
  startedAt: string;
  finishedAt?: string;
  reportPath?: string;
  errorMessage?: string;
  sortOrder: number;
}

export interface TestRun {
  id: string;
  suiteId?: string;
  suiteName: string;
  testCaseId?: string;
  testCaseName?: string;
  platform: string;
  deviceId?: string;
  deviceConfig?: {
    udid?: string;
    wdaHost?: string;
    wdaPort?: number;
  };
  status: 'pending' | 'running' | 'passed' | 'failed' | 'error';
  startedAt: string;
  finishedAt?: string;
  reportPath?: string;
  errorMessage?: string;
  items: TestRunItem[];
}

export const testRunApi = {
  list: () => api.get<TestRun[]>('/test-runs').then((r) => r.data),
  start: (suiteId: string, deviceId?: string) =>
    api.post<TestRun>('/test-runs', { suiteId, deviceId }).then((r) => r.data),
  get: (id: string) => api.get<TestRun>(`/test-runs/${id}`).then((r) => r.data),
  delete: (id: string) => api.delete(`/test-runs/${id}`),
};

// ---- Devices ----

export interface Device {
  id: string;
  name: string;
  platform: 'android' | 'ios';
  udid: string;
  status: 'connected' | 'disconnected' | 'busy';
  wdaHost?: string;
  wdaPort?: number;
}

export const deviceApi = {
  list: () => api.get<Device[]>('/devices').then((r) => r.data),
  refresh: () => api.post<Device[]>('/devices/refresh').then((r) => r.data),
};
