import { beforeEach, expect, it, vi } from 'vitest';
import api from './api';
import { closeAccount, RESTAURANT_USER_ID } from './restauranteService';
vi.mock('./api', () => ({ default: { post: vi.fn() } }));
beforeEach(() => vi.resetAllMocks());
it('envía identificador, versión y usuario; devuelve detalle', async () => {
  api.post.mockResolvedValue({ data: { data: { accountId: 5, version: 6 } } });
  expect(await closeAccount(5, { expectedVersion: 5 })).toEqual({ accountId: 5, version: 6 });
  expect(api.post).toHaveBeenCalledWith('/restaurant-accounts/5/close', {
    expectedVersion: 5, userId: RESTAURANT_USER_ID,
  });
});
it('conserva código, estado y versiones del conflicto HTTP', async () => {
  api.post.mockRejectedValue({ response: { status: 409, data: { error: {
    message: 'Recargue', code: 'ACCOUNT_VERSION_CONFLICT', details: { currentVersion: 6 },
  } } } });
  await expect(closeAccount(5, { expectedVersion: 5 })).rejects.toMatchObject({
    message: 'Recargue', code: 'ACCOUNT_VERSION_CONFLICT', status: 409, details: { currentVersion: 6 },
  });
});
