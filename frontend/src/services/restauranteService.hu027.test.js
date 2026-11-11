import { beforeEach, expect, it, vi } from 'vitest';
import api from './api';
import { removeAccountItem, RESTAURANT_USER_ID } from './restauranteService';
vi.mock('./api', () => ({ default: { post: vi.fn() } }));
beforeEach(() => vi.resetAllMocks());
it('envía identificadores, versión, motivo y usuario; devuelve detalle', async () => {
  api.post.mockResolvedValue({ data: { data: { accountId: 5, version: 6 } } });
  expect(await removeAccountItem(5, 11, { expectedVersion: 5, removedReason: 'Desiste' })).toEqual({ accountId: 5, version: 6 });
  expect(api.post).toHaveBeenCalledWith('/restaurant-accounts/5/items/11/remove', {
    expectedVersion: 5, removedReason: 'Desiste', userId: RESTAURANT_USER_ID,
  });
});
it('conserva código, estado y versiones del conflicto HTTP', async () => {
  api.post.mockRejectedValue({ response: { status: 409, data: { error: {
    message: 'Recargue', code: 'ACCOUNT_VERSION_CONFLICT', details: { currentVersion: 6 },
  } } } });
  await expect(removeAccountItem(5, 11, { expectedVersion: 5 })).rejects.toMatchObject({
    message: 'Recargue', code: 'ACCOUNT_VERSION_CONFLICT', status: 409, details: { currentVersion: 6 },
  });
});
