import { registerRootComponent } from 'expo';
import { AppRegistry } from 'react-native';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);

// Keep-alive for background JS timers. React Native pauses all JS timers when the
// Activity pauses (JavaTimerManager.onHostPause); an active headless task is the
// supported way to prevent that, so the rest chime and live HR sampling keep
// running while a workout is minimized. WorkoutKeepAliveModule starts this task
// whenever a workout is open and finishes it when the workout ends. The promise
// intentionally never resolves — the task is cancelled via finishTask().
AppRegistry.registerHeadlessTask(
  'WorkoutKeepAlive',
  () => () => new Promise<void>(() => {}),
);
