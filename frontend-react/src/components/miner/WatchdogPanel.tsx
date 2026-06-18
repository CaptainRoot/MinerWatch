import { useEffect, useState } from 'react';
import { ShieldAlert } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError } from '@/lib/api';
import { useSetFanConfig } from '@/api/hooks';
import type { MinerDetailResponse } from '@/lib/types';

interface Props {
  data: MinerDetailResponse;
}

const DEFAULT_WATCHDOG_C = 75;
const RELEASE_MARGIN_C = 10;
const MIN_C = 60;
const MAX_C = 95;

/**
 * Advanced tab — the overheat watchdog trigger (Avalon/Canaan only).
 *
 * The overheat watchdog is a server-side safety net (backend auto_control.py)
 * that forces the fan to 100% when chip temperature stays at/above a hard
 * trigger, regardless of fan mode, and alerts. The trigger defaults to 75°C;
 * the Avalon firmware is not cautious enough, so this lets the user pick their
 * own ceiling. The fan is released once the chip drops a fixed 10°C below the
 * trigger. Every other miner family keeps the fixed 75°C net, so this card
 * renders only for Canaan.
 */
export function WatchdogPanel({ data }: Props) {
  const { miner } = data;
  const setConfig = useSetFanConfig(miner.id);

  const [value, setValue] = useState<number | ''>(
    miner.watchdog_overheat_c ?? DEFAULT_WATCHDOG_C,
  );
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Keep the field in sync with backend state on load / external changes.
  useEffect(() => {
    setValue(miner.watchdog_overheat_c ?? DEFAULT_WATCHDOG_C);
  }, [miner.watchdog_overheat_c]);

  // Avalon/Canaan only — every other family keeps the fixed 75°C net.
  if ((miner.family ?? '').toLowerCase() !== 'canaan') return null;

  const pending = setConfig.isPending;
  const releaseAt =
    typeof value === 'number' && Number.isFinite(value)
      ? value - RELEASE_MARGIN_C
      : null;

  async function save() {
    setFeedback(null);
    setError(null);
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      setError('Enter a temperature.');
      return;
    }
    if (value < MIN_C || value > MAX_C) {
      setError(`Choose a value between ${MIN_C}°C and ${MAX_C}°C.`);
      return;
    }
    try {
      await setConfig.mutateAsync({ watchdog_overheat_c: value });
      setFeedback(`Overheat watchdog set to ${value}°C`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : (err as Error).message);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base flex items-center gap-2">
          <ShieldAlert className="h-4 w-4" /> Overheat watchdog
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="watchdog-c" className="text-sm">
            Trigger temperature (°C)
          </Label>
          <div className="flex gap-2">
            <Input
              id="watchdog-c"
              type="number"
              min={MIN_C}
              max={MAX_C}
              step={1}
              value={value}
              onChange={(e) =>
                setValue(e.target.value === '' ? '' : Number(e.target.value))
              }
              disabled={pending}
              className="max-w-[140px]"
            />
            <Button variant="subtle" onClick={save} disabled={pending}>
              Save
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Default 75°C. When chip temperature stays at or above this for ~15s,
            MinerWatch forces the fan to 100% and sends an alert — on top of the
            firmware's own protection. It releases once the chip drops to{' '}
            {releaseAt != null ? `${releaseAt}°C` : '10°C below'} (10°C under the
            trigger). Range {MIN_C}–{MAX_C}°C.
          </p>
        </div>

        {(feedback || error) && (
          <p
            className={`text-sm ${error ? 'text-destructive' : 'text-emerald-400'}`}
            role="status"
          >
            {error ?? feedback}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
