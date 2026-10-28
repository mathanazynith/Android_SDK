/**
 * 🏃 ZY-RUN Custom Human Running Simulator for Android Studio Emulator
 *
 * Simulates genuine human running biomechanics starting directly from your
 * CURRENT LOCATION for any distance you choose (1 km, 2 km, 5 km, etc.)!
 *
 * Features:
 *   - Choose your distance directly in CONFIG below or pass via command line
 *   - Auto-detects current emulator GPS location (or use your custom coordinates)
 *   - Generates realistic neighborhood loops, out-and-back routes, or 400m track runs
 *   - Authentic human running biomechanics (warm-up ease-in, cadence pulses, cornering, heart rate, elevation)
 *   - Live direct ADB streaming into Android Studio Emulator (emulator-5554)
 *   - Exports standard .gpx files ready for Android Studio Location Routes
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const readline = require('readline');

// ==============================================================================
// ⚙️ SIMULATION CONFIGURATION - EDIT DIRECTLY HERE IN THE CODE:
// ==============================================================================
const CONFIG = {
  // 1. Distance in Kilometers (Choose any distance you want):
  //    Examples: 1.0 (1 km), 2.0 (2 km), 3.0 (3 km), 5.0 (5 km), etc.
  distanceKm: 1.0,

  // 2. Starting Location:
  //    - Set to null to automatically detect & use your emulator's current location!
  //    - Or provide custom coordinates, e.g.: { lat: 12.9716, lon: 77.5946 }
  startLocation: null,

  // 3. Route Pattern:
  //    'loop'        -> Natural neighborhood loop starting & returning to your location
  //    'out-and-back'-> Runs straight out for half distance and returns to start point
  //    'track'       -> IAAF 400m Olympic oval track placed at your location
  routeType: 'loop',

  // 4. Target Running Pace:
  //    '4:30' (fast / 13.3 km/h), '5:00' (athletic / 12 km/h), '5:45' (jog / 10.4 km/h), '6:30' (easy / 9.2 km/h)
  pace: '5:00',

  // 5. Playback Speed Multiplier:
  //    1x = Real-time human running (1 second = 1 second)
  //    2x = Double speed (1km takes ~2.5 mins)
  //    4x = 4x fast forward (1km takes ~1.2 mins, great for quick tests!)
  speedMultiplier: 2,
};

// ==========================================
// GEODESIC & BIOMECHANIC CONSTANTS
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
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_METERS * c;
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

function calculateBearing(p1, p2) {
  const dLon = toRad(p2.lon - p1.lon);
  const lat1 = toRad(p1.lat);
  const lat2 = toRad(p2.lat);

  const y = Math.sin(dLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);

  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function parsePaceToSpeed(paceStr) {
  const [minStr, secStr] = paceStr.split(':');
  const totalSeconds = parseInt(minStr, 10) * 60 + (parseInt(secStr, 10) || 0);
  if (totalSeconds <= 0) return 3.33; // 5:00 /km default
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
// ROUTE GENERATORS (Loop, Out-and-Back, Track)
// ==========================================
function generateNeighborhoodLoopWaypoints(startPoint, targetDistanceMeters) {
  const relativePolygon = [
    { bearing: 0,   ratio: 0.28, name: 'Northbound Street' },
    { bearing: 75,  ratio: 0.12, name: 'East Turn & Ave' },
    { bearing: 110, ratio: 0.14, name: 'Parkside Parkway' },
    { bearing: 180, ratio: 0.24, name: 'South Boulevard' },
    { bearing: 250, ratio: 0.10, name: 'West Connector Road' },
    { bearing: 295, ratio: 0.12, name: 'Home Stretch Drive' },
  ];

  const waypoints = [{ ...startPoint, isTurn: false, sectionName: 'Start Point' }];
  let current = { ...startPoint };

  for (let i = 0; i < relativePolygon.length - 1; i++) {
    const leg = relativePolygon[i];
    const legDist = targetDistanceMeters * leg.ratio;
    current = movePoint(current, leg.bearing, legDist);
    waypoints.push({
      ...current,
      isTurn: true,
      sectionName: leg.name,
    });
  }

  waypoints.push({
    ...startPoint,
    isTurn: false,
    sectionName: 'Finish / Start Point',
  });

  return waypoints;
}

function generateOutAndBackWaypoints(startPoint, targetDistanceMeters) {
  const outboundDist = (targetDistanceMeters / 2) - 15;
  const outboundBearing = 35;

  const waypoints = [{ ...startPoint, isTurn: false, sectionName: 'Outbound Start' }];
  const midPoint = movePoint(startPoint, outboundBearing, outboundDist);
  waypoints.push({ ...midPoint, isTurn: true, sectionName: 'Turnaround Approach' });

  const turnaround1 = movePoint(midPoint, (outboundBearing + 90) % 360, 10);
  const turnaround2 = movePoint(turnaround1, (outboundBearing + 180) % 360, 10);
  waypoints.push({ ...turnaround1, isTurn: true, sectionName: 'Turnaround Point' });
  waypoints.push({ ...turnaround2, isTurn: true, sectionName: 'Inbound Return' });
  waypoints.push({ ...startPoint, isTurn: false, sectionName: 'Finish Line' });

  return waypoints;
}

function generateTrackWaypoints(startPoint, targetDistanceMeters) {
  const mPerDegLat = 111320;
  const mPerDegLon = 111320 * Math.cos(toRad(startPoint.lat));
  const straightLen = 84.39;
  const radius = 36.50;
  const halfStraight = straightLen / 2;

  const laps = Math.max(1, Math.round(targetDistanceMeters / 400));
  const singleLapWaypoints = [];

  for (let y = -halfStraight; y < halfStraight; y += 4.0) {
    singleLapWaypoints.push({
      lat: startPoint.lat + (y / mPerDegLat),
      lon: startPoint.lon + (-radius / mPerDegLon),
      isTurn: false,
      sectionName: 'Home Straight',
    });
  }
  for (let a = 180; a > 0; a -= 8.0) {
    const rad = toRad(a);
    singleLapWaypoints.push({
      lat: startPoint.lat + ((halfStraight + radius * Math.sin(rad)) / mPerDegLat),
      lon: startPoint.lon + ((radius * Math.cos(rad)) / mPerDegLon),
      isTurn: true,
      sectionName: 'North Bend',
    });
  }
  for (let y = halfStraight; y > -halfStraight; y -= 4.0) {
    singleLapWaypoints.push({
      lat: startPoint.lat + (y / mPerDegLat),
      lon: startPoint.lon + (radius / mPerDegLon),
      isTurn: false,
      sectionName: 'Back Straight',
    });
  }
  for (let a = 0; a > -180; a -= 8.0) {
    const rad = toRad(a);
    singleLapWaypoints.push({
      lat: startPoint.lat + ((-halfStraight + radius * Math.sin(rad)) / mPerDegLat),
      lon: startPoint.lon + ((radius * Math.cos(rad)) / mPerDegLon),
      isTurn: true,
      sectionName: 'South Bend',
    });
  }

  const allWaypoints = [];
  for (let l = 0; l < laps; l++) {
    singleLapWaypoints.forEach((wp) => allWaypoints.push({ ...wp, lapNumber: l + 1 }));
  }
  allWaypoints.push({ ...singleLapWaypoints[0], lapNumber: laps });
  return allWaypoints;
}

// ==========================================
// HUMAN BIOMECHANICS SIMULATION PIPELINE
// ==========================================
function interpolateBiomechanicalPoints(waypoints, targetDistanceMeters, targetSpeedMps, startTimeMs) {
  let rawPerimeter = 0;
  for (let i = 0; i < waypoints.length - 1; i++) {
    rawPerimeter += haversineDistanceMeters(waypoints[i], waypoints[i + 1]);
  }

  const scale = rawPerimeter > 0 ? targetDistanceMeters / rawPerimeter : 1.0;

  const points = [];
  let currentTime = startTimeMs || Date.now();
  let totalDistance = 0;
  let currentElevation = 18.0;
  let secondCounter = 0;
  let currentSplitKm = 1;

  for (let i = 0; i < waypoints.length - 1; i++) {
    const p1 = waypoints[i];
    const p2 = waypoints[i + 1];
    const segDist = haversineDistanceMeters(p1, p2) * scale;
    if (segDist <= 0.05) continue;

    const bearing = calculateBearing(p1, p2);
    let distCovered = 0;
    let curr = { ...p1 };

    while (distCovered < segDist && totalDistance < targetDistanceMeters) {
      secondCounter += 1;

      let warmUpFactor = 1.0;
      if (secondCounter < 25) {
        warmUpFactor = 0.75 + (0.25 * Math.sin((secondCounter / 25) * (Math.PI / 2)));
      }

      const turnMultiplier = p1.isTurn ? 0.92 : 1.04;
      const cadencePulse = Math.sin(secondCounter * 2.93 * Math.PI) * 0.03;
      const breathingWave = Math.sin((secondCounter / 4.5) * 2 * Math.PI) * 0.035;
      const microJitter = (Math.random() * 0.03 - 0.015);

      const speedMps = Math.max(
        2.2,
        targetSpeedMps * warmUpFactor * turnMultiplier * (1 + cadencePulse + breathingWave + microJitter)
      );

      const stepDist = speedMps * 1.0;
      distCovered += stepDist;
      totalDistance += stepDist;
      currentTime += 1000;

      curr = movePoint(curr, bearing, stepDist);

      const armJitter = (Math.sin(secondCounter * 2.93 * Math.PI) * 0.3) + (Math.random() * 0.2 - 0.1);
      const crossBearing = (bearing + 90) % 360;
      const drifted = movePoint(curr, crossBearing, armJitter);

      currentElevation = 18.0 + Math.sin(secondCounter / 22) * 2.5;

      const hrProgress = Math.min(1.0, secondCounter / 120);
      const hr = Math.round(122 + hrProgress * 42 + Math.sin(secondCounter / 8) * 3);
      const cadence = Math.round(174 + (speedMps - targetSpeedMps) * 8 + (Math.random() * 2 - 1));

      let splitEvent = null;
      if (totalDistance >= currentSplitKm * 1000) {
        splitEvent = currentSplitKm;
        currentSplitKm += 1;
      }

      points.push({
        lat: parseFloat(drifted.lat.toFixed(6)),
        lon: parseFloat(drifted.lon.toFixed(6)),
        elevation: parseFloat(currentElevation.toFixed(1)),
        speed: parseFloat(speedMps.toFixed(2)),
        bearing: parseFloat(bearing.toFixed(1)),
        heartRate: hr,
        cadence: cadence,
        timestamp: currentTime,
        cumulativeDistanceMeters: Math.min(totalDistance, targetDistanceMeters),
        splitEvent: splitEvent,
        sectionName: p1.sectionName || 'Neighborhood Road',
      });
    }
  }

  return points;
}

// ==========================================
// PROFESSIONAL GPX 1.1 EXPORTER
// ==========================================
function exportGpxFile(points, routeTitle, filePath) {
  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="ZY-RUN Biomechanics Simulator"
  xmlns="http://www.topografix.com/GPX/1/1"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1"
  xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd http://www.garmin.com/xmlschemas/TrackPointExtension/v1 http://www.garmin.com/xmlschemas/TrackPointExtensionv1.xsd">
  <metadata>
    <name>${routeTitle}</name>
    <time>${new Date(points[0].timestamp).toISOString()}</time>
  </metadata>
  <trk>
    <name>${routeTitle}</name>
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

  fs.writeFileSync(filePath, xml, 'utf8');
}

// ==========================================
// ADB EMULATOR AUTO-DETECTION & STREAMING
// ==========================================
function getAdbConfig() {
  const userProfile = process.env.USERPROFILE || 'C:\\Users\\mohammedsiddqe.ZYNITH-IT';
  const candidates = [
    path.join(userProfile, 'AppData', 'Local', 'Android', 'Sdk', 'platform-tools', 'adb.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Android', 'Sdk', 'platform-tools', 'adb.exe'),
    path.join(process.env.ANDROID_HOME || '', 'platform-tools', 'adb.exe'),
    'adb',
  ];

  let adbExecutable = null;
  for (const c of candidates) {
    if (!c) continue;
    try {
      execSync(`"${c}" version`, { stdio: 'ignore' });
      adbExecutable = c;
      break;
    } catch {}
  }

  if (!adbExecutable) return null;

  let deviceSerial = 'emulator-5554';
  try {
    const output = execSync(`"${adbExecutable}" devices`, { encoding: 'utf8' });
    const lines = output.split('\n').filter((l) => l.includes('\tdevice'));
    const emu = lines.find((l) => l.includes('emulator'));
    if (emu) {
      deviceSerial = emu.split('\t')[0].trim();
    }
  } catch {}

  return {
    path: adbExecutable,
    serial: deviceSerial,
  };
}

function detectEmulatorLocation(adb) {
  if (!adb) return null;
  try {
    const out = execSync(`"${adb.path}" -s ${adb.serial} shell dumpsys location`, {
      encoding: 'utf8',
      timeout: 2500,
    });
    const match = out.match(/Location\[(?:gps|fused|network)\s+([-+]?[0-9]*\.?[0-9]+)[,\s]+([-+]?[0-9]*\.?[0-9]+)/i);
    if (match) {
      const lat = parseFloat(match[1]);
      const lon = parseFloat(match[2]);
      if (!isNaN(lat) && !isNaN(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && (lat !== 0 || lon !== 0)) {
        return { lat, lon };
      }
    }
  } catch {}
  return null;
}

function streamPointToEmulator(adb, lat, lon, alt) {
  try {
    execSync(`"${adb.path}" -s ${adb.serial} emu geo fix ${lon.toFixed(6)} ${lat.toFixed(6)} ${alt.toFixed(1)}`, {
      stdio: 'ignore',
      timeout: 1000,
    });
    return true;
  } catch {
    return false;
  }
}

// ==========================================
// MAIN CLI RUNNER
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

  const distanceKm = parseFloat(parsedArgs.dist || parsedArgs.distance || CONFIG.distanceKm);
  const targetDistanceMeters = distanceKm * 1000;
  const pace = parsedArgs.pace || CONFIG.pace;
  const routeType = (parsedArgs.type || parsedArgs.route || CONFIG.routeType).toLowerCase();
  const speedMultiplier = parseInt(String(parsedArgs.speed || CONFIG.speedMultiplier).replace('x', ''), 10) || 1;
  const speedMps = parsePaceToSpeed(pace);

  const adb = getAdbConfig();

  let startLat = null;
  let startLon = null;
  let locationSource = 'Custom Code Config';

  if (parsedArgs.start) {
    const [cLat, cLon] = parsedArgs.start.split(',').map((n) => parseFloat(n.trim()));
    if (!isNaN(cLat) && !isNaN(cLon)) {
      startLat = cLat;
      startLon = cLon;
      locationSource = 'Command Line Argument';
    }
  }

  if (!startLat && CONFIG.startLocation && CONFIG.startLocation.lat && CONFIG.startLocation.lon) {
    startLat = CONFIG.startLocation.lat;
    startLon = CONFIG.startLocation.lon;
    locationSource = 'CONFIG.startLocation in scripts/gps-simulator.js';
  }

  if (!startLat && adb) {
    const emuLoc = detectEmulatorLocation(adb);
    if (emuLoc) {
      startLat = emuLoc.lat;
      startLon = emuLoc.lon;
      locationSource = 'Auto-Detected from Android Emulator GPS';
    }
  }

  if (!startLat) {
    startLat = 12.971600;
    startLon = 77.594600;
    locationSource = 'Default Urban Starting Point';
  }

  const startPoint = { lat: startLat, lon: startLon };

  let rawWaypoints = [];
  let routeName = '';

  if (routeType === 'out-and-back') {
    rawWaypoints = generateOutAndBackWaypoints(startPoint, targetDistanceMeters);
    routeName = `${distanceKm}km Out-and-Back Run`;
  } else if (routeType === 'track') {
    rawWaypoints = generateTrackWaypoints(startPoint, targetDistanceMeters);
    routeName = `${distanceKm}km Track Run`;
  } else {
    rawWaypoints = generateNeighborhoodLoopWaypoints(startPoint, targetDistanceMeters);
    routeName = `${distanceKm}km Neighborhood Road Loop`;
  }

  const points = interpolateBiomechanicalPoints(rawWaypoints, targetDistanceMeters, speedMps, Date.now());
  const totalMeters = points.at(-1)?.cumulativeDistanceMeters || targetDistanceMeters;
  const estimatedDurationSec = Math.round(targetDistanceMeters / speedMps);

  console.log('\n============================================================');
  console.log('  🏃  ZY-RUN Custom Distance & Location GPS Simulator');
  console.log('============================================================');
  console.log(`📍 Starting Point: [${startLat.toFixed(6)}, ${startLon.toFixed(6)}]`);
  console.log(`   Source:         ${locationSource}`);
  console.log(`📏 Target Distance:${distanceKm} km (${Math.round(totalMeters)} m)`);
  console.log(`🗺️  Route Type:     ${routeType.toUpperCase()} (${routeName})`);
  console.log(`⚡ Target Pace:    ${pace} /km (~${(speedMps * 3.6).toFixed(1)} km/h)`);
  console.log(`⏱️  Estimated Time: ${formatDuration(estimatedDurationSec)}`);
  console.log(`⏩ Playback Speed: ${speedMultiplier}x fast-forward`);

  const routeFileName = `custom-run-${distanceKm}km.gpx`;
  const gpxFilePath = path.resolve(routeFileName);
  const testRoutePath = path.resolve('test-route.gpx');

  exportGpxFile(points, routeName, gpxFilePath);
  exportGpxFile(points, routeName, testRoutePath);

  console.log(`\n📁 Generated Android Studio GPX Route Files:`);
  console.log(`   - ${routeFileName}   (${distanceKm} km, ${points.length} GPS points)`);
  console.log(`   - test-route.gpx           (Active simulation route)`);

  if (adb) {
    console.log(`\n🔌 Connected to Android Studio Emulator: ${adb.serial}`);
    console.log(`   Direct ADB injection enabled! Coordinates will stream straight into your emulator.`);
    streamPointToEmulator(adb, startLat, startLon, 18.0);
    console.log(`   📍 Initial position set on emulator: [${startLat.toFixed(6)}, ${startLon.toFixed(6)}]`);
  } else {
    console.log(`\n⚠️  No running emulator detected via ADB.`);
  }

  if (parsedArgs['gpx-only']) {
    console.log('\n✅ GPX file generated. Exiting (--gpx-only flag).');
    process.exit(0);
  }

  console.log('\n------------------------------------------------------------');
  console.log('Controls: Press [SPACE] to Pause / Resume, [Q] to Stop');
  console.log(`Starting run simulation on ${adb ? adb.serial : 'emulator'} in 3 seconds...\n`);

  await new Promise((r) => setTimeout(r, 3000));

  let currentIndex = 0;
  let isPaused = false;
  const timerIntervalMs = Math.round(1000 / speedMultiplier);

  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }
  process.stdin.on('keypress', (str, key) => {
    if (key.name === 'q' || (key.ctrl && key.name === 'c')) {
      console.log('\n\nSimulation stopped by user.');
      process.exit(0);
    }
    if (key.name === 'space') {
      isPaused = !isPaused;
      if (isPaused) {
        console.log('\n⏸️  [PAUSED - Testing Runner Rest]');
      } else {
        console.log('\n▶️  [RESUMED - Running]');
      }
    }
  });

  const interval = setInterval(() => {
    if (isPaused) return;

    if (currentIndex >= points.length) {
      clearInterval(interval);
      console.log('\n\n============================================================');
      console.log(`🏁 WORKOUT FINISHED!`);
      console.log(`   Total Distance:   ${(totalMeters / 1000).toFixed(2)} km`);
      console.log(`   Time Taken:       ${formatDuration(points.length)}`);
      console.log(`   Average Pace:     ${formatPace(totalMeters / points.length)}`);
      console.log(`   Calories (est):   ~${Math.round(totalMeters * 0.065)} kcal`);
      console.log('============================================================\n');
      process.exit(0);
    }

    const current = points[currentIndex];

    if (adb) {
      streamPointToEmulator(adb, current.lat, current.lon, current.elevation);
    }

    if (current.splitEvent) {
      console.log(
        `\n\n⚡ [MILESTONE] ${current.splitEvent}.0 KM SPLIT COMPLETED! | Current Pace: ${formatPace(current.speed)} | Time: ${formatDuration(currentIndex + 1)}`
      );
    }

    const distKm = (current.cumulativeDistanceMeters / 1000).toFixed(2);
    const progressPct = Math.min(100, Math.round((current.cumulativeDistanceMeters / totalMeters) * 100));
    const barWidth = 16;
    const filled = Math.round((progressPct / 100) * barWidth);
    const bar = '[' + '='.repeat(filled) + ' '.repeat(barWidth - filled) + ']';

    process.stdout.write(
      `\r🏃 ${bar} ${progressPct}% | ${distKm}/${distanceKm} km | Pace: ${formatPace(current.speed)} | HR: ${current.heartRate} bpm | ${current.sectionName} `
    );

    currentIndex += 1;
  }, timerIntervalMs);
}

main().catch((err) => {
  console.error('Error:', err);
});
