package expo.modules.zyrunliveupdate

import android.app.Notification
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.drawable.Icon
import android.net.Uri
import android.os.Bundle
import android.os.Build
import android.service.notification.StatusBarNotification
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.Locale
import kotlin.math.floor

class ZYRunLiveUpdateModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ZYRunLiveUpdate")

    Function("updateNotification") { data: Map<String, Any?> ->
      val context = appContext.reactContext?.applicationContext ?: return@Function false
      updateForegroundNotification(context, data)
    }
  }

  private fun updateForegroundNotification(context: Context, data: Map<String, Any?>): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return false

    val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
      ?: return false
    val activeNotification = findLocationForegroundNotification(context, notificationManager) ?: return false
    val runId = data["runId"] as? String
    val status = if (data["status"] == "paused") "paused" else "running"
    val distanceKm = (data["distanceKm"] as? Number)?.toDouble()?.coerceAtLeast(0.0) ?: 0.0
    val elapsedSeconds = (data["elapsedSeconds"] as? Number)?.toDouble()?.coerceAtLeast(0.0) ?: 0.0
    val paceMinutesPerKm = (data["paceMinutesPerKm"] as? Number)?.toDouble() ?: 0.0
    val startedAtMs = (data["startedAtMs"] as? Number)?.toLong() ?: System.currentTimeMillis()

    val title = if (status == "paused") "ZYRun · Paused" else "ZYRun · Running"
    val text = "${formatDuration(elapsedSeconds)} · ${String.format(Locale.US, "%.2f", distanceKm)} km · ${formatPace(paceMinutesPerKm)}/km"
    val launchIntent = createRunIntent(context, runId, null) ?: return false
    val builder = Notification.Builder.recoverBuilder(context, activeNotification.notification)
      .setContentTitle(title)
      .setContentText(text)
      .setContentIntent(pendingActivity(context, launchIntent, 1001))
      .setCategory(if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) Notification.CATEGORY_WORKOUT else Notification.CATEGORY_SERVICE)
      .setVisibility(Notification.VISIBILITY_PUBLIC)
      .setColorized(false)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setShowWhen(false)
      .setWhen(startedAtMs)
      .setActions(*buildActions(context, runId, status))
      .addExtras(Bundle().apply {
        putBoolean(EXTRA_ZYRUN_LIVE_UPDATE, true)
      })

    if (Build.VERSION.SDK_INT >= 36) {
      builder
        .setShortCriticalText(formatDistanceChip(distanceKm))
        .addExtras(Bundle().apply {
          putBoolean("android.requestPromotedOngoing", true)
        })
      if (status == "running") {
        builder.setStyle(Notification.ProgressStyle().setProgressIndeterminate(true))
      } else {
        builder.setStyle(null)
      }
    }

    notificationManager.notify(activeNotification.tag, activeNotification.id, builder.build())
    return true
  }

  private fun findLocationForegroundNotification(
    context: Context,
    notificationManager: NotificationManager,
  ): StatusBarNotification? {
    val preferences = context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)
    val storedId = preferences.getInt(KEY_NOTIFICATION_ID, INVALID_NOTIFICATION_ID)
    val storedTag = preferences.getString(KEY_NOTIFICATION_TAG, null)
    val active = notificationManager.activeNotifications

    if (storedId != INVALID_NOTIFICATION_ID) {
      active.firstOrNull { it.id == storedId && it.tag == storedTag && it.isRunForegroundNotification() }
        ?.let { return it }
      preferences.edit()
        .remove(KEY_NOTIFICATION_ID)
        .remove(KEY_NOTIFICATION_TAG)
        .apply()
    }

    val candidate = active.firstOrNull {
      it.isLocationForegroundNotification()
        && it.notification.extras?.getCharSequence(Notification.EXTRA_TITLE)?.toString() == LOCATION_NOTIFICATION_TITLE
    } ?: return null

    preferences.edit()
      .putInt(KEY_NOTIFICATION_ID, candidate.id)
      .putString(KEY_NOTIFICATION_TAG, candidate.tag)
      .apply()
    return candidate
  }

  private fun StatusBarNotification.isLocationForegroundNotification(): Boolean =
    (notification.flags and Notification.FLAG_FOREGROUND_SERVICE) != 0
      && notification.category == Notification.CATEGORY_SERVICE

  private fun StatusBarNotification.isRunForegroundNotification(): Boolean =
    (notification.flags and Notification.FLAG_FOREGROUND_SERVICE) != 0
      && (notification.category == Notification.CATEGORY_SERVICE
        || notification.extras?.getBoolean(EXTRA_ZYRUN_LIVE_UPDATE, false) == true)

  private fun buildActions(context: Context, runId: String?, status: String): Array<Notification.Action> {
    val action = if (status == "paused") "zyrun-resume" else "zyrun-pause"
    val label = if (status == "paused") "Resume" else "Pause"
    val icon = Icon.createWithResource(context, context.applicationInfo.icon)
    val toggleIntent = createRunIntent(context, runId, action)
      ?.let { pendingActivity(context, it, 1002) }
    val finishIntent = createRunIntent(context, runId, "zyrun-stop")
      ?.let { pendingActivity(context, it, 1003) }

    return listOfNotNull(
      toggleIntent?.let { Notification.Action.Builder(icon, label, it).build() },
      finishIntent?.let { Notification.Action.Builder(icon, "Finish", it).build() },
    ).toTypedArray()
  }

  private fun createRunIntent(context: Context, runId: String?, action: String?): Intent? {
    val launchIntent = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return null
    val uri = Uri.parse("${context.packageName}:///screens/map")
      .buildUpon()
      .apply {
        if (!runId.isNullOrBlank()) appendQueryParameter("runId", runId)
        if (!action.isNullOrBlank()) appendQueryParameter("notificationAction", action)
        if (!action.isNullOrBlank()) appendQueryParameter("actionNonce", System.currentTimeMillis().toString())
      }
      .build()
    return launchIntent.apply {
      this.action = Intent.ACTION_VIEW
      data = uri
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    }
  }

  private fun pendingActivity(context: Context, intent: Intent, requestCode: Int): PendingIntent =
    PendingIntent.getActivity(
      context,
      requestCode,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

  private fun formatDuration(seconds: Double): String {
    val totalSeconds = floor(seconds).toLong().coerceAtLeast(0)
    val hours = totalSeconds / 3600
    val minutes = (totalSeconds % 3600) / 60
    val remainingSeconds = totalSeconds % 60
    return if (hours > 0) {
      String.format(Locale.US, "%d:%02d:%02d", hours, minutes, remainingSeconds)
    } else {
      String.format(Locale.US, "%02d:%02d", minutes, remainingSeconds)
    }
  }

  private fun formatPace(paceMinutesPerKm: Double): String {
    if (!paceMinutesPerKm.isFinite() || paceMinutesPerKm <= 0) return "--:--"
    val wholeMinutes = floor(paceMinutesPerKm).toInt()
    val seconds = (((paceMinutesPerKm - wholeMinutes) * 60).toInt()).coerceIn(0, 59)
    return String.format(Locale.US, "%d:%02d", wholeMinutes, seconds)
  }

  private fun formatDistanceChip(distanceKm: Double): String =
    if (distanceKm < 10) String.format(Locale.US, "%.1fk", distanceKm) else "${distanceKm.toInt()}k"

  private companion object {
    const val PREFERENCES_NAME = "zyrun_live_update"
    const val KEY_NOTIFICATION_ID = "expo_location_notification_id"
    const val KEY_NOTIFICATION_TAG = "expo_location_notification_tag"
    const val INVALID_NOTIFICATION_ID = -1
    const val LOCATION_NOTIFICATION_TITLE = "Zy-Run - Tracking Live"
    const val EXTRA_ZYRUN_LIVE_UPDATE = "com.zyapp.extra.ZYRUN_LIVE_UPDATE"
  }
}