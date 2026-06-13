import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Check, Lock, Move } from 'lucide-react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';

import { Button } from '@/components/ui/button';
import { Toolbar } from '@/components/dashboard/Toolbar';
import { CriticalBanner } from '@/components/dashboard/CriticalBanner';
import { AlertsBanner } from '@/components/dashboard/AlertsBanner';
import { FleetSummary } from '@/components/dashboard/FleetSummary';
import { BlockFindsCard } from '@/components/dashboard/BlockFindsCard';
import { AmbientTempCard } from '@/components/dashboard/AmbientTempCard';
import { BestSharesCard } from '@/components/dashboard/BestSharesCard';
import { FleetHashrateChart } from '@/components/dashboard/FleetHashrateChart';
import { MinerGrid } from '@/components/dashboard/MinerGrid';
import { AddMinerDialog } from '@/components/dashboard/AddMinerDialog';
import { SortableSectionChip } from '@/components/dashboard/SortableSectionChip';
import {
  useMiners,
  useScanNetwork,
  useSettings,
  useAuthStatus,
  useAckUnprotected,
} from '@/api/hooks';
import { useDashboardLayout } from '@/lib/useDashboardLayout';
import { SecurityScanDialog } from '@/components/dashboard/SecurityScanDialog';

/**
 * Migrated dashboard.
 *
 * Layout (top to bottom):
 *   - FIXED chrome (never reordered): Toolbar · Critical bar · Unread
 *     alerts bar · Block-finds trophy. The trophy sits with the alert
 *     banners on purpose — it's rare and important, and pinning it keeps
 *     it from being dragged out of sight.
 *   - MOVABLE sections (drag to reorder in "arrange" mode): fleet KPIs,
 *     ambient temperature, best-share fleet card, fleet hashrate chart,
 *     and the miner grid. Their order is persisted server-side (shared
 *     across this operator's browsers; see ``useDashboardLayout``).
 *
 * "Arrange" mode is entered from Settings → General (`?arrange=1`): the
 * movable sections are replaced by compact draggable chips, so the real
 * cards — including MinerGrid's own DnD context — aren't mounted while
 * reordering and there is no nested drag-and-drop. The user exits via
 * the inline "Done" bar.
 */

// Stable registry of the movable sections, in their default order.
// Module-level so the reference is stable for useDashboardLayout's memo.
const MOVABLE_SECTION_IDS = [
  'fleet-summary',
  'ambient-temp',
  'best-shares',
  'fleet-hashrate',
  'miner-grid',
] as const;

const SECTION_LABELS: Record<string, string> = {
  'fleet-summary': 'Fleet summary',
  'ambient-temp': 'Ambient temperature',
  'best-shares': 'Best shares',
  'fleet-hashrate': 'Fleet hashrate chart',
  'miner-grid': 'Miner grid',
};

export function DashboardPage() {
  const [addOpen, setAddOpen] = useState(false);
  const [scanWarnOpen, setScanWarnOpen] = useState(false);

  const { data: minersData, isLoading: minersLoading } = useMiners();
  const { data: settingsData } = useSettings();
  const { data: authStatus } = useAuthStatus();
  const scanMutation = useScanNetwork();
  const ackMutation = useAckUnprotected();

  const [searchParams, setSearchParams] = useSearchParams();
  const arranging = searchParams.get('arrange') === '1';

  const { ordered, reorder } = useDashboardLayout(MOVABLE_SECTION_IDS);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Auto-scan exposes the fleet on the network. If the install is still
  // unprotected (needs_setup) and the operator hasn't already opted out
  // (scan_ack), intercept the first scan with a blocking warning instead of
  // firing it immediately. Otherwise scan straight away.
  const requestScan = () => {
    if (authStatus?.needs_setup && !authStatus?.scan_ack) {
      setScanWarnOpen(true);
    } else {
      scanMutation.mutate();
    }
  };

  // "Scan anyway": record the opt-out (so we don't nag again) and run the
  // scan. The ambient banner stays until they actually set a password.
  const proceedScanUnprotected = () => {
    ackMutation.mutate();
    setScanWarnOpen(false);
    scanMutation.mutate();
  };

  const miners = minersData?.miners ?? [];
  const settings = settingsData?.current ?? null;
  const pollingSeconds = settings?.polling?.interval_seconds ?? null;

  const exitArrange = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('arrange');
    setSearchParams(next, { replace: true });
  };

  function handleSectionDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const fromIndex = ordered.indexOf(String(active.id));
    const toIndex = ordered.indexOf(String(over.id));
    if (fromIndex === -1 || toIndex === -1) return;
    reorder(fromIndex, toIndex);
  }

  function renderSection(id: string) {
    switch (id) {
      case 'fleet-summary':
        return <FleetSummary key={id} miners={miners} />;
      case 'ambient-temp':
        return <AmbientTempCard key={id} />;
      case 'best-shares':
        return <BestSharesCard key={id} />;
      case 'fleet-hashrate':
        return <FleetHashrateChart key={id} />;
      case 'miner-grid':
        return (
          <MinerGrid
            key={id}
            miners={miners}
            loading={minersLoading}
            onAdd={() => setAddOpen(true)}
            onScan={requestScan}
            scanning={scanMutation.isPending}
          />
        );
      default:
        return null;
    }
  }

  if (arranging) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3 rounded-lg border border-primary/40 bg-primary/10 px-3 py-2.5">
          <span className="flex items-center gap-2 text-sm">
            <Move className="h-4 w-4 shrink-0" />
            Customizing layout — drag the cards to reorder
          </span>
          <Button size="sm" onClick={exitArrange}>
            <Check className="h-4 w-4" />
            Done
          </Button>
        </div>

        <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-3">
          <span className="text-sm text-muted-foreground">
            Toolbar · alert banners · block-find trophy
          </span>
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            <Lock className="h-3 w-3" />
            Fixed
          </span>
        </div>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleSectionDragEnd}
        >
          <SortableContext items={[...ordered]} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {ordered.map((id) => (
                <SortableSectionChip key={id} id={id} label={SECTION_LABELS[id] ?? id} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Toolbar
        pollingSeconds={pollingSeconds}
        onAdd={() => setAddOpen(true)}
        onScan={requestScan}
        scanning={scanMutation.isPending}
      />

      <CriticalBanner miners={miners} settings={settings} />
      <AlertsBanner />
      <BlockFindsCard />

      {ordered.map(renderSection)}

      <AddMinerDialog open={addOpen} onOpenChange={setAddOpen} />
      <SecurityScanDialog
        open={scanWarnOpen}
        onOpenChange={setScanWarnOpen}
        onProceed={proceedScanUnprotected}
      />
    </div>
  );
}
