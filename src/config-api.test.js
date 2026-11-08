import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/auth.js', () => ({ authenticate: vi.fn(), loginWithGoogle: vi.fn() }));
vi.mock('../lib/redis.js', () => ({ getRedis: vi.fn() }));

import { authenticate } from '../lib/auth.js';
import { getRedis } from '../lib/redis.js';
import handler from '../api/config.js';

const storage = new Map();
const redis = { get: vi.fn(), set: vi.fn() };
const storageKey = 'household:config-test:hash:config';

async function request(method, config) {
  const res = {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  await handler({ method, body: config === undefined ? undefined : { config } }, res);
  return res;
}

beforeEach(() => {
  vi.resetAllMocks();
  storage.clear();
  authenticate.mockResolvedValue({ ok: true, storageKey: 'portfolio:config-test:hash:holdings' });
  getRedis.mockReturnValue(redis);
  redis.get.mockImplementation(async (key) => storage.get(key) ?? null);
  redis.set.mockImplementation(async (key, value) => { storage.set(key, value); return 'OK'; });
});

describe('config merchant grouping overrides', () => {
  it('persists exact description overrides and returns them after a fresh GET', async () => {
    const config = {
      accounts: ['Checking'],
      expenseCategories: ['Mortgage', 'Groceries'],
      incomeCategories: ['Salary'],
      accountTypeOverrides: { 'urn:bank:checking': 'checking' },
      merchantOverrides: {
        '  LOANDEPOT WEB PMT #123  ': ' LoanDepot ',
        'SAFEWAY STORE #456': 'Safeway',
      },
    };
    const put = await request('PUT', config);
    expect(put.statusCode).toBe(200);
    expect(put.body.config.merchantOverrides).toEqual({
      '  LOANDEPOT WEB PMT #123  ': 'LOANDEPOT',
      'SAFEWAY STORE #456': 'SAFEWAY',
    });
    expect(redis.set).toHaveBeenCalledWith(storageKey, expect.any(String));

    const get = await request('GET');
    expect(get.statusCode).toBe(200);
    expect(get.body.config).toEqual({ ...config, merchantOverrides: put.body.config.merchantOverrides });
    expect(get.body.savedAt).toBe(put.body.savedAt);
    expect(JSON.parse(storage.get(storageKey)).config).toEqual(get.body.config);
  });

  it('clears saved overrides with an empty object while retaining the other submitted settings', async () => {
    const config = { accounts: ['Checking'], merchantOverrides: { 'STORE #123': 'STORE' } };
    await request('PUT', config);
    await request('PUT', { ...config, merchantOverrides: {} });

    const get = await request('GET');
    expect(get.body.config).toEqual({ accounts: ['Checking'], merchantOverrides: {} });
  });

  it('drops malformed, prototype and oversized entries on both writes and legacy reads', async () => {
    const overrides = Object.fromEntries([
      ['SAFEWAY #1', ' Safeway '],
      ['STORE #2', ''],
      ['STORE #3', '   '],
      ['STORE #4', 123],
      ['STORE #5', { merchant: 'STORE' }],
      ['STORE #6', null],
      ['STORE #7', 'X'.repeat(101)],
      ['X'.repeat(2001), 'STORE'],
      ['__proto__', 'UNSAFE'],
      ['constructor', 'UNSAFE'],
      ['prototype', 'UNSAFE'],
    ]);
    const expected = { 'SAFEWAY #1': 'SAFEWAY' };
    const put = await request('PUT', { accounts: ['Checking'], merchantOverrides: overrides });
    expect(put.statusCode).toBe(200);
    expect(put.body.config.merchantOverrides).toEqual(expected);

    storage.set(storageKey, JSON.stringify({ config: { merchantOverrides: overrides }, savedAt: 'legacy' }));
    const get = await request('GET');
    expect(get.body.config.merchantOverrides).toEqual(expected);
    expect(get.body.savedAt).toBe('legacy');
    expect(Object.hasOwn(get.body.config.merchantOverrides, '__proto__')).toBe(false);
  });

  it('does not read or write household settings without authentication', async () => {
    authenticate.mockResolvedValue({ ok: false, status: 401, error: 'Authentication required' });
    const response = await request('PUT', { merchantOverrides: { 'STORE #1': 'STORE' } });
    expect(response.statusCode).toBe(401);
    expect(getRedis).not.toHaveBeenCalled();
    expect(redis.set).not.toHaveBeenCalled();
  });
});
