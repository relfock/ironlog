/**
 * Android runtime permissions for BLE.
 *
 * Manifest side is handled by the react-native-ble-plx Expo config plugin
 * (`BLUETOOTH` / `BLUETOOTH_ADMIN` / `BLUETOOTH_CONNECT` / `BLUETOOTH_SCAN`,
 * plus location kept at API <= 30 because we scan with neverForLocation).
 *
 * API 31+ (Android 12): runtime BLUETOOTH_SCAN + BLUETOOTH_CONNECT.
 * API 26–30: Bluetooth is a normal permission; nearby scanning needs
 * location, which the manifest bounds to maxSdkVersion 30.
 */
import { PermissionsAndroid, Platform } from 'react-native';

export async function requestBlePermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;

  const api = Number(Platform.Version) || 0;
  if (api >= 31) {
    const results = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
    ]);
    return (
      results[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] === 'granted' &&
      results[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] === 'granted'
    );
  }

  const result = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
  );
  return result === 'granted';
}