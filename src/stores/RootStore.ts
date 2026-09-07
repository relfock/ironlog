import React, { createContext, useContext } from 'react';
import { ActiveWorkoutStore } from './ActiveWorkoutStore';
import { HeartRateStore } from './HeartRateStore';
import { SettingsStore } from './SettingsStore';
import { TimerStore } from './TimerStore';

/**
 * Ephemeral session state only. Anything persisted is read through Drizzle's
 * `useLiveQuery` at the point of use, so there is no second copy of the
 * database to keep in sync.
 */
export class RootStore {
  readonly settings = new SettingsStore();
  readonly timer = new TimerStore();
  readonly heartRate = new HeartRateStore(this.settings);
  readonly activeWorkout: ActiveWorkoutStore;

  constructor() {
    this.activeWorkout = new ActiveWorkoutStore(
      this.settings,
      this.timer,
      this.heartRate,
    );
  }

  async initialise(): Promise<void> {
    await this.settings.load();
    this.timer.start();
    // Recover a session the user was mid-way through when the app died.
    await this.activeWorkout.resume();
  }

  dispose(): void {
    this.timer.stop();
    this.heartRate.dispose();
  }
}

export const rootStore = new RootStore();

const StoreContext = createContext<RootStore>(rootStore);

export function StoreProvider({
  children,
  store = rootStore,
}: {
  children: React.ReactNode;
  store?: RootStore;
}) {
  return React.createElement(StoreContext.Provider, { value: store }, children);
}

export function useStores(): RootStore {
  return useContext(StoreContext);
}

export function useSettings(): SettingsStore {
  return useContext(StoreContext).settings;
}

export function useTimer(): TimerStore {
  return useContext(StoreContext).timer;
}

export function useActiveWorkout(): ActiveWorkoutStore {
  return useContext(StoreContext).activeWorkout;
}

export function useHeartRate(): HeartRateStore {
  return useContext(StoreContext).heartRate;
}
