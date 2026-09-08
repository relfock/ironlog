/**
 * OS-scheduled "rest done" alert.
 *
 * The in-app chime in TimerStore only runs while JS is alive, so a rest that
 * ends while the phone is locked or the app is backgrounded would be silent.
 * A scheduled local notification hands the alert to the platform scheduler
 * (AlarmManager on Android, UNUserNotificationCenter on iOS) which fires it
 * on time even with the app suspended.
 *
 * While the app IS foregrounded the handler below mutes the OS bubble and
 * sound — TimerStore play its own chime — so the two never double up.
 */
import * as Notifications from 'expo-notifications';

export const REST_TIMER_CHANNEL_ID = 'rest-timer-sound-v2';
const REST_TIMER_NOTIFICATION_ID = 'ironlog-rest-done';
const REST_TIMER_TITLE = "Time's up";
const REST_TIMER_BODY = 'Your next set is ready.';
/**
 * Basename of the bundled `res/raw` chime (see plugins/withNotificationSound.js).
 * Passed both to the channel and to the notification body so playback is
 * governed by the explicit sound on the channel that owns this notification.
 */
const SOUND_RESOURCE = 'rest_ding.wav';

let channelReady: Promise<void> | null = null;

/**
 * Create the Android 8+ channel once. The sound is the explicit raw resource
 * (see plugins/withNotificationSound.js): the system default is conspicuously
 * muted on many phones and cannot be relied on. The channel id is suffixed
 * because Android caches a channel's sound the first time it is created and
 * refuses to change it later — bump the suffix whenever the sound policy
 * changes.
 */
function ensureChannel(): Promise<void> {
  if (channelReady !== null) return channelReady;
  channelReady = (async () => {
    try {
      await Notifications.setNotificationChannelAsync(REST_TIMER_CHANNEL_ID, {
        name: 'Rest timer',
        importance: Notifications.AndroidImportance.HIGH,
        sound: SOUND_RESOURCE,
        vibrationPattern: [0, 250, 250, 250],
      });
    } catch {
      // Channels are Android-only; a no-op here just leaves default behaviour.
    }
  })();
  return channelReady;
}

/** Best-effort: never block the in-app chime on a permission dialog. */
let permissionAsked = false;
async function ensurePermission(): Promise<void> {
  if (permissionAsked) return;
  permissionAsked = true;
  try {
    const current = await Notifications.getPermissionsAsync();
    if (!current.granted && current.canAskAgain) {
      await Notifications.requestPermissionsAsync();
    }
  } catch {
    // The rest chime works regardless; only the background alert is lost.
  }
}

/**
 * Register the notification handler. Call once during app bootstrap, before
 * any rest timer can fire. The OS only consults this handler while the app is
 * in the foreground; in the background it presents the notification directly.
 */
export function configureRestNotifications(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: false,
      shouldShowList: false,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

/**
 * Schedule the background alert for `fireAtMs`, replacing any previously
 * scheduled rest alert.
 */
export async function scheduleRestDoneNotif(fireAtMs: number): Promise<void> {
  try {
    await ensurePermission();
    await ensureChannel();
    await Notifications.cancelScheduledNotificationAsync(REST_TIMER_NOTIFICATION_ID);
    await Notifications.scheduleNotificationAsync({
      identifier: REST_TIMER_NOTIFICATION_ID,
      content: {
        title: REST_TIMER_TITLE,
        body: REST_TIMER_BODY,
        sound: SOUND_RESOURCE,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: new Date(fireAtMs),
        channelId: REST_TIMER_CHANNEL_ID,
      },
    });
  } catch {
    // The in-app chime still fires; a silent background rest is acceptable.
  }
}

/** Cancel the pending background alert, e.g. when the rest timer is paused. */
export async function cancelRestDoneNotif(): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(REST_TIMER_NOTIFICATION_ID);
  } catch {
    // Nothing pending is fine.
  }
}