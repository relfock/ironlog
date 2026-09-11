/**
 * BLE heart-rate monitor bridge.
 *
 * Connects to the standard Bluetooth SIG Heart Rate service (0x180D) that
 * heart-rate straps and watches broadcast (Polar, Wahoo, Garmin, …),
 * subscribes to Heart Rate Measurement (0x2A37), and buffers
 * a downsampled reading every 5 s while a workout is open.
 *
 * The native module is loaded lazily through `require` so importing this store
 * never touches the TurboModule — jest stays green and non-android hosts are
 * no-ops. Writing samples to SQLite happens in ActiveWorkoutStore.finish();
 * this store only ever buffers.
 */
import { makeAutoObservable, runInAction } from 'mobx';
import { Platform } from 'react-native';
import { isPlausibleBpm, parseHeartRateMeasurement } from '@/domain/heartRate';
import { onWorkoutTick } from '@/lib/keepAlive';
import { requestBlePermissions } from '@/lib/blePermissions';
import type { SettingsStore } from './SettingsStore';

// `import type` is fully erased, so referencing the library here never loads
// its TurboModule — the runtime require stays inside loadBlePlx().
import type * as BlePlxTypes from '@sfourdrinier/react-native-ble-plx';

type BleManager = InstanceType<typeof BlePlxTypes.BleManager>;
type BleDevice = InstanceType<typeof BlePlxTypes.Device>;
type Subscription = ReturnType<BleManager['monitorCharacteristicForDevice']>;

export type HeartRateStatus =
  | 'idle'
  | 'scanning'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error';

export interface ScanDevice {
  readonly id: string;
  readonly name: string | null;
  readonly rssi: number | null;
  readonly hasHeartRateService: boolean;
}

export interface HeartRateSample {
  /** Epoch-ms of the wall-clock reading. */
  readonly recordedAt: number;
  readonly bpm: number;
}

/** Standard Bluetooth SIG Heart Rate service + Heart Rate Measurement char. */
const HRS_FULL_UUID = '0000180d-0000-1000-8000-00805f9b34fb';
const HRM_FULL_UUID = '00002a37-0000-1000-8000-00805f9b34fb';

/** Straps broadcast ~1 reading/s; persist every 5 s to keep rows sane. */
const SAMPLE_INTERVAL_MS = 5000;
const CONNECT_TIMEOUT_MS = 15000;

/**
 * The workout clock ticks once a second; record a sample every 5 ticks.
 * Matches the historical SAMPLE_INTERVAL_MS cadence, but because the clock is
 * driven by the native foreground-service ticker the sampling survives being
 * minimized (JS setInterval does not — see lib/keepAlive).
 */
const SAMPLE_EVERY_TICKS = SAMPLE_INTERVAL_MS / 1000;

/** Reconnect loop: wait, scan a bounded round for the lost strap, retry. */
const RECONNECT_INITIAL_DELAY_MS = 1500;
const RECONNECT_SCAN_ROUND_MS = 10000;
const RECONNECT_DELAY_CAP_MS = 20000;

let cachedModule: typeof BlePlxTypes | null = null;
function loadBlePlx(): typeof BlePlxTypes {
  if (cachedModule === null) {
    cachedModule = require('@sfourdrinier/react-native-ble-plx') as typeof BlePlxTypes;
  }
  return cachedModule;
}

const B64 =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** base64 -> bytes without relying on Hermes' atob/btoa globals. */
export function base64ToBytes(b64: string): number[] {
  const out: number[] = [];
  let acc = 0;
  let bits = 0;
  for (let i = 0; i < b64.length; i++) {
    const c = b64[i];
    if (c === '=') break;
    const v = B64.indexOf(c ?? '');
    if (v === -1) continue;
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((acc >> bits) & 0xff);
    }
  }
  return out;
}

export class HeartRateStore {
  status: HeartRateStatus = 'idle';
  errorMessage: string | null = null;
  devices: ScanDevice[] = [];
  liveBpm: number | null = null;
  deviceName: string | null = null;

  private manager: BleManager | null = null;
  private monitorSub: Subscription | null = null;
  private disconnectSub: Subscription | null = null;
  private tickUnsub: (() => void) | null = null;
  private tickCount = 0;
  private latestBpm: number | null = null;
  private sampleBuffer: HeartRateSample[] = [];
  private workoutActive = false;
  private connectedDeviceId: string | null = null;
  /** Last successfully paired strap, kept across drops so lost sessions recover. */
  private rememberedDeviceId: string | null = null;
  private rememberedDeviceName: string | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectRound = 0;
  /** Generation token: bump to invalidate any in-flight reconnect work. */
  private reconnectGen = 0;
  private reconnectScanning = false;
  /** Synthetic-strap testing mode: emits a plausible HR wave every second. */
  emulatorActive = false;
  private emulatorTick = 0;

  constructor(private readonly settings: SettingsStore) {
    makeAutoObservable<
      HeartRateStore,
      | 'manager'
      | 'monitorSub'
      | 'disconnectSub'
      | 'tickUnsub'
      | 'tickCount'
      | 'latestBpm'
      | 'sampleBuffer'
      | 'workoutActive'
      | 'connectedDeviceId'
      | 'rememberedDeviceId'
      | 'rememberedDeviceName'
      | 'reconnectTimer'
      | 'reconnectRound'
      | 'reconnectGen'
      | 'reconnectScanning'
      | 'emulatorTick'
    >(
      this,
      {
        manager: false,
        monitorSub: false,
        disconnectSub: false,
        tickUnsub: false,
        tickCount: false,
        latestBpm: false,
        sampleBuffer: false,
        workoutActive: false,
        connectedDeviceId: false,
        rememberedDeviceId: false,
        rememberedDeviceName: false,
        reconnectTimer: false,
        reconnectRound: false,
        reconnectGen: false,
        reconnectScanning: false,
        emulatorTick: false,
      },
      { autoBind: true },
    );
  }

  get supported(): boolean {
    return Platform.OS === 'android';
  }

  get connected(): boolean {
    return this.status === 'connected';
  }

  get reconnecting(): boolean {
    return this.status === 'reconnecting';
  }

  get bufferSize(): number {
    return this.sampleBuffer.length;
  }

  /** @internal Snapshot + clear; called by ActiveWorkoutStore.finish(). */
  detachWorkout(): HeartRateSample[] {
    this.stopReconnect();
    this.stopSampling();
    this.workoutActive = false;
    const samples = this.sampleBuffer.slice();
    this.sampleBuffer = [];
    return samples;
  }

  /** @internal Called by ActiveWorkoutStore when a session opens. */
  attachWorkout(): void {
    this.workoutActive = true;
    this.sampleBuffer = [];
    this.maybeStartSampling();
    // A new session should re-arm itself against the last used strap too.
    if (!this.connected && this.rememberedDeviceId !== null) {
      this.startReconnect();
    }
  }

  async startScan(): Promise<void> {
    if (!this.supported) return;
    if (this.status === 'scanning') return;

    // The user is taking over pairing — drop any automatic recovery loop.
    this.stopReconnect();
    this.stopEmulator();
    runInAction(() => {
      this.errorMessage = null;
    });

    const granted = await requestBlePermissions();
    if (!granted) {
      runInAction(() => {
        this.status = 'error';
        this.errorMessage = 'Bluetooth permission was not granted.';
      });
      return;
    }

    const manager = this.ensureManager();
    try {
      const state = await manager.state();
      if (state !== 'PoweredOn') {
        runInAction(() => {
          this.status = 'error';
          this.errorMessage = 'Turn on Bluetooth and try again.';
        });
        return;
      }
    } catch {
      runInAction(() => {
        this.status = 'error';
        this.errorMessage = 'Bluetooth is unavailable on this device.';
      });
      return;
    }

    runInAction(() => {
      this.devices = [];
      this.status = 'scanning';
    });

    try {
      // Bluetooth Scanner matching needs the full 128-bit service UUID.
      await manager.startDeviceScan([HRS_FULL_UUID], null, (error, device) => {
        if (error !== null) {
          void this.failScan(error.message);
          return;
        }
        if (device === null) return;
        const id = device.id;
        runInAction(() => {
          const existing = this.devices.find((d) => d.id === id);
          const entry: ScanDevice = {
            id,
            name: device.name,
            rssi: device.rssi,
            hasHeartRateService:
              device.serviceUUIDs?.some(
                (u) => u.toLowerCase() === HRS_FULL_UUID,
              ) ?? false,
          };
          if (existing === undefined) {
            this.devices = [...this.devices, entry];
          } else {
            this.devices = this.devices.map((d) => (d.id === id ? entry : d));
          }
        });
      });
    } catch (error) {
      void this.failScan(
        error instanceof Error ? error.message : 'Could not start scanning.',
      );
    }
  }

  async stopScan(): Promise<void> {
    if (this.manager !== null && this.status === 'scanning') {
      await this.manager.stopDeviceScan();
    }
    if (this.status === 'scanning') {
      runInAction(() => {
        this.status = 'idle';
      });
    }
  }

  async connect(deviceId: string): Promise<void> {
    // Drop any automatic recovery loop; manual pairing takes over.
    this.stopReconnect();
    this.stopEmulator();
    const manager = this.ensureManager();
    if (this.status === 'connecting' || this.status === 'connected') return;

    await this.stopScan();
    runInAction(() => {
      this.status = 'connecting';
      this.errorMessage = null;
      this.liveBpm = null;
      this.deviceName = null;
    });

    let device: Pick<BleDevice, 'id' | 'name'> | null;
    try {
      device = await manager.connectToDevice(deviceId, {
        timeout: CONNECT_TIMEOUT_MS,
      });
      await manager.discoverAllServicesAndCharacteristicsForDevice(deviceId);
    } catch (error) {
      runInAction(() => {
        this.status = 'error';
        this.errorMessage =
          error instanceof Error ? error.message : 'Could not connect.';
      });
      return;
    }

    let hrsFound: boolean;
    try {
      const services = await manager.servicesForDevice(deviceId);
      hrsFound = services.some(
        (s) => s.uuid.toLowerCase() === HRS_FULL_UUID,
      );
    } catch {
      // Trust the scan-time ad evidence rather than blocking the session.
      hrsFound = true;
    }

    if (!hrsFound) {
      try {
        await manager.cancelDeviceConnection(deviceId);
      } catch {
        /* ignore */
      }
      runInAction(() => {
        this.status = 'error';
        this.errorMessage = 'This device does not expose a heart-rate service.';
      });
      return;
    }

    // Remember so a mid-session drop can auto-recover to this strap.
    this.rememberedDeviceId = deviceId;
    this.rememberedDeviceName = device?.name ?? deviceId;
    await this.openSubscriptionsAndFinish(deviceId, device?.name ?? deviceId);
  }

  async disconnect(): Promise<void> {
    this.stopReconnect();
    if (this.emulatorActive) {
      this.stopEmulator();
      return;
    }
    this.stopSampling();
    this.monitorSub?.remove();
    this.monitorSub = null;
    this.disconnectSub?.remove();
    this.disconnectSub = null;
    this.latestBpm = null;
    // Manual disconnect intentionally forgets the strap so nothing
    // auto-reconnects behind the user's back.
    this.rememberedDeviceId = null;
    this.rememberedDeviceName = null;

    const id = this.connectedDeviceId;
    this.connectedDeviceId = null;
    if (this.manager !== null && id !== null) {
      try {
        await this.manager.cancelDeviceConnection(id);
      } catch {
        /* already gone */
      }
    }

    runInAction(() => {
      this.status = 'idle';
      this.deviceName = null;
      this.liveBpm = null;
    });
  }

  /** Stop an automatic recovery attempt so the strap is not re-paired. */
  cancelReconnect(): void {
    this.stopReconnect();
    this.rememberedDeviceId = null;
    this.rememberedDeviceName = null;
    runInAction(() => {
      if (this.status === 'reconnecting') {
        this.status = 'idle';
        this.deviceName = null;
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Emulator: a synthetic strap for testing the UI and session recording
  // without hardware. Emits a varying 1 Hz reading through the same liveBpm
  // path as a real device so charts, zones and sampling all exercise normally.
  // ---------------------------------------------------------------------------

  /** True while the simulator is feeding readings. */
  get emulating(): boolean {
    return this.emulatorActive;
  }

  /** Swap a real strap for the synthetic simulator without leaving the workout. */
  switchToEmulator(): void {
    if (this.emulatorActive) return;
    this.disconnect();
    this.startEmulator();
  }

  /** Drop the synthetic simulator and start scanning for a real monitor. */
  switchToScan(): void {
    if (!this.emulatorActive) return;
    this.stopEmulator();
    void this.startScan();
  }

  startEmulator(): void {
    // Taking over from Bluetooth — drop any auto-recovery or scan.
    this.stopReconnect();
    this.stopSampling();
    this.stopEmulator();
    this.monitorSub?.remove();
    this.monitorSub = null;
    this.disconnectSub?.remove();
    this.disconnectSub = null;
    this.latestBpm = 72;
    this.emulatorTick = 0;
    runInAction(() => {
      this.emulatorActive = true;
      this.status = 'connected';
      this.connectedDeviceId = 'simulated-strap';
      this.deviceName = 'Simulated strap';
      this.errorMessage = null;
      this.liveBpm = 72;
    });
    this.maybeStartSampling();
  }

  stopEmulator(): void {
    if (!this.emulatorActive) return;
    this.stopSampling();
    this.latestBpm = null;
    this.connectedDeviceId = null;
    runInAction(() => {
      this.emulatorActive = false;
      this.status = 'idle';
      this.deviceName = null;
      this.liveBpm = null;
    });
  }

  /** Feed the next synthetic reading. Series drifts up and waves across zones. */
  private stepEmulator(): void {
    const t = ++this.emulatorTick;
    const trend = 96 + 0.005 * t + 24 * Math.sin(t / 300) + 18 * Math.sin(t / 90);
    const wiggle = 14 * Math.sin(t / 6) + 10 * Math.sin(t / 2.3);
    const noise = 4 * Math.sin(t * 0.7) + 3 * Math.cos(t * 1.13);
    const bpm = Math.round(Math.min(196, Math.max(54, trend + wiggle + noise)));
    this.latestBpm = bpm;
    runInAction(() => {
      this.liveBpm = bpm;
    });
  }

  dispose(): void {
    this.stopReconnect();
    this.stopSampling();
    this.stopEmulator();
    this.monitorSub?.remove();
    this.disconnectSub?.remove();
    if (this.manager !== null && this.status === 'scanning') {
      this.manager.stopDeviceScan().catch(() => undefined);
    }
    void this.disconnect();
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private ensureManager(): BleManager {
    if (this.manager === null) {
      this.manager = new (loadBlePlx().BleManager)();
    }
    return this.manager;
  }

  private maybeStartSampling(): void {
    this.refreshTickSubscription();
  }

  private stopSampling(): void {
    this.refreshTickSubscription();
  }

  /** Subscribe to the 1 s workout clock only while samples are wanted. */
  private refreshTickSubscription(): void {
    const wantTicks =
      this.emulatorActive || (this.workoutActive && this.connected);
    if (wantTicks && this.tickUnsub === null) {
      this.tickUnsub = onWorkoutTick(() => this.onWorkoutTick());
    } else if (!wantTicks && this.tickUnsub !== null) {
      this.tickUnsub();
      this.tickUnsub = null;
      this.tickCount = 0;
    }
  }

  /**
   * Fires once a second while subscribed. Steps the emulator (when active) and
   * buffers a downsampled reading every 5 ticks so a minimized workout keeps
   * recording — the tick source is the native service clock, which is the only
   * thing Android keeps pumping in the background.
   */
  private onWorkoutTick(): void {
    if (this.emulatorActive) {
      this.stepEmulator();
    }
    if (!this.workoutActive || this.latestBpm === null) return;
    this.tickCount += 1;
    if (this.tickCount % SAMPLE_EVERY_TICKS === 0) {
      this.recordSample();
    }
  }

  private recordSample(): void {
    if (!this.workoutActive || this.latestBpm === null) return;
    this.sampleBuffer = [
      ...this.sampleBuffer,
      { recordedAt: Date.now(), bpm: this.latestBpm },
    ];
  }

  private onHeartRateReading(
    error: { message: string } | null,
    value: string | null,
  ): void {
    if (error !== null) {
      runInAction(() => {
        this.status = 'error';
        this.errorMessage = error.message;
      });
      return;
    }
    if (value === null) return;

    let bpm: number | null = null;
    try {
      bpm = parseHeartRateMeasurement(base64ToBytes(value)).bpm;
    } catch {
      bpm = null;
    }
    if (bpm === null) return;

    // Straps occasionally broadcast garbage (a 25376 bpm reading was enough to
    // wreck a run's averages and calories). Drop implausible readings at the
    // door: keep the last good value so the rest of the pipeline stays clean.
    if (!isPlausibleBpm(bpm)) return;

    this.latestBpm = bpm;
    runInAction(() => {
      this.liveBpm = bpm;
    });
  }

  private onDeviceDisconnected(reason: string): void {
    this.stopSampling();
    this.monitorSub?.remove();
    this.monitorSub = null;
    this.disconnectSub?.remove();
    this.disconnectSub = null;
    this.latestBpm = null;
    this.connectedDeviceId = null;
    const willReconnect = this.workoutActive && this.rememberedDeviceId !== null;
    runInAction(() => {
      this.liveBpm = null;
      if (willReconnect) {
        this.status = 'reconnecting';
        this.errorMessage = null;
      } else {
        this.status = 'idle';
        this.deviceName = null;
      }
      void reason; // keep the reason string as documentation
    });
    if (willReconnect) {
      this.startReconnect();
    }
  }

  // ---------------------------------------------------------------------------
  // Reconnect: while a workout is open, keep trying to recover a lost strap so
  // the session does not silently go bpm-less. Scans in bounded rounds with a
  // back-off, and stops the moment the session ends or the user takes over.
  // ---------------------------------------------------------------------------

  private startReconnect(): void {
    if (!this.workoutActive || this.rememberedDeviceId === null) return;
    this.stopReconnect();
    const gen = ++this.reconnectGen;
    runInAction(() => {
      this.status = 'reconnecting';
      this.errorMessage = null;
      if (this.deviceName === null) {
        this.deviceName = this.rememberedDeviceName;
      }
    });
    this.reconnectRound = 0;
    this.scheduleReconnectRound(gen);
  }

  private scheduleReconnectRound(gen: number): void {
    if (gen !== this.reconnectGen || !this.workoutActive) return;
    const delay = Math.min(
      RECONNECT_INITIAL_DELAY_MS * 2 ** this.reconnectRound,
      RECONNECT_DELAY_CAP_MS,
    );
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.scanForDevice(gen);
    }, delay);
  }

  private scanForDevice(gen: number): void {
    if (gen !== this.reconnectGen || !this.workoutActive) return;
    const targetId = this.rememberedDeviceId;
    if (targetId === null) return;
    const manager = this.ensureManager();
    this.reconnectScanning = true;

    const stopRound = (): void => {
      if (!this.reconnectScanning) return;
      this.reconnectScanning = false;
      manager.stopDeviceScan().catch(() => undefined);
    };

    const roundTimeout = setTimeout(() => {
      stopRound();
      this.reconnectRound += 1;
      this.scheduleReconnectRound(gen);
    }, RECONNECT_SCAN_ROUND_MS);

    try {
      manager.startDeviceScan([HRS_FULL_UUID], null, (error, device) => {
        if (gen !== this.reconnectGen || !this.workoutActive) return;
        if (error !== null) return; // BLE can flap; the round just runs out.
        if (device === null || device.id !== targetId) return;
        clearTimeout(roundTimeout);
        stopRound();
        void this.reconnectToDevice(gen, device.name);
      });
    } catch {
      clearTimeout(roundTimeout);
      stopRound();
      this.reconnectRound += 1;
      this.scheduleReconnectRound(gen);
    }
  }

  private async reconnectToDevice(gen: number, name: string | null): Promise<void> {
    const targetId = this.rememberedDeviceId;
    if (targetId === null) return;
    const manager = this.ensureManager();
    try {
      await manager.connectToDevice(targetId, { timeout: CONNECT_TIMEOUT_MS });
      await manager.discoverAllServicesAndCharacteristicsForDevice(targetId);
      // The session may have ended (or the user re-paired manually) while we
      // were connecting. Do not leave a zombie subscription behind — but only
      // tear our own connection down, never one a manual attempt now owns.
      if (gen !== this.reconnectGen || !this.workoutActive) {
        if (this.connectedDeviceId !== targetId) {
          await manager.cancelDeviceConnection(targetId).catch(() => undefined);
        }
        return;
      }
      await this.openSubscriptionsAndFinish(targetId, name ?? targetId);
    } catch {
      if (gen === this.reconnectGen && this.workoutActive) {
        this.reconnectRound += 1;
        this.scheduleReconnectRound(gen);
      }
    }
  }

  private async openSubscriptionsAndFinish(
    deviceId: string,
    name: string,
  ): Promise<void> {
    if (this.manager === null) return;
    this.connectedDeviceId = deviceId;
    try {
      this.monitorSub = this.manager.monitorCharacteristicForDevice(
        deviceId,
        HRS_FULL_UUID,
        HRM_FULL_UUID,
        (error, characteristic) =>
          this.onHeartRateReading(error, characteristic?.value ?? null),
      );
      this.disconnectSub = this.manager.onDeviceDisconnected(deviceId, (error) => {
        this.onDeviceDisconnected(error?.message ?? 'Device disconnected.');
      });
    } catch (error) {
      runInAction(() => {
        this.status = 'error';
        this.errorMessage =
          error instanceof Error ? error.message : 'Could not subscribe.';
      });
      return;
    }

    this.rememberedDeviceId = deviceId;
    this.rememberedDeviceName = name;
    runInAction(() => {
      this.status = 'connected';
      this.deviceName = name;
    });
    this.maybeStartSampling();
  }

  private stopReconnect(): void {
    this.reconnectGen += 1;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.reconnectScanning) {
      this.reconnectScanning = false;
      this.manager?.stopDeviceScan().catch(() => undefined);
    }
  }

  private async failScan(message: string): Promise<void> {
    if (this.manager !== null) {
      try {
        await this.manager.stopDeviceScan();
      } catch {
        /* already stopped */
      }
    }
    runInAction(() => {
      this.status = 'error';
      this.errorMessage = message;
    });
  }
}