/**
 * BLE heart-rate monitor bridge.
 *
 * Connects to the standard Bluetooth SIG Heart Rate service (0x180D) that
 * Whoop 4.0 broadcasts in "Broadcast HR" mode (and Polar / Wahoo / others
 * expose natively), subscribes to Heart Rate Measurement (0x2A37), and buffers
 * a downsampled reading every 5 s while a workout is open.
 *
 * The native module is loaded lazily through `require` so importing this store
 * never touches the TurboModule — jest stays green and non-android hosts are
 * no-ops. Writing samples to SQLite happens in ActiveWorkoutStore.finish();
 * this store only ever buffers.
 */
import { makeAutoObservable, runInAction } from 'mobx';
import { Platform } from 'react-native';
import { parseHeartRateMeasurement } from '@/domain/heartRate';
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

/** Whoop broadcasts ~1 reading/s; persist every 5 s to keep rows sane. */
const SAMPLE_INTERVAL_MS = 5000;
const CONNECT_TIMEOUT_MS = 15000;

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
  private sampleTimer: ReturnType<typeof setInterval> | null = null;
  private latestBpm: number | null = null;
  private sampleBuffer: HeartRateSample[] = [];
  private workoutActive = false;
  private connectedDeviceId: string | null = null;

  constructor(private readonly settings: SettingsStore) {
    makeAutoObservable<
      HeartRateStore,
      | 'manager'
      | 'monitorSub'
      | 'disconnectSub'
      | 'sampleTimer'
      | 'latestBpm'
      | 'sampleBuffer'
      | 'workoutActive'
      | 'connectedDeviceId'
    >(
      this,
      {
        manager: false,
        monitorSub: false,
        disconnectSub: false,
        sampleTimer: false,
        latestBpm: false,
        sampleBuffer: false,
        workoutActive: false,
        connectedDeviceId: false,
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

  get bufferSize(): number {
    return this.sampleBuffer.length;
  }

  /** @internal Snapshot + clear; called by ActiveWorkoutStore.finish(). */
  detachWorkout(): HeartRateSample[] {
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
  }

  async startScan(): Promise<void> {
    if (!this.supported) return;
    if (this.status === 'scanning') return;

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
    const manager = this.ensureManager();
    if (this.status === 'connecting' || this.status === 'connected') return;

    await this.stopScan();
    runInAction(() => {
      this.status = 'connecting';
      this.errorMessage = null;
      this.liveBpm = null;
      this.deviceName = null;
    });

    let device: Pick<BleDevice, 'id' | 'name'> | null = null;
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

    this.connectedDeviceId = deviceId;
    try {
      this.monitorSub = manager.monitorCharacteristicForDevice(
        deviceId,
        HRS_FULL_UUID,
        HRM_FULL_UUID,
        (error, characteristic) =>
          this.onHeartRateReading(error, characteristic?.value ?? null),
      );
      this.disconnectSub = manager.onDeviceDisconnected(deviceId, (error) => {
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

    runInAction(() => {
      this.status = 'connected';
      this.deviceName = device?.name ?? deviceId;
    });
    this.maybeStartSampling();
  }

  async disconnect(): Promise<void> {
    this.stopSampling();
    this.monitorSub?.remove();
    this.monitorSub = null;
    this.disconnectSub?.remove();
    this.disconnectSub = null;
    this.latestBpm = null;

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
      this.liveBpm = null;
    });
  }

  dispose(): void {
    this.stopSampling();
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
    if (this.workoutActive && this.connected && this.sampleTimer === null) {
      this.sampleTimer = setInterval(
        () => this.recordSample(),
        SAMPLE_INTERVAL_MS,
      );
    }
  }

  private stopSampling(): void {
    if (this.sampleTimer !== null) {
      clearInterval(this.sampleTimer);
      this.sampleTimer = null;
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
    runInAction(() => {
      this.status = 'idle';
      this.liveBpm = null;
      void reason; // keep the reason string as documentation
    });
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