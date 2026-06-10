import { Plus, Trash2, Wallet } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { useAckAlert, useAllAlerts } from '@/api/hooks';
import { useState } from 'react';
import type { AlertSeverity } from '@/lib/types';
import { BTC_ADDRESS_RE, normalizeBtcAddress } from './SettingsForm';
import type { SettingsFormState, WatchedAddress } from './SettingsForm';

interface Props {
  form: SettingsFormState;
  setForm: (next: SettingsFormState) => void;
}

export function AlertsTab({ form, setForm }: Props) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Alert thresholds</CardTitle>
          <CardDescription>
            When a temperature exceeds the threshold or a miner goes offline for too long.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <NumField
            id="alerts.temp_chip_threshold"
            label="Max chip temp (°C)"
            value={form.tempChip}
            min={40}
            max={120}
            step={0.5}
            onChange={(v) => setForm({ ...form, tempChip: v })}
          />
          <NumField
            id="alerts.temp_vr_threshold"
            label="Max VR temp (°C)"
            value={form.tempVr}
            min={40}
            max={130}
            step={0.5}
            onChange={(v) => setForm({ ...form, tempVr: v })}
          />
          <NumField
            id="alerts.offline_threshold_seconds"
            label="Offline threshold (seconds)"
            value={form.offlineSeconds}
            min={10}
            max={3600}
            onChange={(v) => setForm({ ...form, offlineSeconds: v })}
          />
          <NumField
            id="alerts.repeat_seconds"
            label="Repeat alert every (seconds)"
            value={form.repeatSeconds}
            min={60}
            max={86400}
            onChange={(v) => setForm({ ...form, repeatSeconds: v })}
          />

          <div className="flex items-start justify-between gap-3 rounded-md border border-border bg-muted/30 p-3 sm:col-span-2">
            <div>
              <div className="text-sm font-semibold">Send push notifications</div>
              <p className="text-xs text-muted-foreground">
                Global kill-switch. When off, MinerWatch keeps recording alerts but doesn't push
                them on any channel. Existing browser subscriptions stay registered.
              </p>
            </div>
            <Switch
              checked={form.notificationsEnabled}
              onCheckedChange={(v) => setForm({ ...form, notificationsEnabled: v })}
            />
          </div>

          <p className="text-xs text-muted-foreground sm:col-span-2">
            If the condition persists (temp still above threshold, miner still offline), MinerWatch
            re-emits the alert every "Repeat alert every" seconds (default 600 = 10 min).
          </p>
        </CardContent>
      </Card>

      <WatchedAddressesCard form={form} setForm={setForm} />

      <AlertHistoryCard />
    </div>
  );
}

function WatchedAddressesCard({ form, setForm }: Props) {
  const rows = form.walletAddresses;

  const updateRow = (index: number, patch: Partial<WatchedAddress>) => {
    const next = rows.map((row, i) => (i === index ? { ...row, ...patch } : row));
    setForm({ ...form, walletAddresses: next });
  };

  const removeRow = (index: number) => {
    setForm({ ...form, walletAddresses: rows.filter((_, i) => i !== index) });
  };

  const addRow = () => {
    setForm({ ...form, walletAddresses: [...rows, { address: '', label: '' }] });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-chart-power/15 text-chart-power">
            <Wallet className="h-4 w-4" />
          </div>
          <div>
            <CardTitle className="text-base">Watched Bitcoin addresses</CardTitle>
            <CardDescription>
              Get notified when an address receives a new confirmed incoming transaction. Checked
              via mempool.space about once a minute.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-start justify-between gap-3 rounded-md border border-border bg-muted/30 p-3">
          <div>
            <div className="text-sm font-semibold">Watch addresses</div>
            <p className="text-xs text-muted-foreground">
              Pauses checking without losing the list below. Notifications go out on the channels
              enabled in the Notifications tab.
            </p>
          </div>
          <Switch
            checked={form.walletWatchEnabled}
            onCheckedChange={(v) => setForm({ ...form, walletWatchEnabled: v })}
          />
        </div>

        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No addresses yet — add the one you want to keep an eye on (e.g. your donation or solo
            payout address).
          </p>
        ) : (
          <div className="space-y-3">
            {rows.map((row, i) => {
              const normalized = normalizeBtcAddress(row.address);
              const invalid = normalized.length > 0 && !BTC_ADDRESS_RE.test(normalized);
              return (
                <div key={i} className="space-y-1">
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input
                      className={`font-mono text-xs sm:flex-[3] ${invalid ? 'border-destructive' : ''}`}
                      type="text"
                      placeholder="bc1q… / 3… / 1…"
                      autoComplete="off"
                      spellCheck={false}
                      value={row.address}
                      onChange={(e) => updateRow(i, { address: e.target.value })}
                      aria-label={`Watched address ${i + 1}`}
                      aria-invalid={invalid}
                    />
                    <div className="flex gap-2 sm:flex-[2]">
                      <Input
                        type="text"
                        placeholder="Label (optional, e.g. Donations)"
                        autoComplete="off"
                        value={row.label}
                        onChange={(e) => updateRow(i, { label: e.target.value })}
                        aria-label={`Label for watched address ${i + 1}`}
                      />
                      <Button
                        variant="destructive"
                        size="sm"
                        className="shrink-0 self-center"
                        onClick={() => removeRow(i)}
                        aria-label={`Remove watched address ${i + 1}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  {invalid && (
                    <p className="text-xs text-destructive">
                      Doesn't look like a Bitcoin address — this row won't be saved.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <Button variant="subtle" onClick={addRow}>
          <Plus className="h-4 w-4" />
          Add address
        </Button>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <NumField
            id="alerts.wallet_watch_dust_sats"
            label="Dust threshold (sats)"
            value={form.walletDustSats}
            min={0}
            max={100000}
            onChange={(v) => setForm({ ...form, walletDustSats: v })}
          />
          <p className="self-end pb-2 text-xs text-muted-foreground">
            Incoming amounts at or below this are flagged as a potential dust attack (you still
            get notified, with a warning).
          </p>
        </div>

        <p className="text-xs text-muted-foreground">
          Transactions are notified once <strong>confirmed</strong> (in a block), so expect them a
          few minutes after they appear in the mempool. Clicking the notification opens the
          address on mempool.space. Remember to click <strong>Save all</strong> after editing.
        </p>
      </CardContent>
    </Card>
  );
}

interface NumFieldProps {
  id: string;
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (v: number) => void;
}

function NumField({ id, label, value, min, max, step, onChange }: NumFieldProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        value={Number.isFinite(value) ? value : ''}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

function AlertHistoryCard() {
  const { data } = useAllAlerts(50);
  const ack = useAckAlert();
  const [busyId, setBusyId] = useState<number | null>(null);

  const alerts = data?.alerts ?? [];
  const severityVariant = (s: AlertSeverity) =>
    s === 'critical' ? 'danger' : s === 'warning' ? 'warning' : 'secondary';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Alert history</CardTitle>
        <CardDescription>Last 50 alerts, newest first. Acknowledge to clear unread state.</CardDescription>
      </CardHeader>
      <CardContent>
        {!alerts.length ? (
          <p className="text-sm text-muted-foreground">No alerts.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="px-2 py-2 text-left font-medium">When</th>
                  <th className="px-2 py-2 text-left font-medium">Severity</th>
                  <th className="px-2 py-2 text-left font-medium">Code</th>
                  <th className="px-2 py-2 text-left font-medium">Message</th>
                  <th className="px-2 py-2 text-right font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {alerts.map((a) => (
                  <tr key={a.id} className="border-b border-border/40 last:border-0">
                    <td className="px-2 py-2 tabular-nums text-muted-foreground whitespace-nowrap">
                      {new Date(a.ts * 1000).toLocaleString()}
                    </td>
                    <td className="px-2 py-2">
                      <Badge variant={severityVariant(a.severity)}>{a.severity}</Badge>
                    </td>
                    <td className="px-2 py-2 font-mono text-xs">{a.code}</td>
                    <td className="px-2 py-2">{a.message}</td>
                    <td className="px-2 py-2 text-right">
                      {a.acknowledged ? (
                        <span className="text-emerald-400">✓</span>
                      ) : (
                        <Button
                          size="sm"
                          variant="subtle"
                          disabled={busyId === a.id}
                          onClick={() => {
                            setBusyId(a.id);
                            ack.mutate(a.id, { onSettled: () => setBusyId(null) });
                          }}
                        >
                          {busyId === a.id ? '…' : 'Ack'}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
