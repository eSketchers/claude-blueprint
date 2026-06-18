import { jest } from '@jest/globals';

// Mock API service
export const mockApiService = {
  get: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
  delete: jest.fn(),
};

// Mock auth service
export const mockAuthService = {
  login: jest.fn(),
  logout: jest.fn(),
  getCurrentUser: jest.fn(),
  refreshToken: jest.fn(),
};

// Mock repository
export class MockRepository<T> {
  private data: T[] = [];

  find = jest.fn().mockResolvedValue(this.data);

  findOne = jest.fn().mockImplementation((query) => {
    return Promise.resolve(this.data[0] || null);
  });

  create = jest.fn().mockImplementation((dto) => dto);

  save = jest.fn().mockImplementation((entity) => {
    this.data.push(entity);
    return Promise.resolve(entity);
  });

  remove = jest.fn().mockImplementation((entity) => {
    const index = this.data.indexOf(entity);
    if (index > -1) {
      this.data.splice(index, 1);
    }
    return Promise.resolve(entity);
  });

  setData(data: T[]) {
    this.data = data;
  }
}

// Mock user factory
export const createMockUser = (overrides = {}) => ({
  id: '1',
  email: 'test@example.com',
  username: 'testuser',
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

// Mock JWT token
export const createMockToken = (userId = '1') => ({
  accessToken: `mock.jwt.token.${userId}`,
  refreshToken: `mock.refresh.token.${userId}`,
  expiresIn: 3600,
});

// Mock HTTP response
export const createMockResponse = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  res.end = jest.fn().mockReturnValue(res);
  return res;
};

// Mock HTTP request
export const createMockRequest = (overrides = {}) => ({
  body: {},
  params: {},
  query: {},
  headers: {},
  user: null,
  ...overrides,
});

// Reset all mocks helper
export const resetAllMocks = () => {
  mockApiService.get.mockReset();
  mockApiService.post.mockReset();
  mockApiService.put.mockReset();
  mockApiService.delete.mockReset();
  mockAuthService.login.mockReset();
  mockAuthService.logout.mockReset();
  mockAuthService.getCurrentUser.mockReset();
  mockAuthService.refreshToken.mockReset();
};
