import { AsyncLocalStorage } from 'async_hooks';

type TenantStore = {
  tenantId: number | null;
};

const tenantStore = new AsyncLocalStorage<TenantStore>();

export const TenantContext = {
  run(tenantId: number | null, callback: () => void) {
    tenantStore.run({ tenantId }, callback);
  },
  getTenantId(): number | null {
    return tenantStore.getStore()?.tenantId ?? null;
  },
};
