package expo.modules.zyrunliveupdate

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.app.NotificationManager
import android.util.Log

/** Marks a device reboot so JS can reject and clear any pre-reboot workout checkpoint. */
class BootRestoreReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != Intent.ACTION_BOOT_COMPLETED) return

    Log.i(TAG, "[BootRestore] DEVICE_BOOT_DETECTED")
    context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)
      .edit()
      .putBoolean(KEY_BOOT_RESTORE_PENDING, true)
      .commit()

    context.stopService(Intent().setClassName(
      context,
      "expo.modules.location.services.LocationTaskService",
    ))
    Log.i(TAG, "[ServiceLifecycle] BOOT_RESTART_BLOCKED")

    val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
    notificationManager?.let { manager ->
      manager.activeNotifications
        .filter { statusBarNotification ->
          val notification = statusBarNotification.notification
          val title = notification.extras?.getCharSequence("android.title")?.toString().orEmpty()
          val body = notification.extras?.getCharSequence("android.text")?.toString().orEmpty()
          val isNativeRunNotification = notification.extras?.getBoolean(EXTRA_ZYRUN_LIVE_UPDATE, false) == true
          val isExpoRunNotification = title.contains("Live workout", ignoreCase = true)
            || title.contains("Tracking Live", ignoreCase = true)
            || (title.contains("ZYRun", ignoreCase = true)
              && (title.contains("Running", ignoreCase = true)
                || title.contains("Paused", ignoreCase = true)))
            || body.contains("Tracking Live", ignoreCase = true)
          isNativeRunNotification || isExpoRunNotification
        }
        .forEach { manager.cancel(it.tag, it.id) }
      manager.cancel(LIVE_NOTIFICATION_ID)
    }
    context.getSharedPreferences(NOTIFICATION_PREFERENCES_NAME, Context.MODE_PRIVATE)
      .edit()
      .remove(NOTIFICATION_ID_KEY)
      .remove(NOTIFICATION_TAG_KEY)
      .apply()
    Log.i(TAG, "[NotificationLifecycle] LIVE_NOTIFICATION_CANCELLED")
  }

  companion object {
    const val PREFERENCES_NAME = "zyrun_boot_restore"
    const val KEY_BOOT_RESTORE_PENDING = "boot_restore_pending"
    private const val TAG = "ZYRunBootRestore"
    private const val LIVE_NOTIFICATION_ID = 1001
    private const val EXTRA_ZYRUN_LIVE_UPDATE = "com.zyapp.extra.ZYRUN_LIVE_UPDATE"
    private const val NOTIFICATION_PREFERENCES_NAME = "zyrun_live_update"
    private const val NOTIFICATION_ID_KEY = "expo_location_notification_id"
    private const val NOTIFICATION_TAG_KEY = "expo_location_notification_tag"
  }
}
