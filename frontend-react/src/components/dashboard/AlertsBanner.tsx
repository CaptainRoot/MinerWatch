import { useState } from 'react';
import { Bell, BellOff, BellRing, ChevronDown, ChevronUp } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useAckAllAlerts, useMuteMinerOffline, useUnackAlerts } from '@/api/hooks';
import { fmtRelative } from '@/lib/format';
import type { AlertEntry } from '@/lib/types';

/**
 * Compact bar showing unread alert count + the latest message. Severity
 * drives the colour: critical = red, warning = amber, info = neutral.
 *
 * "Mark all as read" calls the existing /api/alerts/{id}/ack endpoint for
 * each entry in parallel. "Show all" expands the bar into the full list of
 * alerts that fired since the last time they were marked read (the same
 * unacked set the count is based on), each with its relative time.
 */
export function AlertsBanner() {
  const { data } = useUnackAlerts();
  const ack = useAckAllAlerts();
  const muteTop = useMuteMinerOffline();
  const [expanded, setExpanded] = useState(false);

  const alerts = data?.alerts ?? [];
  if (!alerts.length) return null;
  const last = alerts[0];
  // The top (latest) alert is the one the collapsed bar previews. When it's an
  // offline alert, surface a quick Mute right here so the user can silence the
  // miner without expanding the list — the common "I just powered it down" case.
  const canMuteTop = last.code === 'offline' && last.miner_id != null;

  const tone =
    last.severity === 'critical'
      ? 'border-destructive/40 bg-destructive/10 text-destructive'
      : last.severity === 'warning'
        ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
        : 'border-border bg-card text-foreground';

  const Icon = last.severity === 'critical' ? BellRing : Bell;

  return (
    <div className={`rounded-lg border text-sm ${tone}`}>
      <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-3">
        {/* The whole summary line is a toggle. Two phone-sized fixes in
            one: with a single alert there used to be NO toggle at all
            (canExpand was length > 1), so a long truncated message
            could never be read; and even with many alerts the only tap
            target was the small chevron button. Tapping the line now
            expands the list, where messages wrap in full. */}
        <button
          type="button"
          className="flex min-w-0 items-center gap-3 text-left"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          <Icon className="h-4 w-4 shrink-0" />
          <span className="font-medium whitespace-nowrap">
            {alerts.length} unread alert{alerts.length === 1 ? '' : 's'}
          </span>
          {!expanded && (
            <span className="min-w-0 truncate opacity-90">· {last.message}</span>
          )}
        </button>
        <div className="flex items-center gap-2 sm:ml-auto">
          {!expanded && canMuteTop && (
            <Button
              type="button"
              size="sm"
              variant="subtle"
              className="shrink-0 gap-1 whitespace-nowrap px-2"
              disabled={muteTop.isPending}
              onClick={() => muteTop.mutate(last.miner_id as number)}
              title="Silence this miner's offline alerts until it comes back online"
            >
              <BellOff className="h-4 w-4" />
              {muteTop.isPending ? 'Muting…' : 'Mute'}
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            variant="subtle"
            className="flex-1 whitespace-nowrap sm:flex-initial"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
          >
            {expanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
            {expanded ? 'Hide' : alerts.length > 1 ? `Show all (${alerts.length})` : 'Show'}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="subtle"
            className="flex-1 whitespace-nowrap sm:flex-initial"
            disabled={ack.isPending}
            onClick={() => ack.mutate()}
          >
            {ack.isPending ? 'Marking…' : 'Mark all as read'}
          </Button>
        </div>
      </div>

      {expanded && (
        <ul className="max-h-64 overflow-y-auto border-t border-border/60">
          {alerts.map((a) => (
            <AlertRow key={a.id} alert={a} />
          ))}
        </ul>
      )}
    </div>
  );
}

function AlertRow({ alert }: { alert: AlertEntry }) {
  const mute = useMuteMinerOffline();
  const dot =
    alert.severity === 'critical'
      ? 'bg-destructive'
      : alert.severity === 'warning'
        ? 'bg-amber-400'
        : 'bg-muted-foreground';
  // Offline alerts get a Mute action: the miner was powered down on purpose,
  // so silence its disconnect alerts (and stop the repeats) until it comes
  // back online. Only offline rows carry a miner_id worth muting.
  const canMute = alert.code === 'offline' && alert.miner_id != null;
  return (
    <li className="flex items-start gap-2 border-t border-border/40 px-4 py-2 first:border-t-0">
      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dot}`} />
      <span className="min-w-0 flex-1 break-words text-foreground">
        {alert.message}
      </span>
      {canMute && (
        <Button
          type="button"
          size="sm"
          variant="subtle"
          className="h-6 shrink-0 gap-1 px-2 text-xs"
          disabled={mute.isPending}
          onClick={() => mute.mutate(alert.miner_id as number)}
          title="Silence this miner's offline alerts until it comes back online"
        >
          <BellOff className="h-3.5 w-3.5" />
          {mute.isPending ? 'Muting…' : 'Mute'}
        </Button>
      )}
      <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">
        {fmtRelative(alert.ts)}
      </span>
    </li>
  );
}
