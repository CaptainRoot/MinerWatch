import { useEffect, useState } from 'react';

import type { SettingsCurrent } from '@/lib/types';

export interface WatchedAddress {
  address: string;
  label: string;
}

/**
 * Single source of truth for the in-memory form values shared by every
 * Settings tab. Initialised from the API response and merged back on
 * save. Each input does setForm({ ...form, foo: value }) — small enough
 * we don't need a reducer.
 */
export interface SettingsFormState {
  pollingInterval: number;
  requestTimeout: number;
  hashrateSmoothing: number;
  retentionDays: number;
  tempChip: number;
  tempVr: number;
  offlineSeconds: number;
  repeatSeconds: number;
  notificationsEnabled: boolean;
  pushEnabled: boolean;
  telegramEnabled: boolean;
  telegramChatId: string;
  telegramBotToken: string; // write-only
  telegramTokenSet: boolean;
  walletWatchEnabled: boolean;
  walletAddresses: WatchedAddress[];
  walletDustSats: number;
  scanCidr: string;
  authEnabled: boolean;
  authPassword: string; // write-only
  // MQTT / Home Assistant
  mqttEnabled: boolean;
  mqttHost: string;
  mqttPort: number;
  mqttUsername: string;
  mqttPassword: string; // write-only
  mqttPasswordSet: boolean;
  mqttBaseTopic: string;
  mqttDiscoveryPrefix: string;
  mqttDiscoveryEnabled: boolean;
  mqttFlatTopics: boolean;
  mqttAllowControls: boolean;
  mqttTls: boolean;
  mqttAmbientTempTopic: string;
  mqttAmbientStatusTopic: string;
  mqttConnected: boolean; // read-only status
}

export function useSettingsForm(current: SettingsCurrent | null | undefined) {
  const [form, setForm] = useState<SettingsFormState | null>(null);

  useEffect(() => {
    if (!current) return;
    setForm({
      pollingInterval: current.polling.interval_seconds,
      requestTimeout: current.polling.request_timeout,
      hashrateSmoothing: current.polling.hashrate_smoothing_seconds ?? 60,
      retentionDays:
        (current.storage as unknown as { retention_days?: number }).retention_days
          ?? current.storage.retention_1m_days
          ?? 30,
      tempChip: current.alerts.temp_chip_threshold,
      tempVr: current.alerts.temp_vr_threshold,
      offlineSeconds: current.alerts.offline_threshold_seconds,
      repeatSeconds: current.alerts.repeat_seconds,
      notificationsEnabled: current.alerts.notifications_enabled !== false,
      pushEnabled: current.alerts.push_enabled !== false,
      telegramEnabled: !!current.alerts.telegram_enabled,
      telegramChatId: current.alerts.telegram_chat_id ?? '',
      telegramBotToken: '',
      telegramTokenSet: !!current.alerts.telegram_token_set,
      walletWatchEnabled: current.alerts.wallet_watch_enabled !== false,
      walletAddresses: parseWatchedAddresses(current.alerts.wallet_watch_addresses),
      walletDustSats: current.alerts.wallet_watch_dust_sats ?? 546,
      scanCidr: current.network.scan_cidr,
      authEnabled: current.auth_enabled,
      authPassword: '',
      mqttEnabled: !!current.mqtt?.enabled,
      mqttHost: current.mqtt?.host ?? '',
      mqttPort: current.mqtt?.port ?? 1883,
      mqttUsername: current.mqtt?.username ?? '',
      mqttPassword: '',
      mqttPasswordSet: !!current.mqtt?.mqtt_password_set,
      mqttBaseTopic: current.mqtt?.base_topic ?? 'minerwatch',
      mqttDiscoveryPrefix: current.mqtt?.discovery_prefix ?? 'homeassistant',
      mqttDiscoveryEnabled: current.mqtt?.discovery_enabled !== false,
      mqttFlatTopics: !!current.mqtt?.publish_flat_topics,
      mqttAllowControls: !!current.mqtt?.allow_controls,
      mqttTls: !!current.mqtt?.tls,
      mqttAmbientTempTopic: current.mqtt?.ambient_temp_topic ?? '',
      mqttAmbientStatusTopic: current.mqtt?.ambient_temp_status_topic ?? '',
      mqttConnected: !!current.mqtt?.connected,
    });
  }, [current]);

  return [form, setForm] as const;
}

/**
 * The backend stores the watched-address list as a JSON string (its
 * settings overrides only carry scalars). Decode defensively: a
 * corrupted value must not blank the whole Settings page.
 */
function parseWatchedAddresses(raw: string | undefined): WatchedAddress[] {
  if (!raw) return [];
  try {
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data
      .filter((e): e is Record<string, unknown> => !!e && typeof e === 'object')
      .map((e) => ({
        address: String(e.address ?? '').trim(),
        label: String(e.label ?? '').trim(),
      }))
      .filter((e) => e.address.length > 0);
  } catch {
    return [];
  }
}

// Shape check mirroring the backend's ADDRESS_RE (wallet_watch.py):
// legacy (1…), P2SH (3…) base58, bech32/bech32m (bc1q…/bc1p…).
export const BTC_ADDRESS_RE = /^(bc1[02-9ac-hj-np-z]{11,87}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$/;

export function normalizeBtcAddress(address: string): string {
  const trimmed = address.trim();
  return trimmed.slice(0, 3).toLowerCase() === 'bc1' ? trimmed.toLowerCase() : trimmed;
}

/**
 * Convert the form state to the dotted-key overrides payload the
 * backend expects. Write-only secrets are only included when non-empty
 * so leaving them blank preserves whatever's stored.
 */
export function formToOverrides(form: SettingsFormState): Record<string, unknown> {
  const overrides: Record<string, unknown> = {
    'polling.interval_seconds': form.pollingInterval,
    'polling.request_timeout': form.requestTimeout,
    'polling.hashrate_smoothing_seconds': form.hashrateSmoothing,
    'storage.retention_days': form.retentionDays,
    'alerts.temp_chip_threshold': form.tempChip,
    'alerts.temp_vr_threshold': form.tempVr,
    'alerts.offline_threshold_seconds': form.offlineSeconds,
    'alerts.repeat_seconds': form.repeatSeconds,
    'alerts.notifications_enabled': form.notificationsEnabled,
    'alerts.push_enabled': form.pushEnabled,
    'alerts.telegram_enabled': form.telegramEnabled,
    'alerts.telegram_chat_id': form.telegramChatId.trim(),
    'alerts.wallet_watch_enabled': form.walletWatchEnabled,
    // Only valid rows are persisted; the AlertsTab UI flags invalid
    // ones in red so a typo is visible, not silently dropped.
    'alerts.wallet_watch_addresses': JSON.stringify(
      form.walletAddresses
        .map((w) => ({ address: normalizeBtcAddress(w.address), label: w.label.trim() }))
        .filter((w) => BTC_ADDRESS_RE.test(w.address)),
    ),
    'alerts.wallet_watch_dust_sats': Math.max(0, Math.round(form.walletDustSats) || 0),
    'network.scan_cidr': form.scanCidr,
    'auth.enabled': form.authEnabled,
    'mqtt.enabled': form.mqttEnabled,
    'mqtt.host': form.mqttHost.trim(),
    'mqtt.port': form.mqttPort,
    'mqtt.username': form.mqttUsername.trim(),
    'mqtt.base_topic': form.mqttBaseTopic.trim() || 'minerwatch',
    'mqtt.discovery_prefix': form.mqttDiscoveryPrefix.trim() || 'homeassistant',
    'mqtt.discovery_enabled': form.mqttDiscoveryEnabled,
    'mqtt.publish_flat_topics': form.mqttFlatTopics,
    'mqtt.allow_controls': form.mqttAllowControls,
    'mqtt.tls': form.mqttTls,
    'mqtt.ambient_temp_topic': form.mqttAmbientTempTopic.trim(),
    'mqtt.ambient_temp_status_topic': form.mqttAmbientStatusTopic.trim(),
  };
  if (form.authPassword) overrides['auth.password'] = form.authPassword;
  if (form.telegramBotToken) overrides['alerts.telegram_bot_token'] = form.telegramBotToken;
  if (form.mqttPassword) overrides['mqtt.password'] = form.mqttPassword;
  return overrides;
}
