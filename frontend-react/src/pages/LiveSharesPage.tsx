import { useEffect, useState } from 'react';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LiveSharesCard } from '@/components/analytics/LiveSharesCard';
import { FleetLiveSharesCard } from '@/components/analytics/FleetLiveSharesCard';
import { useMiners } from '@/api/hooks';

const TAB_STORAGE_KEY = 'mw-live-shares-tab';

/**
 * Dedicated "Live shares" page (its own nav entry, between Analytics and
 * Pools). Two tabs:
 *   - All miners: a fleet-wide aggregated scatter, one colour per
 *     device, with per-miner toggle filters. This is the DEFAULT view:
 *     it answers "is the fleet finding shares right now?" at a glance.
 *   - Per miner: the long-running single-device scatter + Hall of Fame.
 * The active tab is persisted to localStorage so a user who lives in
 * the per-miner view doesn't have to re-pick it on every reload.
 */
export function LiveSharesPage() {
  const { data: minersData } = useMiners();
  const miners = minersData?.miners ?? [];

  const [tab, setTab] = useState<string>(() => {
    if (typeof window === 'undefined') return 'fleet';
    const stored = window.localStorage.getItem(TAB_STORAGE_KEY);
    return stored === 'single' ? 'single' : 'fleet';
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(TAB_STORAGE_KEY, tab);
    } catch {
      /* private-mode Safari etc. */
    }
  }, [tab]);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Live shares</h1>
        <p className="text-sm text-muted-foreground">
          Every share in real time, straight from the miner's log — AxeOS only
        </p>
      </header>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="fleet">All miners</TabsTrigger>
          <TabsTrigger value="single">Per miner</TabsTrigger>
        </TabsList>
        <TabsContent value="fleet">
          <FleetLiveSharesCard miners={miners} />
        </TabsContent>
        <TabsContent value="single">
          <LiveSharesCard miners={miners} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
