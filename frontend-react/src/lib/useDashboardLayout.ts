import { useCallback, useEffect, useMemo } from 'react';

import {
  useDashboardLayoutQuery,
  useResetDashboardLayout,
  useSaveDashboardLayout,
} from '@/api/hooks';

// Persisted custom order for the main dashboard's *movable* sections
// (fleet summary, ambient temperature, best shares, hashrate chart,
// miner grid). The fixed chrome — toolbar, alert banners, block-find
// trophy — is rendered outside this list and never reordered.
//
// Contract (mirrors `useMinerOrder`, minus the panel coupling):
//   - The canonical order lives in the BACKEND (`/api/dashboard/layout`,
//     settings key `_dashboard_section_order`), so a custom layout
//     follows the operator across browsers/devices — same as the miner
//     order, for consistency. It is NOT consumed by the ESP32 panel.
//   - Entries are stable section ids owned by the caller (the dashboard
//     section registry). Any registered id missing from the stored
//     order is appended AFTER the stored ones, in registry order, so a
//     section added in a future release lands at the bottom without
//     disturbing the curated layout. Unknown stored ids (a section
//     removed from the code) are simply skipped.
//
// localStorage mirrors the last server answer so the first paint after a
// reload doesn't flash the default order (and keeps it usable if the GET
// fails). No legacy migration: this is a new preference.

const CACHE_KEY = 'mw-dashboard-section-order';

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

/** Drop the cached order so the next first paint doesn't resurrect a
 *  layout the user just reset. Used by the Settings "Reset to default"
 *  button, which lives on a page that never mounts the hook. */
export function clearDashboardLayoutCache(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(CACHE_KEY);
  } catch {
    /* ignore */
  }
}

export interface UseDashboardLayoutResult {
  /** Section ids in the resolved display order (custom order first,
   *  then any registered-but-unstored ids in registry order). */
  ordered: string[];
  /** Apply a new ordering via the *displayed* index pair. */
  reorder: (fromIndex: number, toIndex: number) => void;
  /** Reset to the default registry order (clears the server preference). */
  reset: () => void;
}

/**
 * Given the canonical registry of movable section ids, return them
 * sorted by the shared custom order. Self-heals against sections added
 * (appended in registry order) or removed (stored id skipped).
 *
 * `sectionIds` MUST be a stable reference (a module-level const), since
 * it feeds the memo dependencies.
 */
export function useDashboardLayout(sectionIds: readonly string[]): UseDashboardLayoutResult {
  const query = useDashboardLayoutQuery();
  const save = useSaveDashboardLayout();
  const resetMutation = useResetDashboardLayout();

  const serverOrder = query.data?.order;

  // Effective order: the server's answer once it arrives (kept fresh
  // optimistically by useSaveDashboardLayout), the cached copy before
  // that (or if the GET fails) so the dashboard renders stable at once.
  const order = useMemo<string[]>(() => serverOrder ?? readCache(), [serverOrder]);

  // Mirror the server answer for the next first paint.
  useEffect(() => {
    if (serverOrder !== undefined) writeCache(serverOrder);
  }, [serverOrder]);

  const ordered = useMemo<string[]>(() => {
    const known = new Set(sectionIds);
    const seen = new Set<string>();
    const out: string[] = [];
    // First: sections the user has explicitly ordered, in stored order.
    // Ids of sections removed from the code find no match and are skipped.
    for (const id of order) {
      if (known.has(id) && !seen.has(id)) {
        out.push(id);
        seen.add(id);
      }
    }
    // Then: registered sections not yet in the stored order, in registry
    // order. New sections therefore append to the end.
    for (const id of sectionIds) {
      if (!seen.has(id)) {
        out.push(id);
        seen.add(id);
      }
    }
    return out;
  }, [sectionIds, order]);

  const saveMutate = save.mutate;
  const reorder = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (fromIndex === toIndex) return;
      if (fromIndex < 0 || fromIndex >= ordered.length) return;
      if (toIndex < 0 || toIndex >= ordered.length) return;
      const next = [...ordered];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      // The mutation patches the query cache in onMutate, so the chips
      // flip instantly and a refetch can't bounce them back mid-drag.
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
