package com.zyapp

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule

class WorkoutVolumeSplitModule(
  reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
  init {
    instance = this
  }

  override fun getName(): String = MODULE_NAME

  @ReactMethod
  fun setEnabled(enabled: Boolean) {
    isEnabled = enabled
  }

  @ReactMethod
  fun addListener(eventName: String) = Unit

  @ReactMethod
  fun removeListeners(count: Int) = Unit

  companion object {
    const val MODULE_NAME = "WorkoutVolumeSplit"
    const val EVENT_NAME = "workoutVolumeSplitPressed"

    @Volatile
    var isEnabled: Boolean = false
      private set

    @Volatile
    private var instance: WorkoutVolumeSplitModule? = null

    fun dispatchVolumeButtonPress() {
      val module = instance ?: return
      val context = module.reactApplicationContext
      if (!isEnabled || !context.hasActiveReactInstance()) return
      context.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        .emit(EVENT_NAME, null)
    }
  }
}
