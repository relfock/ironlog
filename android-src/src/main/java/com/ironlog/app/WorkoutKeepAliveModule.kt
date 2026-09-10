package com.ironlog.app

import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.facebook.react.jstasks.HeadlessJsTaskConfig
import com.facebook.react.jstasks.HeadlessJsTaskContext

/**
 * JS bridge to keep a live workout recording while the app is minimized:
 *  - a foreground service keeps the OS from freezing the process, and
 *  - a main-thread ticker emits a `WorkoutKeepAliveTick` native event every
 *    second. The headless task + ticker exist because RN dispatches JS
 *    `setInterval`s from a Choreographer frame callback, and Android stops
 *    handing vsync (so every JS timer) to a non-visible app. The tick loop runs
 *    on the main looper, which Android keeps pumping for foreground-service
 *    processes, and its events are processed by the still-live JS thread — so
 *    the JS HR sampling/cardio logic runs on this clock instead of JS timers.
 */
class WorkoutKeepAliveModule(
  reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {

  private var running = false
  private var keepAliveTaskId = -1
  private val handler = Handler(Looper.getMainLooper())

  override fun getName(): String = "WorkoutKeepAlive"

  @ReactMethod
  fun start(label: String) {
    Log.d(TAG, "start(label=\"$label\") running=$running")
    if (running) return
    // Defer a beat so the call never lands before the app is in the foreground —
    // Android 12+ rejects foreground services started from the background.
    handler.post {
      runCatching {
        val context = reactApplicationContext
        val intent = Intent(context, WorkoutForegroundService::class.java)
          .putExtra(WorkoutForegroundService.EXTRA_LABEL, label)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          context.startForegroundService(intent)
        } else {
          context.startService(intent)
        }
        startKeepAliveTask()
        startTickLoop()
        running = true
        Log.d(TAG, "startForegroundService() + headless task launched, running=true")
      }.onFailure {
        Log.e(TAG, "startForegroundService() failed", it)
      }
    }
  }

  @ReactMethod
  fun stop() {
    Log.d(TAG, "stop() running=$running")
    handler.post {
      if (!running) {
        Log.d(TAG, "stop(): not running, ignoring")
        return@post
      }
      runCatching {
        reactApplicationContext.stopService(
          Intent(reactApplicationContext, WorkoutForegroundService::class.java),
        )
        stopKeepAliveTask()
        stopTickLoop()
        Log.d(TAG, "stopService() + headless task finished, running=false")
      }.onFailure {
        Log.e(TAG, "stopService() failed", it)
      }
      running = false
    }
  }

  @ReactMethod
  fun log(msg: String) {
    Log.d(TAG, "[js] $msg")
  }

  /** Starts the infinite headless JS task and a native main-thread ticker. */
  private fun startTickLoop() {
    if (nativeTickTask != null) return
    nativeTickTask = Runnable {
      emitKeepAliveTick()
      handler.postDelayed(nativeTickTask!!, TICK_INTERVAL_MS)
    }
    handler.postDelayed(nativeTickTask!!, TICK_INTERVAL_MS)
  }

  private fun stopTickLoop() {
    val task = nativeTickTask ?: return
    nativeTickTask = null
    handler.removeCallbacks(task)
  }

  private var nativeTickTask: Runnable? = null

  /** Emits the 1 s clock event the JS side records heart-rate samples on. */
  private fun emitKeepAliveTick() {
    try {
      reactApplicationContext
        .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        .emit(EVENT_KEEPALIVE_TICK, null)
    } catch (e: Exception) {
      Log.w(TAG, "emitKeepAliveTick failed", e)
    }
  }

  private fun startKeepAliveTask() {
    if (keepAliveTaskId >= 0) return
    keepAliveTaskId =
      HeadlessJsTaskContext
        .getInstance(reactApplicationContext)
        .startTask(
          HeadlessJsTaskConfig(
            TASK_KEY,
            Arguments.createMap(),
            0L,
            true,
          ),
        )
    Log.d(TAG, "headless keep-alive task started id=$keepAliveTaskId")
  }

  private fun stopKeepAliveTask() {
    if (keepAliveTaskId < 0) return
    HeadlessJsTaskContext
      .getInstance(reactApplicationContext)
      .finishTask(keepAliveTaskId)
    keepAliveTaskId = -1
  }

  companion object {
    private const val TAG = "WorkoutKeepAlive"
    private const val TASK_KEY = "WorkoutKeepAlive"
    private const val TICK_INTERVAL_MS = 1_000L
    private const val EVENT_KEEPALIVE_TICK = "WorkoutKeepAliveTick"
  }
}