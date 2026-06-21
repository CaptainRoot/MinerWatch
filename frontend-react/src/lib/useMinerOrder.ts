import { useCallback, useEffect, useMemo, useRef } from 'react';

import { useMinerOrderQuery, useResetMinerOrder, useSaveMinerOrder } from '@/api/hooks';

// Persisted custom order for the dashboard miner grid.
//
// Contract:
//   - The canonical order lives in the BACKEND (`/api/miners/order`,
//     settings key `_miner_order`): one list shared by every browser
//     and — crucially — by the `/api/panel` feed, so the
//     ESP32 panel draws its cards in the same arrangement as the
//     dashboard. (It used to live in localStorage, per-browser, which
//     the panel could never see.)
//   - Entries are *stable* sanitized-MAC ids, the same scheme the
//     panel payload and HA discovery use: lowercase MAC without
//     separators, or `mw<db_id>` when no MAC is known. Keyed by MAC,
//     a miner that is deleted and later re-added keeps its slot.
//   - Any miner not present in the order appears AFTER the ordered
//     ones, in whatever order the API returned (name sort). Newly
//     discovered miners therefore land at the bottom without
//     disturbing the curated layout.
//   - Removed miners are NOT pruned: the server keeps their entry
//     (and re-inserts it at its old index when other clients save),
//     so they reclaim their position if they come back.
//
// localStorage now has exactly two jobs:
//   1. CACHE_KEY mirrors the last server answer so the first paint
//      after a reload doesn't flash the default order (and keeps the
//      grid usable if the GET fails).
//   2. LEGACY_KEY (numeric DB ids, the pre-backend format) feeds a
//      one-shot migration so nobody loses an arrangement they had
//      already curated. It is deleted once the migration lands.

const LEGACY_KEY = 'mw-miner-order';
const CACHE_KEY = 'mw-miner-order-macs';

/** Mirror of backend ``panel.sanitize_mac``: strip everything that is
 *  not alphanumeric, lowercase; fall back to ``mw<db_id>``. The two
 *  implementations must agree or the panel and the grid would order
 *  by different keys. */
function macIdOf(item: { id: number; mac?: string | null }): string {
  const cleaned = (item.mac ?? '').replace(/[^0-9a-zA-Z]/g, '').toLowerCase();
  return cleaned || `mw${item.id}`;
}

function readLegacy(): number[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(LEGACY_KEY) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  } catch {
    return [];
  }
}

function readCache(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(CACHE_KEY) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === 'string' && v.length > 0);
  } catch {
    return [];
  }
}

function writeCache(order: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(order));
  } catch {
    // Private-mode Safari etc. — drop silently; the query cache still
    // applies for the rest of the session.
  }
}

export interface UseMinerOrderResult<T> {
  /** Miners re-ordered according to the persisted preference. Same
   *  references as the input array (just shuffled). */
  ordered: T[];
  /** Apply a new ordering via the *displayed* index pair. Both
   *  indexes refer to positions in ``ordered``. */
  reorder: (fromIndex: number, toIndex: number) => void;
  /** Reset to the API order (clears the server-side preference). */
  reset: () => void;
}

/**
 * Hook factory: given the canonical list from the API and the items'
 * stable identity (id + mac), returns the same list sorted by the
 * shared custom order. Self-heals against added miners (appended in
 * API order); removed miners are simply skipped, never forgotten.
 */
export function useMinerOrder<T extends { id: number; mac?: string | null }>(
  items: T[],
): UseMinerOrderResult<T> {
  const query = useMinerOrderQuery();
  const save = useSaveMinerOrder();
  const resetMutation = useResetMinerOrder();

  const serverOrder = query.data?.order;

  // Effective order: the server's answer once it arrives (kept fresh
  // optimistically by useSaveMinerOrder), the cached copy before that
  // (or if the GET fails) so the grid renders stable immediately.
  const order = useMemo<string[]>(
    () => serverOrder ?? readCache(),
    [serverOrder],
  );

  // Mirror the server answer for the next first paint.
  useEffect(() => {
    if (serverOrder !== undefined) writeCache(serverOrder);
  }, [serverOrder]);

  // One-shot migration of the legacy per-browser order. Guarded three
  // ways: only after the GET resolved, only when the backend has no
  // order yet (it must never overwrite an arrangement made on another
  // device), and only once per session. The legacy key is removed only
  // after the POST succeeds, so a failed save can retry next visit.
  const migrated = useRef(false);
  const saveMutate = save.mutate;
  useEffect(() => {
    if (migrated.current) return;
    if (serverOrder === undefined || serverOrder.length > 0) return;
    if (!items.length) return;
    const legacy = readLegacy();
    if (!legacy.length) return;
    const macById = new Map(items.map((m) => [m.id, macIdOf(m)] as const));
    const macs = legacy
      .map((id) => macById.get(id))
      .filter((v): v is string => typeof v === 'string');
    if (!macs.length) return;
    migrated.current = true;
    writeCache(macs);
    saveMutate(macs, {
      onSuccess: () => {
        try {
          window.localStorage.removeItem(LEGACY_KEY);
        } catch {
          /* ignore */
        }
      },
    });
  }, [serverOrder, items, saveMutate]);

  const ordered = useMemo<T[]>(() => {
    if (!items.length) return items;
    const byMac = new Map<string, T>(items.map((m) => [macIdOf(m), m] as const));
    const seen = new Set<string>();
    const out: T[] = [];
    // First: items the user has explicitly ordered, in stored order.
    // Ids of removed miners simply find no match and are skipped.
    for (const mac of order) {
      const item = byMac.get(mac);
      if (item && !seen.has(mac)) {
        out.push(item);
        seen.add(mac);
      }
    }
    // Then: items not yet in the stored order, in their original
    // (API) order. New miners therefore append to the end.
    for (const item of items) {
      const mac = macIdOf(item);
      if (!seen.has(mac)) {
        out.push(item);
        seen.add(mac);
      }
    }
    return out;
  }, [items, order]);

  const reorder = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (fromIndex === toIndex) return;
      // Compute the new full order from the *displayed* sequence so
      // that previously-unordered items get baked into the preference
      // on first move (otherwise dragging an "unordered" miner would
      // not persist relative to the others).
      const currentMacs = ordered.map(macIdOf);
      if (fromIndex < 0 || fromIndex >= currentMacs.length) return;
      if (toIndex < 0 || toIndex >= currentMacs.length) return;
      const next = [...currentMacs];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      // The mutation patches the query cache in onMutate, so the grid
      // flips instantly and a refetch can't bounce it back mid-drag.
      // The local cache write keeps the next first-paint consistent
      // even if the POST fails (offline): behaviourally that's the old
      // per-browser mode, and the save retries on the next drag.
      writeCache(next);
      saveMutate(next);
    },
    [ordered, saveMutate],
  );

  const resetMutate = resetMutation.mutate;
  const reset = useCallback(() => {
    writeCache([]);
    resetMutate();
  }, [resetMutate]);

  return { ordered, reorder, reset };
}
