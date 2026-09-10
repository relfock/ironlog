package com.ironlog.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat

/**
 * Keeps the app's JS runtime alive while a workout is in progress, so the
 * rest-timer chime, the live HR emulator/sampling and the cardio stopwatch all
 * keep running when the user leaves the app. The notification is deliberately
 * silent and low-priority — its only job is to keep the process foreground.
 *
 * JS timers are kept alive by [MainActivity.onUserLeaveHint], which calls
 * [ReactInstanceManager.onHostResume] after each activity pause so the
 * choreographer frame callback is reposted and [JavaTimerManager] keeps firing
 * timers in the background.
 */
class WorkoutForegroundService : Service() {

  override fun onCreate() {
    super.onCreate()
    Log.d(TAG, "onCreate")
    createChannel()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    Log.d(TAG, "onStartCommand startId=$startId label=${intent?.getStringExtra(EXTRA_LABEL)} flags=$flags")
    val notification = buildNotification(intent?.getStringExtra(EXTRA_LABEL))
    ServiceCompat.startForeground(
      this,
      NOTIFICATION_ID,
      notification,
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
      } else {
        0
      },
    )
    Log.d(TAG, "startForeground posted (id=$NOTIFICATION_ID)")
    return START_NOT_STICKY
  }

  override fun onDestroy() {
    Log.d(TAG, "onDestroy")
    super.onDestroy()
  }

  override fun onBind(intent: Intent?): IBinder? = null

  private fun createChannel() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      val channel = NotificationChannel(
        CHANNEL_ID,
        "Workout in progress",
        NotificationManager.IMPORTANCE_LOW,
      ).apply {
        description = "Keeps your workout running while you use other apps"
        setShowBadge(false)
      }
      manager.createNotificationChannel(channel)
    }
  }

  private fun buildNotification(label: String?): Notification {
    val openIntent = packageManager.getLaunchIntentForPackage(packageName)
    val contentIntent = openIntent?.let {
      PendingIntent.getActivity(
        this,
        0,
        it,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )
    }
    val text =
      if (!label.isNullOrBlank()) {
        "$label — your workout keeps running while you use other apps."
      } else {
        "Your workout keeps running while you use other apps."
      }
    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle("Workout active")
      .setContentText(text)
      .setSmallIcon(R.mipmap.ic_launcher)
      .setContentIntent(contentIntent)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setSilent(true)
      .build()
  }

  companion object {
    const val EXTRA_LABEL = "workoutLabel"
    private const val CHANNEL_ID = "ironlog-workout-active"
    private const val NOTIFICATION_ID = 20261
    private const val TAG = "WorkoutKeepAlive"
  }
}