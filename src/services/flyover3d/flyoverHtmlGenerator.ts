// src/services/flyover3d/flyoverHtmlGenerator.ts

export interface FlyoverGpsPoint {
  latitude: number;
  longitude: number;
  altitude?: number | null;
  speed?: number | null;
  timestamp?: string | number | null;
  accuracy?: number | null;
  heading?: number | null;
  is_extra_distance?: boolean;
  is_paused?: boolean;
  pause_sequence?: number | null;
}

export interface FlyoverOptions {
  points: FlyoverGpsPoint[];
  title?: string;
  totalDistanceMeters?: number;
  totalDurationSeconds?: number;
  elevationGainMeters?: number;
  initialStyle?: 'satellite' | 'dark';
  avatarUrl?: string | null;
}

export function generateFlyoverHtml(options: FlyoverOptions): string {
  const pointsJson = JSON.stringify(options.points || []);
  const title = (options.title || 'Workout Flyover').replace(/["\\]/g, '');
  const totalDistance = options.totalDistanceMeters || 0;
  const totalDuration = options.totalDurationSeconds || 0;
  const elevationGain = options.elevationGainMeters || 0;
  const initialStyle = options.initialStyle || 'satellite';
  const avatarUrl = options.avatarUrl ? options.avatarUrl.replace(/["\\]/g, '') : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <title>3D Workout Flyover</title>
  <link href="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css" rel="stylesheet" onerror="this.onerror=null;this.href='https://cdn.jsdelivr.net/npm/maplibre-gl@4.7.1/dist/maplibre-gl.css';" />
  <script src="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js" onerror="this.onerror=null;this.src='https://cdn.jsdelivr.net/npm/maplibre-gl@4.7.1/dist/maplibre-gl.js';"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; overflow: hidden; background-color: #090B0A; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #FFFFFF; }
    #map { width: 100%; height: 100%; position: absolute; inset: 0; }

    /* Vignette & Cinematic Horizon Shade */
    .cinematic-overlay {
      position: absolute; inset: 0; pointer-events: none;
      background: radial-gradient(circle at center, transparent 40%, rgba(9, 11, 10, 0.45) 100%);
    }

    /* Running Athlete / User Avatar Marker */
    .runner-avatar-wrapper {
      position: relative;
      width: 44px;
      height: 44px;
      display: flex;
      align-items: center;
      justify-content: center;
      pointer-events: none;
      transform: translate(-50%, -50%);
    }

    .runner-avatar-bounce {
      position: relative;
      width: 38px;
      height: 38px;
      display: flex;
      align-items: center;
      justify-content: center;
      animation: runner-stride-bounce 0.65s infinite ease-in-out;
    }

    @keyframes runner-stride-bounce {
      0%, 100% {
        transform: translateY(0) scale(1);
      }
      50% {
        transform: translateY(-5px) scale(1.04);
      }
    }

    .runner-avatar-halo {
      position: absolute;
      inset: -6px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(34, 197, 94, 0.45) 0%, rgba(34, 197, 94, 0) 72%);
      animation: runner-halo-pulse 1.3s infinite ease-in-out;
    }

    @keyframes runner-halo-pulse {
      0%, 100% { transform: scale(0.9); opacity: 0.6; }
      50% { transform: scale(1.2); opacity: 0.95; }
    }

    .runner-avatar-disc {
      position: relative;
      width: 34px;
      height: 34px;
      border-radius: 50%;
      background: linear-gradient(135deg, #22C55E 0%, #15803D 100%);
      border: 2.5px solid #FFFFFF;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.65), 0 0 16px rgba(34, 197, 94, 0.8);
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      z-index: 2;
    }

    .runner-avatar-img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      border-radius: 50%;
    }

    .runner-svg-icon {
      filter: drop-shadow(0 1px 2px rgba(0,0,0,0.5));
    }

    .runner-mini-badge {
      position: absolute;
      bottom: -1px;
      right: -1px;
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: #22C55E;
      border: 1.5px solid #FFFFFF;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 3;
      box-shadow: 0 1px 4px rgba(0,0,0,0.5);
    }

    .runner-avatar-shadow {
      position: absolute;
      bottom: -4px;
      width: 22px;
      height: 6px;
      border-radius: 50%;
      background: rgba(0, 0, 0, 0.6);
      filter: blur(2px);
      z-index: 1;
      animation: runner-ground-shadow 0.65s infinite ease-in-out;
    }

    @keyframes runner-ground-shadow {
      0%, 100% { transform: scale(1); opacity: 0.7; }
      50% { transform: scale(0.7); opacity: 0.3; }
    }

    /* Start / Finish Dot Markers */
    .route-endpoint-dot {
      width: 18px; height: 18px; border-radius: 50%;
      border: 3px solid #FFFFFF;
      box-shadow: 0 2px 10px rgba(0,0,0,0.7);
      transform: translate(-50%, -50%);
    }
    .start-dot { background: #22C55E; box-shadow: 0 0 12px #22C55E, 0 2px 8px rgba(0,0,0,0.7); }
    .finish-dot { background: #EF4444; box-shadow: 0 0 12px #EF4444, 0 2px 8px rgba(0,0,0,0.7); }
  </style>
</head>
<body>
  <div id="map"></div>
  <div class="cinematic-overlay"></div>

  <script>
    const RAW_POINTS = ${pointsJson};
    const TITLE = "${title}";
    const TOTAL_DISTANCE = ${totalDistance};
    const TOTAL_DURATION = ${totalDuration};
    const ELEVATION_GAIN = ${elevationGain};
    const USER_AVATAR = "${avatarUrl}";
    let currentMapStyle = "${initialStyle}";

    let map = null;
    let runnerMarker = null;
    let animationFrameId = null;
    let isPlaying = false;
    let playbackSpeed = 1.0;
    let progress = 0; // 0 to 1
    let cumDistances = [];
    let totalComputedDistance = 0;
    let mediaRecorder = null;
    let recordedChunks = [];

    // Robust coordinate normalization
    const validPoints = [];
    if (Array.isArray(RAW_POINTS)) {
      for (var i = 0; i < RAW_POINTS.length; i++) {
        var pt = RAW_POINTS[i];
        if (!pt || typeof pt !== 'object') continue;
        var rawLat = pt.latitude !== undefined ? pt.latitude : pt.lat;
        var rawLng = pt.longitude !== undefined ? pt.longitude : (pt.lng !== undefined ? pt.lng : pt.lon);
        var numLat = typeof rawLat === 'number' ? rawLat : parseFloat(rawLat);
        var numLng = typeof rawLng === 'number' ? rawLng : parseFloat(rawLng);
        if (!isNaN(numLat) && !isNaN(numLng) && numLat >= -90 && numLat <= 90 && numLng >= -180 && numLng <= 180) {
          var rawAlt = pt.altitude !== undefined ? pt.altitude : (pt.alt !== undefined ? pt.alt : pt.elevation);
          var numAlt = typeof rawAlt === 'number' ? rawAlt : parseFloat(rawAlt);
          validPoints.push({
            latitude: numLat,
            longitude: numLng,
            altitude: (!isNaN(numAlt) && numAlt !== null) ? numAlt : 0,
            speed: typeof pt.speed === 'number' ? pt.speed : 0
          });
        }
      }
    }

    // Global error listener to prevent silent failures in Android WebView
    window.onerror = function(message, source, lineno, colno, error) {
      var errStr = String(message || 'Unknown WebGL/JS error');
      notifyNative('ERROR', errStr + (lineno ? ' (' + lineno + ')' : ''));
      notifyNative('READY', { fallback: true, error: errStr });
      return false;
    };

    function notifyNative(type, payload) {
      try {
        if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: type, payload: payload }));
        }
      } catch (e) {
        console.warn('notifyNative error:', e);
      }
    }

    // Distance calculation
    function haversine(p1, p2) {
      const R = 6371000; // meters
      const lat1 = p1.latitude * Math.PI / 180;
      const lat2 = p2.latitude * Math.PI / 180;
      const dLat = (p2.latitude - p1.latitude) * Math.PI / 180;
      const dLon = (p2.longitude - p1.longitude) * Math.PI / 180;
      const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos(lat1) * Math.cos(lat2) *
                Math.sin(dLon / 2) * Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return R * c;
    }

    // Bearing calculation for camera rotation
    function getBearing(startLat, startLng, destLat, destLng) {
      const y = Math.sin((destLng - startLng) * Math.PI / 180) * Math.cos(destLat * Math.PI / 180);
      const x = Math.cos(startLat * Math.PI / 180) * Math.sin(destLat * Math.PI / 180) -
                Math.sin(startLat * Math.PI / 180) * Math.cos(destLat * Math.PI / 180) * Math.cos((destLng - startLng) * Math.PI / 180);
      const brng = (Math.atan2(y, x) * 180) / Math.PI;
      return (brng + 360) % 360;
    }

    // Turn rate limiter: prevents abrupt camera snapping on sharp 90-degree street turns
    function smoothTurn(current, target, maxDeg) {
      const diff = (target - current + 540) % 360 - 180;
      const step = Math.max(-maxDeg, Math.min(maxDeg, diff * 0.07));
      return (current + step + 360) % 360;
    }

    let smoothBearing = 0;
    let smoothCamLng = 0;
    let smoothCamLat = 0;
    let lastProgressNotifyTime = 0;

    // Precalculate cumulative distances
    cumDistances = [0];
    for (let i = 1; i < validPoints.length; i++) {
      const d = haversine(validPoints[i - 1], validPoints[i]);
      totalComputedDistance += d;
      cumDistances.push(totalComputedDistance);
    }
    if (totalComputedDistance <= 0) totalComputedDistance = TOTAL_DISTANCE || 1;

    // Dynamic zoom scaling: As distance increases (e.g. 5k, 10k, 21k), reduce map view (zoom out)
    // so turns are graceful, wide panoramic sweeps rather than violent jumping across street corners
    function computeOptimalZoom(dist) {
      if (dist <= 800) return 16.2;
      if (dist <= 2500) return 15.5;
      if (dist <= 6000) return 14.8;
      if (dist <= 12000) return 14.2;
      if (dist <= 25000) return 13.6;
      return 13.2;
    }

    function computeOptimalPitch(dist) {
      if (dist <= 1500) return 62;
      if (dist <= 6000) return 58;
      if (dist <= 15000) return 54;
      return 50;
    }

    // Dynamic flight duration: gives longer distances breathing room to fly smoothly at comfortable speeds
    function computeDurationMs(dist) {
      const clamped = Math.max(500, Math.min(25000, dist));
      const t = (clamped - 500) / (25000 - 500);
      return Math.round(28000 + t * 22000); // 28s for short runs up to 50s for 25k
    }

    const OPTIMAL_ZOOM = computeOptimalZoom(totalComputedDistance);
    const OPTIMAL_PITCH = computeOptimalPitch(totalComputedDistance);
    const BASE_DURATION_MS = computeDurationMs(totalComputedDistance);

    // Lookahead and lead distances scale with distance to anticipate turns early
    const LOOKAHEAD_DIST = Math.max(35, Math.min(240, totalComputedDistance * 0.035));
    const CAM_LEAD_DIST = Math.max(12, Math.min(80, totalComputedDistance * 0.012));

    // Map style configuration (Clean base raster without hard DEM dependency)
    function getMapStyleSpec(styleType) {
      if (styleType === 'satellite') {
        return {
          version: 8,
          sources: {
            'satellite': {
              type: 'raster',
              tiles: [
                'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
              ],
              tileSize: 256,
              maxzoom: 19
            }
          },
          layers: [
            { id: 'satellite-layer', type: 'raster', source: 'satellite' }
          ]
        };
      } else {
        return {
          version: 8,
          sources: {
            'carto-dark': {
              type: 'raster',
              tiles: [
                'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
                'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
                'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png'
              ],
              tileSize: 256,
              maxzoom: 19
            }
          },
          layers: [
            { id: 'dark-layer', type: 'raster', source: 'carto-dark' }
          ]
        };
      }
    }

    function setup3DScene() {
      if (!map) return;
      const start = validPoints[0];
      const end = validPoints[validPoints.length - 1];

      // Add DEM terrain with safe fallback
      try {
        if (!map.getSource('terrain-dem')) {
          map.addSource('terrain-dem', {
            type: 'raster-dem',
            tiles: [
              'https://demotiles.maplibre.org/terrain-tiles/{z}/{x}/{y}.png'
            ],
            tileSize: 256,
            maxzoom: 12
          });
          map.setTerrain({ source: 'terrain-dem', exaggeration: 1.5 });
        }
      } catch (demErr) {
        console.warn('3D Terrain DEM unavailable:', demErr);
      }

      // Full route shadow/preview (semi-transparent guide)
      if (!map.getSource('full-route')) {
        map.addSource('full-route', {
          type: 'geojson',
          data: {
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates: validPoints.map(p => [p.longitude, p.latitude])
            }
          }
        });
        map.addLayer({
          id: 'full-route-casing',
          type: 'line',
          source: 'full-route',
          paint: {
            'line-color': 'rgba(255, 255, 255, 0.22)',
            'line-width': 4,
            'line-dasharray': [2, 2]
          }
        });
      }

      // Dynamic Animated Route
      if (!map.getSource('animated-route')) {
        map.addSource('animated-route', {
          type: 'geojson',
          data: {
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates: [[start.longitude, start.latitude], [start.longitude, start.latitude]]
            }
          }
        });

        // Glowing outer neon ribbon
        map.addLayer({
          id: 'route-glow',
          type: 'line',
          source: 'animated-route',
          paint: {
            'line-color': '#22C55E',
            'line-width': 9,
            'line-opacity': 0.55,
            'line-blur': 4
          }
        });

        // Sharp core neon ribbon
        map.addLayer({
          id: 'route-core',
          type: 'line',
          source: 'animated-route',
          paint: {
            'line-color': '#FFFFFF',
            'line-width': 4
          }
        });
      }

      // Start Dot Marker
      if (!document.getElementById('start-marker-dot')) {
        const startEl = document.createElement('div');
        startEl.id = 'start-marker-dot';
        startEl.className = 'route-endpoint-dot start-dot';
        new maplibregl.Marker({ element: startEl }).setLngLat([start.longitude, start.latitude]).addTo(map);
      }

      // Finish Dot Marker
      if (!document.getElementById('finish-marker-dot')) {
        const finishEl = document.createElement('div');
        finishEl.id = 'finish-marker-dot';
        finishEl.className = 'route-endpoint-dot finish-dot';
        new maplibregl.Marker({ element: finishEl }).setLngLat([end.longitude, end.latitude]).addTo(map);
      }

      // Animated Runner Avatar / Athlete Marker
      if (!runnerMarker) {
        const runnerEl = document.createElement('div');
        runnerEl.id = 'runner-avatar-marker';
        runnerEl.className = 'runner-avatar-wrapper';

        let inner = '<div class="runner-avatar-bounce">';
        inner += '<div class="runner-avatar-halo"></div>';
        inner += '<div class="runner-avatar-disc">';
        if (USER_AVATAR && USER_AVATAR.trim().length > 0) {
          inner += '<img src="' + USER_AVATAR + '" class="runner-avatar-img" onerror="this.style.display=\\'none\\';this.nextElementSibling.style.display=\\'block\\';" />';
          inner += '<svg class="runner-svg-icon" style="display:none;" viewBox="0 0 24 24" width="20" height="20" fill="#FFFFFF"><path d="M13.49 5.48c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm-3.6 13.9l1-4.4 2.1 2v6h2v-7.5l-2.1-2 .6-3c1.3 1.5 3.3 2.5 5.5 2.5v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1l-5.2 2.2v4.7h2v-3.4l1.8-.7-1.6 8.1-4.9-1-.4 2 6.5 1.4z"/></svg>';
          inner += '<div class="runner-mini-badge"><svg viewBox="0 0 24 24" width="10" height="10" fill="#FFFFFF"><path d="M13.49 5.48c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm-3.6 13.9l1-4.4 2.1 2v6h2v-7.5l-2.1-2 .6-3c1.3 1.5 3.3 2.5 5.5 2.5v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1l-5.2 2.2v4.7h2v-3.4l1.8-.7-1.6 8.1-4.9-1-.4 2 6.5 1.4z"/></svg></div>';
        } else {
          inner += '<svg class="runner-svg-icon" viewBox="0 0 24 24" width="22" height="22" fill="#FFFFFF"><path d="M13.49 5.48c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm-3.6 13.9l1-4.4 2.1 2v6h2v-7.5l-2.1-2 .6-3c1.3 1.5 3.3 2.5 5.5 2.5v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1l-5.2 2.2v4.7h2v-3.4l1.8-.7-1.6 8.1-4.9-1-.4 2 6.5 1.4z"/></svg>';
        }
        inner += '</div><div class="runner-avatar-shadow"></div>';
        inner += '</div>';

        runnerEl.innerHTML = inner;

        runnerMarker = new maplibregl.Marker({ element: runnerEl, anchor: 'center' })
          .setLngLat([start.longitude, start.latitude])
          .addTo(map);
      }
    }

    function initMap() {
      try {
        if (!validPoints || validPoints.length < 2) {
          notifyNative('NO_ROUTE', 'Not enough GPS points for 3D flyover');
          notifyNative('READY', { empty: true });
          return;
        }

        const start = validPoints[0];
        const initialBearing = validPoints.length > 1
          ? getBearing(validPoints[0].latitude, validPoints[0].longitude, validPoints[1].latitude, validPoints[1].longitude)
          : 0;
        smoothBearing = initialBearing;

        // Position camera slightly ahead scaled to route length
        const startLead = Math.min(totalComputedDistance, CAM_LEAD_DIST);
        const startCam = getPointAtDistance(startLead);
        smoothCamLng = startCam.longitude;
        smoothCamLat = startCam.latitude;

        map = new maplibregl.Map({
          container: 'map',
          style: getMapStyleSpec(currentMapStyle),
          center: [startCam.longitude, startCam.latitude],
          zoom: OPTIMAL_ZOOM,
          pitch: OPTIMAL_PITCH,
          bearing: initialBearing,
          attributionControl: false,
          interactive: true,
          preserveDrawingBuffer: true
        });

        let readyFired = false;
        function sendReadySignal() {
          if (readyFired) return;
          readyFired = true;
          notifyNative('READY', {
            totalDistance: totalComputedDistance,
            pointCount: validPoints.length
          });
        }

        // Safety fallback: dismiss loading screen after 2.5s even if external tiles take longer
        setTimeout(sendReadySignal, 2500);

        map.on('load', () => {
          try {
            setup3DScene();
            // Position camera and marker at start
            updateProgress(0, true);
          } catch (sceneErr) {
            console.warn('Error setting up 3D scene:', sceneErr);
          }
          sendReadySignal();

          // Auto-start cinematic flyover flight after short delay
          setTimeout(() => {
            if (window.FlyoverControls && typeof window.FlyoverControls.play === 'function') {
              window.FlyoverControls.play();
            }
          }, 450);
        });

        map.on('error', (e) => {
          console.warn('MapLibre event error:', e);
        });
      } catch (err) {
        notifyNative('ERROR', 'initMap failed: ' + (err ? err.message : 'unknown'));
        notifyNative('READY', { fallback: true });
      }
    }

    // High-precision route sampling at any distance along the path
    function getPointAtDistance(targetDist) {
      if (!validPoints || validPoints.length === 0) {
        return { latitude: 0, longitude: 0, altitude: 0, index: 0 };
      }
      if (validPoints.length === 1 || targetDist <= 0) {
        return {
          latitude: validPoints[0].latitude,
          longitude: validPoints[0].longitude,
          altitude: validPoints[0].altitude || 0,
          index: 0
        };
      }
      if (targetDist >= totalComputedDistance) {
        const last = validPoints[validPoints.length - 1];
        return {
          latitude: last.latitude,
          longitude: last.longitude,
          altitude: last.altitude || 0,
          index: validPoints.length - 1
        };
      }

      let idx = 0;
      while (idx < cumDistances.length - 1 && cumDistances[idx + 1] < targetDist) {
        idx++;
      }
      if (idx >= validPoints.length - 1) {
        const last = validPoints[validPoints.length - 1];
        return {
          latitude: last.latitude,
          longitude: last.longitude,
          altitude: last.altitude || 0,
          index: validPoints.length - 1
        };
      }

      const segStartDist = cumDistances[idx];
      const segEndDist = cumDistances[idx + 1];
      const segLen = segEndDist - segStartDist;
      const ratio = segLen > 0 ? (targetDist - segStartDist) / segLen : 0;

      const p1 = validPoints[idx];
      const p2 = validPoints[idx + 1];

      const lat = p1.latitude + (p2.latitude - p1.latitude) * ratio;
      const lng = p1.longitude + (p2.longitude - p1.longitude) * ratio;
      const alt = (typeof p1.altitude === 'number' && typeof p2.altitude === 'number')
        ? p1.altitude + (p2.altitude - p1.altitude) * ratio
        : (p1.altitude ?? 0);

      return {
        latitude: lat,
        longitude: lng,
        altitude: alt,
        index: idx
      };
    }

    // Animation loop
    let lastTimestamp = 0;

    function stepAnimation(timestamp) {
      if (!isPlaying) return;
      if (!lastTimestamp) lastTimestamp = timestamp;
      const delta = timestamp - lastTimestamp;
      lastTimestamp = timestamp;

      const stepProgress = (delta / BASE_DURATION_MS) * playbackSpeed;
      progress = Math.min(1.0, progress + stepProgress);

      updateProgress(progress, false);

      if (progress >= 1.0) {
        isPlaying = false;
        notifyNative('PLAYBACK_COMPLETE');
        if (mediaRecorder && mediaRecorder.state === 'recording') {
          setTimeout(() => mediaRecorder.stop(), 500);
        }
        return;
      }

      animationFrameId = window.requestAnimationFrame(stepAnimation);
    }

    function updateProgress(prog, isDirectSeek) {
      if (!map || !map.getSource('animated-route')) return;

      const currentDistance = prog * totalComputedDistance;
      const runnerState = getPointAtDistance(currentDistance);

      // Compute lookahead target along route for smooth drone camera steering
      const lookaheadDistance = Math.min(totalComputedDistance, currentDistance + LOOKAHEAD_DIST);
      const lookaheadState = getPointAtDistance(lookaheadDistance);

      let targetBearing = smoothBearing;
      if (lookaheadDistance > currentDistance + 2) {
        targetBearing = getBearing(
          runnerState.latitude,
          runnerState.longitude,
          lookaheadState.latitude,
          lookaheadState.longitude
        );
      } else if (validPoints.length >= 2) {
        const p1 = validPoints[validPoints.length - 2];
        const p2 = validPoints[validPoints.length - 1];
        targetBearing = getBearing(p1.latitude, p1.longitude, p2.latitude, p2.longitude);
      }

      if (isDirectSeek || !isPlaying) {
        smoothBearing = targetBearing;
      } else {
        // Damped turn rate limiter (max 1.7 degrees/frame) prevents camera snapping on sharp corners
        smoothBearing = smoothTurn(smoothBearing, targetBearing, 1.7);
      }

      // Camera lead point: positions camera slightly ahead so runner is in lower-third of view
      const camLeadDistance = Math.min(totalComputedDistance, currentDistance + CAM_LEAD_DIST);
      const targetCam = getPointAtDistance(camLeadDistance);

      // Low-pass filtered camera center: eliminates micro-jitter from noisy GPS coordinates
      if (isDirectSeek || !smoothCamLng) {
        smoothCamLng = targetCam.longitude;
        smoothCamLat = targetCam.latitude;
      } else {
        smoothCamLng += (targetCam.longitude - smoothCamLng) * 0.14;
        smoothCamLat += (targetCam.latitude - smoothCamLat) * 0.14;
      }

      // Smooth instantaneous camera placement with distance-scaled zoom and pitch
      map.jumpTo({
        center: [smoothCamLng, smoothCamLat],
        bearing: smoothBearing,
        pitch: OPTIMAL_PITCH,
        zoom: OPTIMAL_ZOOM
      });

      // Update runner marker position
      if (runnerMarker) {
        runnerMarker.setLngLat([runnerState.longitude, runnerState.latitude]);
      }

      // Update dynamic route line drawing
      const drawnCoords = validPoints.slice(0, runnerState.index + 1).map(p => [p.longitude, p.latitude]);
      drawnCoords.push([runnerState.longitude, runnerState.latitude]);
      if (drawnCoords.length < 2) {
        drawnCoords.push([runnerState.longitude, runnerState.latitude]);
      }

      const animSource = map.getSource('animated-route');
      if (animSource) {
        animSource.setData({
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: drawnCoords
          }
        });
      }

      // Live altitude calculation with DEM fallback
      let currentAlt = (typeof runnerState.altitude === 'number' && !isNaN(runnerState.altitude)) ? runnerState.altitude : 0;
      if (!currentAlt && map && typeof map.queryTerrainElevation === 'function') {
        try {
          const demElevation = map.queryTerrainElevation([runnerState.longitude, runnerState.latitude]);
          if (typeof demElevation === 'number' && !isNaN(demElevation)) {
            currentAlt = Math.round(demElevation);
          }
        } catch (e) {}
      }

      // Throttle HUD metrics to React Native (10 times/sec) to keep rendering at 60 FPS
      const now = Date.now();
      if (now - lastProgressNotifyTime > 100 || prog >= 1.0 || isDirectSeek) {
        lastProgressNotifyTime = now;
        const elapsedSec = prog * (TOTAL_DURATION || (totalComputedDistance / 3.0));
        notifyNative('PROGRESS', {
          progress: prog,
          currentDistanceMeters: currentDistance,
          currentElevationMeters: currentAlt,
          elapsedSeconds: Math.round(elapsedSec)
        });
      }
    }

    // Public control methods called via postMessage or injectJavaScript
    window.FlyoverControls = {
      play: function() {
        if (progress >= 1.0) progress = 0;
        isPlaying = true;
        lastTimestamp = 0;
        animationFrameId = window.requestAnimationFrame(stepAnimation);
        notifyNative('STATE_CHANGE', { isPlaying: true });
      },
      pause: function() {
        isPlaying = false;
        if (animationFrameId) window.cancelAnimationFrame(animationFrameId);
        lastTimestamp = 0;
        notifyNative('STATE_CHANGE', { isPlaying: false });
      },
      restart: function() {
        this.pause();
        progress = 0;
        const initialBrg = validPoints.length > 1
          ? getBearing(validPoints[0].latitude, validPoints[0].longitude, validPoints[1].latitude, validPoints[1].longitude)
          : 0;
        smoothBearing = initialBrg;
        smoothCamLng = 0;
        smoothCamLat = 0;
        updateProgress(0, true);
        notifyNative('PROGRESS', {
          progress: 0,
          currentDistanceMeters: 0,
          currentElevationMeters: validPoints[0]?.altitude || 0,
          elapsedSeconds: 0
        });
      },
      seek: function(val) {
        this.pause();
        progress = Math.max(0, Math.min(1.0, val));
        updateProgress(progress, true);
      },
      setSpeed: function(speed) {
        playbackSpeed = Math.max(0.25, Math.min(4.0, speed));
      },
      setStyle: function(newStyle) {
        if (newStyle === currentMapStyle || !map) return;
        currentMapStyle = newStyle;
        map.setStyle(getMapStyleSpec(newStyle));
        map.once('style.load', function() {
          try {
            setup3DScene();
            updateProgress(progress);
          } catch (e) {
            console.warn('Error re-applying route layers after style change:', e);
          }
        });
      },
      startRecording: function() {
        try {
          const canvas = map.getCanvas();
          if (!canvas) throw new Error('3D Map canvas not found');
          if (typeof canvas.captureStream !== 'function') {
            throw new Error('Canvas video recording is not supported on this device');
          }

          const stream = canvas.captureStream(30); // 30 FPS
          recordedChunks = [];

          let mimeType = 'video/mp4';
          if (typeof MediaRecorder === 'undefined') {
            throw new Error('MediaRecorder is not available on this device');
          }
          if (!MediaRecorder.isTypeSupported('video/mp4')) {
            mimeType = 'video/webm;codecs=vp9';
            if (!MediaRecorder.isTypeSupported(mimeType)) {
              mimeType = 'video/webm';
            }
          }

          mediaRecorder = new MediaRecorder(stream, {
            mimeType: mimeType,
            videoBitsPerSecond: 6000000 // 6 Mbps high quality
          });

          mediaRecorder.ondataavailable = function(e) {
            if (e.data && e.data.size > 0) {
              recordedChunks.push(e.data);
            }
          };

          mediaRecorder.onstop = function() {
            try {
              const blob = new Blob(recordedChunks, { type: mimeType });
              const reader = new FileReader();
              reader.onloadend = function() {
                const base64data = reader.result;
                notifyNative('RECORDING_EXPORT_READY', {
                  base64: base64data,
                  mimeType: mimeType,
                  size: blob.size
                });
              };
              reader.readAsDataURL(blob);
            } catch (blobErr) {
              notifyNative('ERROR', 'Failed to encode video blob: ' + blobErr.message);
            }
          };

          // Restart from beginning and record automatically at 1.5x speed
          this.restart();
          setTimeout(() => {
            try {
              mediaRecorder.start(100);
              this.play();
              notifyNative('RECORDING_STARTED');
            } catch (recErr) {
              notifyNative('ERROR', 'Failed to start video recorder: ' + recErr.message);
            }
          }, 600);
        } catch (err) {
          notifyNative('ERROR', 'Video recording error: ' + (err ? err.message : 'unknown'));
        }
      }
    };

    // Listen for commands from React Native
    window.addEventListener('message', function(event) {
      try {
        const msg = JSON.parse(event.data);
        if (msg.action && window.FlyoverControls[msg.action]) {
          window.FlyoverControls[msg.action](msg.payload);
        }
      } catch (e) {
        console.warn('Error handling message:', e);
      }
    });

    // Ensure MapLibre library is loaded before initializing map
    function ensureMapLibre(callback) {
      if (typeof maplibregl !== 'undefined') {
        callback();
        return;
      }
      var count = 0;
      var timer = setInterval(function() {
        count++;
        if (typeof maplibregl !== 'undefined') {
          clearInterval(timer);
          callback();
        } else if (count === 25) { // 1.25s: inject fallback CDN script
          var script = document.createElement('script');
          script.src = 'https://cdn.jsdelivr.net/npm/maplibre-gl@4.7.1/dist/maplibre-gl.js';
          script.onload = function() {
            if (typeof maplibregl !== 'undefined') {
              clearInterval(timer);
              callback();
            }
          };
          document.head.appendChild(script);
        } else if (count > 70) { // 3.5s timeout
          clearInterval(timer);
          notifyNative('ERROR', 'MapLibre GL script timed out from CDN');
          notifyNative('READY', { fallback: true });
        }
      }, 50);
    }

    function startEngine() {
      ensureMapLibre(function() {
        initMap();
      });
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', startEngine);
    } else {
      startEngine();
    }
  </script>
</body>
</html>`;
}
