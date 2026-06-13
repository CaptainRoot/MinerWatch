import { useState } from 'react';
import { ArrowLeft, Pause, Play, Power, Trash2 } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ApiError } from '@/lib/api';
import {
  useDeleteMiner,
  usePauseMiner,
  useRestartMiner,
  useResumeMiner,
  useShutdownMiner,
} from '@/api/hooks';
import { FAMILY_LABEL } from '@/lib/format';
import type { MinerDetailResponse } from '@/lib/types';

interface Props {
  data: MinerDetailResponse;
}

export function MinerHeader({ data }: Props) {
  const navigate = useNavigate();
  const restart = useRestartMiner();
  const pause = usePauseMiner();
  const resume = useResumeMiner();
  const shutdown = useShutdownMiner();
  const remove = useDeleteMiner();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [restartOpen, setRestartOpen] = useState(false);
  const [standbyOpen, setStandbyOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { miner } = data;
  // Two firmware paths to the same "Standby" idea:
  //  - AxeOS Bitaxe: pause/resume (soft, no reboot)          → capabilities.pause
  //  - NerdQAxe (shufps): shutdown, resume only via restart  → capabilities.shutdown
  const canPause = data.capabilities?.pause ?? false;
  const canShutdown = data.capabilities?.shutdown ?? false;
  // Firmware-level gate: only show Standby when the miner actually reports
  // its stopped-state field (AxeOS `miningPaused` / NerdQAxe `shutdown`),
  // surfaced by the backend as mining_paused. On firmware without it the
  // value is null → hide the button instead of offering a control the
  // firmware would 404.
  const supportsStandby =
    (canPause || canShutdown) && data.live_sample?.mining_paused != null;
  const paused = data.live_sample?.mining_paused === true;
  const standbyPending = canPause ? pause.isPending : shutdown.isPending;
  const resumePending = canPause ? resume.isPending : restart.isPending;
  const familyLabel = FAMILY_LABEL[miner.family] ?? miner.family;
  const subtitleParts = [
    familyLabel,
    `${miner.host}${miner.port ? `:${miner.port}` : ''}`,
    miner.mac,
  ].filter(Boolean);

  async function doRestart() {
    setError(null);
    try {
      await restart.mutateAsync(miner.id);
      setRestartOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : (err as Error).message);
    }
  }

  async function doStandby() {
    setError(null);
    try {
      await (canPause ? pause : shutdown).mutateAsync(miner.id);
      setStandbyOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : (err as Error).message);
    }
  }

  async function doResume() {
    setError(null);
    try {
      // AxeOS has a soft resume; NerdQAxe resumes only via a restart.
      await (canPause ? resume : restart).mutateAsync(miner.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : (err as Error).message);
    }
  }

  async function doDelete() {
    setError(null);
    try {
      await remove.mutateAsync(miner.id);
      navigate('/');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : (err as Error).message);
    }
  }

  return (
    <>
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <Button asChild variant="ghost" size="icon" className="-ml-1 mt-0.5">
            <Link to="/" aria-label="Back to dashboard">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {miner.name}
              {paused && (
                <span className="ml-2 inline-flex items-center rounded-full bg-amber-500/15 px-2 py-0.5 align-middle text-xs font-medium text-amber-600">
                  Standby
                </span>
              )}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {subtitleParts.join(' · ')}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {supportsStandby &&
            (paused ? (
              <Button variant="subtle" onClick={doResume} disabled={resumePending}>
                <Play className="h-4 w-4" /> {resumePending ? 'Resuming…' : 'Resume'}
              </Button>
            ) : (
              <Button variant="subtle" onClick={() => setStandbyOpen(true)}>
                <Pause className="h-4 w-4" /> Standby
              </Button>
            ))}
          <Button variant="subtle" onClick={() => setRestartOpen(true)}>
            <Power className="h-4 w-4" /> Restart
          </Button>
          <Button variant="destructive" onClick={() => setConfirmOpen(true)}>
            <Trash2 className="h-4 w-4" /> Remove
          </Button>
        </div>
      </header>

      <Dialog open={restartOpen} onOpenChange={setRestartOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restart {miner.name}?</DialogTitle>
            <DialogDescription>
              The miner reboots and is unreachable for ~30 seconds. Historical metrics are
              preserved.
            </DialogDescription>
          </DialogHeader>
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRestartOpen(false)} disabled={restart.isPending}>
              Cancel
            </Button>
            <Button onClick={doRestart} disabled={restart.isPending}>
              {restart.isPending ? 'Sending…' : 'Restart'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={standbyOpen} onOpenChange={setStandbyOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Put {miner.name} into standby?</DialogTitle>
            <DialogDescription>
              Mining stops and the ASIC powers down — power draw and heat fall to near idle.
              The miner stays reachable and reports 0 H/s.{' '}
              {canPause
                ? 'Press Resume to bring it back (no reboot). A power cycle also resumes mining; this state is not saved across a reboot.'
                : 'This firmware has no soft resume: bring it back with Resume (which restarts the miner) or a power cycle. The state is not saved across a reboot.'}
            </DialogDescription>
          </DialogHeader>
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setStandbyOpen(false)} disabled={standbyPending}>
              Cancel
            </Button>
            <Button onClick={doStandby} disabled={standbyPending}>
              {standbyPending ? 'Sending…' : 'Put into standby'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove {miner.name}?</DialogTitle>
            <DialogDescription>
              This deletes the device registration and all historical metrics for this miner.
              The miner itself keeps running on the LAN — you can re-add it later via Scan
              network or Add miner. <strong>This action cannot be undone.</strong>
            </DialogDescription>
          </DialogHeader>
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)} disabled={remove.isPending}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={doDelete} disabled={remove.isPending}>
              {remove.isPending ? 'Removing…' : 'Remove permanently'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
