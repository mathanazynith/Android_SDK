# GPX import, export, and Android testing

## In-app workflow

- On a workout in History, open Activity Details and tap the share icon, or open that activity's three-dot menu and select **Export GPX**, to create and share a GPX 1.1 track for that specific activity.
- Import requires timestamps with time zones on every point. Coordinates are range-checked; files are limited to 10 MB, 100,000 points, and 72 hours. Time gaps longer than 15 minutes are called out before confirmation.
- GPX latitude and longitude are mapped directly to the app's `latitude` and `longitude` fields. The app validates ranges but does not shift, swap, or otherwise "correct" valid coordinates.
- Distance shown in the preview is a raw point-to-point estimate. The backend must compute the saved activity's canonical distance and moving time from the GPS samples; it must not trust that estimate as the final workout metric.

## Backend work required for workout import

This repository contains the mobile client only. The client posts the validated workout to:

```text
POST /api/v1/rundata/activities/import-gpx/
```

The path can be changed with `EXPO_PUBLIC_GPX_ACTIVITY_IMPORT_PATH`. The request uses the authenticated API client and has this JSON shape:

```json
{
  "source": "GPX",
  "source_file_name": "run.gpx",
  "activity_type": "RUN",
  "start_time": "2026-11-02T10:00:00.000Z",
  "end_time": "2026-11-02T10:30:00.000Z",
  "elapsed_time_s": 1800,
  "distance_estimate_m": 5000,
  "gps_points": [
    {
      "latitude": 12.9,
      "longitude": 80.1,
      "altitude": 31.5,
      "accuracy": null,
      "speed": null,
      "heading": null,
      "timestamp": "2026-11-02T10:00:00.000Z",
      "is_extra_distance": false,
      "is_paused": false,
      "pause_sequence": null
    }
  ]
}
```

The endpoint should authenticate and assign ownership to the signed-in user, revalidate every point server-side, persist a normal History activity, and return the new activity ID as `{"data":{"id":"..."}}` or `{"activity_id":"..."}`. The app then loads the normal activity detail endpoint. The server should calculate final distance, pace, and processing state from the uploaded GPS trace. A `404` from the import URL means the backend endpoint has not been deployed; the app reports that explicitly rather than pretending the workout was saved.

## Android emulator GPX replay

The existing `scripts/gps-simulator.js` can generate a GPX route or replay a supplied GPX file directly to a running Android emulator.

1. Start an Android Studio emulator, install/run the development build, grant location permission, and start an in-app run if you want to test recording.
2. Set `ANDROID_SDK_ROOT` (or `ANDROID_HOME`) if the SDK is installed outside `%LOCALAPPDATA%\Android\Sdk`. The simulator checks those SDK paths for `platform-tools\adb.exe`, so `adb` does not need to be on PowerShell `PATH`.
3. Replay an existing file:

   ```powershell
   npm run simulate-gps -- --gpx "C:\path\to\route.gpx" --speed 4x
   ```

   The command accepts `<trkpt>`, `<rtept>`, and `<wpt>` points. Use Space to pause/resume and Q to stop. Playback uses the GPX timestamps, caps an individual gap at 60 seconds, and applies the speed multiplier.
4. Generate a test route without starting playback:

   ```powershell
   npm run simulate-gps -- --dist 5 --start 12.9716,77.5946 --gpx-only
   ```

   The script writes `custom-run-5km.gpx` and `test-route.gpx` in the repository root. Those can also be loaded through Android Studio's Emulator Extended Controls → Location → Routes.

The generated route files are test outputs; do not commit them unless they are intentionally added as fixtures.
