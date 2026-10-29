/**
 * Standalone Human-Like GPS Running Simulator for ZY-RUN
 *
 * Simulates genuine human running biomechanics:
 *   - Gradual warm-up acceleration (first 30s)
 *   - Cadence stride micro-pulses (168-174 steps/min)
 *   - Natural breathing rhythm & pacing drift (+/- 5-8%)
 *   - Cornering physics (decelerates into turns, accelerates on straightaways)
 *   - Arm-swing lateral GPS drift (0.8m - 1.8m realistic jitter)
 *   - Undulating elevation profile (12m - 28m)
 *   - Heart rate simulation (120 bpm warmup -> 162 bpm steady state)
 *
 * Compatible with:
 *   - Android Studio Emulator (Extended Controls > Location > Routes > Load GPX)
 *   - Direct ADB streaming to emulator or connected device
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const readline = require('readline');

// ==========================================
// PRESET REALISTIC RUNNING ROUTES
// ==========================================
const PRESETS = {
  '1k': {
    name: '1.0 km City Park Run (Human Stride & 1km Split Test)',
    targetPace: '5:15',
    waypoints: [
      { lat: 13.082700, lon: 80.270700 }, // Start at Park gate
      { lat: 13.085500, lon: 80.270700 }, // Northward straightaway
      { lat: 13.087200, lon: 80.272500 }, // Gentle northeast curve
      { lat: 13.089800, lon: 80.274000 }, // North park loop
      { lat: 13.091700, lon: 80.274500 }, // Finish straight
    ],
  },
  '5k': {
    name: '5.0 km Urban Running Course (Full Workout & 5 Splits)',
    targetPace: '5:20',
    waypoints: [
      { lat: 13.082700, lon: 80.270700 }, // Start (0.0 km)
      { lat: 13.089000, lon: 80.270700 }, // Split 1 (~0.9 km)
      { lat: 13.093500, lon: 80.275000 }, // Split 2 (~1.8 km)
      { lat: 13.093500, lon: 80.286000 }, // Split 3 (~2.9 km)
      { lat: 13.085000, lon: 80.286000 }, // Split 4 (~3.9 km)
      { lat: 13.081000, lon: 80.278000 }, // Split 5 approach (~4.6 km)
      { lat: 13.082700, lon: 80.270700 }, // Finish loop (~5.2 km)
    ],
  },
  '400m': {
    name: '400m Track Loop (Interval Sprint & Acceleration Test)',
    targetPace: '4:15',
    waypoints: [
      { lat: 13.006700, lon: 80.220600 },
      { lat: 13.007600, lon: 80.220600 },
      { lat: 13.007900, lon: 80.221200 },
      { lat: 13.007600, lon: 80.221800 },
      { lat: 13.006700, lon: 80.221800 },
      { lat: 13.006400, lon: 80.221200 },
      { lat: 13.006700, lon: 80.220600 },
    ],
  },
};

// ==========================================
// GEODESIC & BIOMECHANIC MATH HELPERS
// ==========================================
const EARTH_RADIUS_METERS = 6371000;

function toRad(degrees) {
  return (degrees * Math.PI) / 180;
}

function toDeg(radians) {
  return (radians * 180) / Math.PI;
}

function haversineDistanceMeters(p1, p2) {
  const dLat = toRad(p2.lat - p1.lat);
  const dLon = toRad(p2.lon - p1.lon);
  const lat1 = toRad(p1.lat);
  const lat2 = toRad(p2.lat);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_METERS * c;
}

function calculateBearing(p1, p2) {
  const y = Math.sin(toRad(p2.lon - p1.lon)) * Math.cos(toRad(p2.lat));
  const x =
    Math.cos(toRad(p1.lat)) * Math.sin(toRad(p2.lat)) -
    Math.sin(toRad(p1.lat)) * Math.cos(toRad(p2.lat)) * Math.cos(toRad(p2.lon - p1.lon));
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function movePoint(point, bearingDeg, distanceMeters) {
  const distRatio = distanceMeters / EARTH_RADIUS_METERS;
  const bearingRad = toRad(bearingDeg);
  const lat1 = toRad(point.lat);
  const lon1 = toRad(point.lon);

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(distRatio) +
    Math.cos(lat1) * Math.sin(distRatio) * Math.cos(bearingRad)
  );

  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(bearingRad) * Math.sin(distRatio) * Math.cos(lat1),
      Math.cos(distRatio) - Math.sin(lat1) * Math.sin(lat2)
    );

  return {
    lat: toDeg(lat2),
    lon: toDeg(lon2),
  };
}

function parsePaceToSpeed(paceStr) {
  const [minStr, secStr] = paceStr.split(':');
  const totalSeconds = parseInt(minStr, 10) * 60 + (parseInt(secStr, 10) || 0);
  if (totalSeconds <= 0) return 3.17;
  return 1000 / totalSeconds; // meters per second
}

function formatPace(metersPerSecond) {
  if (metersPerSecond <= 0) return '--:--';
  const secPerKm = Math.round(1000 / metersPerSecond);
  const m = Math.floor(secPerKm / 60);
  const s = secPerKm % 60;
  return `${m}:${String(s).padStart(2, '0')} /km`;
}

function formatDuration(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}

// ==========================================
// HUMAN BIOMECHANICS RUNNING ENGINE
// ==========================================
function generateHumanRunPath(waypoints, targetSpeedMps, startTimeMs) {
  const points = [];
  let currentTime = startTimeMs || Date.now();
  let totalDistance = 0;
  let currentElevation = 14.2; // starting base altitude in meters

  // Total route approximate length for long-wave fatigue modeling
  let estimatedTotalDistance = 0;
  for (let i = 0; i < waypoints.length - 1; i++) {
    estimatedTotalDistance += haversineDistanceMeters(waypoints[i], waypoints[i + 1]);
  }

  let stepCount = 0;

  for (let i = 0; i < waypoints.length - 1; i++) {
    const startPt = waypoints[i];
    const endPt = waypoints[i + 1];
    const segmentDistance = haversineDistanceMeters(startPt, endPt);
    const bearing = calculateBearing(startPt, endPt);

    let nextBearing = bearing;
    if (i < waypoints.length - 2) {
      nextBearing = calculateBearing(waypoints[i + 1], waypoints[i + 2]);
    }
    const angleDelta = Math.abs(((nextBearing - bearing + 540) % 360) - 180);

    let distanceCoveredInSeg = 0;
    let currentPt = { ...startPt };

    while (distanceCoveredInSeg < segmentDistance) {
      stepCount += 1;
      const elapsedSeconds = stepCount;

      // 1. Warmup acceleration curve: starts at a 6:40/km jog and reaches target pace over ~30s
      let warmupMultiplier = 1.0;
      if (elapsedSeconds < 30) {
        warmupMultiplier = 0.72 + (0.28 * Math.sin((elapsedSeconds / 30) * (Math.PI / 2)));
      }

      // 2. Cornering deceleration: slow down by 15-20% when approaching a turn
      let cornerMultiplier = 1.0;
      const remainingInSegment = segmentDistance - distanceCoveredInSeg;
      if (remainingInSegment < 35 && angleDelta > 30) {
        cornerMultiplier = 1.0 - (0.18 * (1 - remainingInSegment / 35));
      }

      // 3. Human Cadence & Breathing Waves (~172 SPM = ~2.87 steps/sec)
      // Cadence micro-pulse:
      const cadencePulse = Math.sin(stepCount * 2.87 * Math.PI) * 0.04;
      // Breathing / rhythm wave (4-second cycle):
      const breathingWave = Math.sin((stepCount / 4.5) * 2 * Math.PI) * 0.05;
      // Organic noise (+/- 2%):
      const naturalNoise = (Math.random() * 0.04 - 0.02);

      // Final instantaneous human speed
      const instantaneousSpeed = Math.max(
        1.8,
        targetSpeedMps * warmupMultiplier * cornerMultiplier * (1 + cadencePulse + breathingWave + naturalNoise)
      );

      const stepDistance = instantaneousSpeed * 1.0; // 1-second time interval
      distanceCoveredInSeg += stepDistance;
      totalDistance += stepDistance;
      currentTime += 1000;

      // Move along forward bearing
      currentPt = movePoint(currentPt, bearing, stepDistance);

      // 4. Arm-swing & GPS hardware micro-drift (lateral shift +/- 0.8m)
      const armSwingOffsetMeters = Math.sin(stepCount * 2.87 * Math.PI) * 0.75 + (Math.random() * 0.6 - 0.3);
      const crossBearing = (bearing + 90) % 360;
      const driftedPt = movePoint(currentPt, crossBearing, armSwingOffsetMeters);

      // 5. Undulating gentle elevation profile
      const gradeChange = Math.sin((totalDistance / 280) * Math.PI) * 0.22 + (Math.random() * 0.1 - 0.05);
      currentElevation = Math.max(8.0, currentElevation + gradeChange);

      // 6. Realistic Heart Rate Simulation (120 bpm warmup -> 162 bpm steady state)
      const hrProgress = Math.min(1.0, elapsedSeconds / 120);
      const baseHr = 122 + (hrProgress * 38); // 122 -> 160 bpm
      const hrFluctuation = Math.sin((stepCount / 8) * Math.PI) * 2 + (instantaneousSpeed / targetSpeedMps) * 4;
      const simulatedHr = Math.round(baseHr + hrFluctuation);

      // 7. Cadence in SPM (steps per minute)
      const simulatedCadence = Math.round(168 + (instantaneousSpeed - targetSpeedMps) * 12 + (Math.random() * 4 - 2));

      points.push({
        lat: driftedPt.lat,
        lon: driftedPt.lon,
        elevation: parseFloat(currentElevation.toFixed(1)),
        speed: parseFloat(instantaneousSpeed.toFixed(2)),
        bearing: parseFloat(bearing.toFixed(1)),
        heartRate: simulatedHr,
        cadence: simulatedCadence,
        timestamp: currentTime,
        cumulativeDistanceMeters: totalDistance,
      });
    }
  }

  return points;
}

// ==========================================
// PROFESSIONAL GPX 1.1 EXPORTER
// ==========================================
function exportToHumanGpx(points, routeName, outputPath) {
  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="ZY-RUN Human Running Simulator"
  xmlns="http://www.topografix.com/GPX/1/1"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1"
  xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd http://www.garmin.com/xmlschemas/TrackPointExtension/v1 http://www.garmin.com/xmlschemas/TrackPointExtensionv1.xsd">
  <metadata>
    <name>${routeName}</name>
    <time>${new Date(points[0].timestamp).toISOString()}</time>
  </metadata>
  <trk>
    <name>${routeName}</name>
    <type>running</type>
    <trkseg>
`;

  points.forEach((pt) => {
    const timeIso = new Date(pt.timestamp).toISOString();
    xml += `      <trkpt lat="${pt.lat.toFixed(6)}" lon="${pt.lon.toFixed(6)}">
        <ele>${pt.elevation.toFixed(1)}</ele>
        <time>${timeIso}</time>
        <speed>${pt.speed.toFixed(2)}</speed>
        <extensions>
          <gpxtpx:TrackPointExtension>
            <gpxtpx:hr>${pt.heartRate}</gpxtpx:hr>
            <gpxtpx:cad>${pt.cadence}</gpxtpx:cad>
          </gpxtpx:TrackPointExtension>
        </extensions>
      </trkpt>\n`;
  });

  xml += `    </trkseg>
  </trk>
</gpx>`;

  fs.writeFileSync(outputPath, xml, 'utf8');
}

// ==========================================
// ADB PATH DETECTION
// ==========================================
function findAdbPath() {
  const userProfile = process.env.USERPROFILE || 'C:\\Users\\mohammedsiddqe.ZYNITH-IT';
  const candidates = [
    'adb',
    path.join(userProfile, 'AppData', 'Local', 'Android', 'Sdk', 'platform-tools', 'adb.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Android', 'Sdk', 'platform-tools', 'adb.exe'),
    path.join(process.env.ANDROID_HOME || '', 'platform-tools', 'adb.exe'),
    'C:\\Android_SDK\\platform-tools\\adb.exe',
  ];

  for (const p of candidates) {
    if (!p) continue;
    try {
      execSync(`"${p}" version`, { stdio: 'ignore' });
      return p;
    } catch {
      // ignore
    }
  }
  return null;
}

function sendLocationToAdb(adbPath, lat, lon, alt) {
  if (!adbPath) return false;
  try {
    execSync(`"${adbPath}" emu geo fix ${lon.toFixed(6)} ${lat.toFixed(6)} ${alt.toFixed(1)}`, {
      stdio: 'ignore',
      timeout: 1000,
    });
    return true;
  } catch {
    return false;
  }
}

// ==========================================
// CLI RUNNER
// ==========================================
async function main() {
  const args = process.argv.slice(2);
  const parsedArgs = {};
  args.forEach((a) => {
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=');
      parsedArgs[k] = v === undefined ? true : v;
    }
  });

  console.log('\n============================================================');
  console.log('  🏃 ZY-RUN Human Running Biomechanics Simulator');
  console.log('============================================================');

  const presetKey = parsedArgs.preset || '1k';
  const chosen = PRESETS[presetKey] || PRESETS['1k'];
  const pace = parsedArgs.pace || chosen.targetPace || '5:15';
  const speedMultiplier = parseInt((parsedArgs.speed || '1x').replace('x', ''), 10) || 1;
  const speedMps = parsePaceToSpeed(pace);

  let waypoints = chosen.waypoints;
  if (parsedArgs.start && parsedArgs.end) {
    const [lat1, lon1] = parsedArgs.start.split(',').map(Number);
    const [lat2, lon2] = parsedArgs.end.split(',').map(Number);
    waypoints = [
      { lat: lat1, lon: lon1 },
      { lat: lat2, lon: lon2 },
    ];
    console.log(`📍 Custom Route: (${lat1}, ${lon1}) -> (${lat2}, ${lon2})`);
  } else {
    console.log(`📍 Course: ${chosen.name}`);
  }

  console.log(`⚡ Target Pace: ${pace} /km (~${(speedMps * 3.6).toFixed(1)} km/h)`);
  console.log(`🧬 Biomechanics: Warm-up ease-in, ~172 SPM Cadence, Corner deceleration, GPS arm jitter`);

  const points = generateHumanRunPath(waypoints, speedMps, Date.now());
  const totalMeters = points.at(-1)?.cumulativeDistanceMeters || 0;
  console.log(`📏 Distance: ${(totalMeters / 1000).toFixed(2)} km (${points.length} human stride data points)`);

  // Export GPX files for Android Studio
  const testRoutePath = path.resolve('test-route.gpx');
  const human5kPath = path.resolve('human-5k.gpx');

  exportToHumanGpx(points, chosen.name, testRoutePath);
  console.log(`📁 Updated Android Studio file: ${testRoutePath}`);

  // Generate 5k companion file if not already 5k
  if (presetKey !== '5k') {
    const points5k = generateHumanRunPath(PRESETS['5k'].waypoints, parsePaceToSpeed('5:20'), Date.now());
    exportToHumanGpx(points5k, PRESETS['5k'].name, human5kPath);
    console.log(`📁 Companion 5k Route file:    ${human5kPath}`);
  }

  if (parsedArgs['gpx-only']) {
    console.log('\n✅ [Ready] GPX files created with realistic human cadence & heart rate.');
    console.log('   You can now load it directly in Android Studio:');
    console.log('   Emulator -> (...) Extended Controls -> Location -> Routes -> Load GPX -> Play Route\n');
    process.exit(0);
  }

  const adbPath = findAdbPath();
  if (adbPath) {
    console.log(`🔌 ADB detected: ${adbPath}`);
  } else {
    console.log(`ℹ️  Tip: You can drag 'test-route.gpx' into Android Studio Emulator > Location > Routes.`);
  }

  console.log('\n------------------------------------------------------------');
  console.log('Press [SPACE] to Pause / Resume, [Q] to Quit');
  console.log('Starting human run simulation in 3 seconds...\n');

  await new Promise((r) => setTimeout(r, 3000));

  let currentIndex = 0;
  let isPaused = false;
  const timerIntervalMs = Math.round(1000 / speedMultiplier);

  // Keypress handling
  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }
  process.stdin.on('keypress', (str, key) => {
    if (key.name === 'q' || (key.ctrl && key.name === 'c')) {
      console.log('\nSimulation stopped by user.');
      process.exit(0);
    }
    if (key.name === 'space') {
      isPaused = !isPaused;
      if (isPaused) {
        console.log('\n⏸️  [PAUSED (Simulating Runner Stopped / Rest)]');
      } else {
        console.log('\n▶️  [RESUMED (Running Resumed)]');
      }
    }
  });

  const interval = setInterval(() => {
    if (isPaused) return;

    if (currentIndex >= points.length) {
      clearInterval(interval);
      console.log('\n============================================================');
      console.log(`🏁 SIMULATION COMPLETE!`);
      console.log(`   Distance Covered: ${(totalMeters / 1000).toFixed(2)} km`);
      console.log(`   Running Time:     ${formatDuration(points.length)}`);
      console.log('============================================================\n');
      process.exit(0);
    }

    const current = points[currentIndex];

    if (adbPath) {
      sendLocationToAdb(adbPath, current.lat, current.lon, current.elevation);
    }

    const distKm = (current.cumulativeDistanceMeters / 1000).toFixed(2);
    const progressPct = Math.min(100, Math.round((current.cumulativeDistanceMeters / totalMeters) * 100));
    const barWidth = 18;
    const filled = Math.round((progressPct / 100) * barWidth);
    const bar = '[' + '='.repeat(filled) + ' '.repeat(barWidth - filled) + ']';

    process.stdout.write(
      `\r🏃 ${bar} ${progressPct}% | ${distKm} km | Pace: ${formatPace(current.speed)} | HR: ${current.heartRate} bpm | Cad: ${current.cadence} spm | Alt: ${current.elevation}m `
    );

    currentIndex += 1;
  }, timerIntervalMs);
}

main().catch((err) => {
  console.error('Error running simulator:', err);
});
