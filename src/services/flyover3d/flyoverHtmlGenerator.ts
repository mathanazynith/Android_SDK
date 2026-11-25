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
  mapboxToken?: string | null;
  maptilerKey?: string | null;
}

export function generateFlyoverHtml(options: FlyoverOptions): string {
  const pointsJson = JSON.stringify(options.points || []);
  const title = (options.title || 'Workout Flyover').replace(/["\\]/g, '');
  const totalDistance = options.totalDistanceMeters || 0;
  const totalDuration = options.totalDurationSeconds || 0;
  const elevationGain = options.elevationGainMeters || 0;
  const initialStyle = options.initialStyle || 'satellite';
  const avatarUrl = options.avatarUrl ? options.avatarUrl.replace(/["\\]/g, '') : '';
  const rawMapboxToken = options.mapboxToken ? options.mapboxToken.trim().replace(/["\\]/g, '') : '';
  // Only use Mapbox if user provides a valid personal Mapbox token (pk.xxx)
  const mapboxToken = (rawMapboxToken.startsWith('pk.') && rawMapboxToken.length > 25) ? rawMapboxToken : '';
  const maptilerKey = options.maptilerKey ? options.maptilerKey.trim().replace(/["\\]/g, '') : '';

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

    /* Vignette & Atmospheric Alpine Horizon Haze */
    .cinematic-overlay {
      position: absolute; inset: 0; pointer-events: none;
      background: linear-gradient(to bottom, rgba(7, 22, 38, 0.42) 0%, transparent 22%, transparent 75%, rgba(9, 11, 10, 0.45) 100%),
                  radial-gradient(circle at center, transparent 48%, rgba(9, 11, 10, 0.35) 100%);
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
    const MAPBOX_TOKEN = "${mapboxToken}";
    const MAPTILER_KEY = "${maptilerKey}";
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

    // Calculate elevation profile first so zoom, speed & 3D relief adapt to mountains vs flat roads
    let minAlt = 999999;
    let maxAlt = -999999;
    for (let i = 0; i < validPoints.length; i++) {
      const a = validPoints[i].altitude;
      if (typeof a === 'number' && !isNaN(a) && a !== 0) {
        if (a < minAlt) minAlt = a;
        if (a > maxAlt) maxAlt = a;
      }
    }
    const altSpan = (maxAlt > minAlt && minAlt !== 999999) ? (maxAlt - minAlt) : (ELEVATION_GAIN || 0);
    const isMountainRoute = altSpan > 120 || ELEVATION_GAIN > 150;

    // Strava / FATMAP style average panoramic zoom:
    // Mountain & long routes zoom to 13.8-14.6 so full peaks, ridges & switchbacks are clearly visible at a calm speed.
    // Short road runs stay around 15.6-16.0 to see streets and houses clearly.
    function computeOptimalZoom(dist, mountain) {
      if (mountain) {
        if (dist <= 5000) return 14.6;
        if (dist <= 15000) return 14.2;
        return 13.8;
      }
      if (dist <= 2000) return 16.0;
      if (dist <= 6000) return 15.4;
      if (dist <= 15000) return 14.8;
      return 14.2;
    }

    function computeOptimalPitch(mountain) {
      return mountain ? 66 : 64;
    }

    // Dynamic flight duration: 30s for short runs up to 58s (within 30s-1min constraint) so long distances move at a calm, seeable speed
    function computeDurationMs(dist) {
      const clamped = Math.max(1000, Math.min(30000, dist));
      const t = (clamped - 1000) / (30000 - 1000);
      return Math.round(30000 + t * 28000); // 30s up to 58s
    }

    // Precompute route bounding box for the grand-finale pull-back overview
    let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
    for (let i = 0; i < validPoints.length; i++) {
      const p = validPoints[i];
      if (p.latitude < minLat) minLat = p.latitude;
      if (p.latitude > maxLat) maxLat = p.latitude;
      if (p.longitude < minLng) minLng = p.longitude;
      if (p.longitude > maxLng) maxLng = p.longitude;
    }
    const routeCenterLat = (minLat + maxLat) / 2;
    const routeCenterLng = (minLng + maxLng) / 2;
    const maxSpanDeg = Math.max(0.002, maxLat - minLat, maxLng - minLng);
    const OVERVIEW_ZOOM = Math.max(11.2, Math.min(15.2, Math.log2(360 / maxSpanDeg) - 1.15));

    // Strong Strava/FATMAP vertical exaggeration so mountains, ridges & valleys stand out dramatically in 3D
    const TERRAIN_EXAGGERATION = isMountainRoute ? 2.25 : 1.95;

    const OPTIMAL_ZOOM = computeOptimalZoom(totalComputedDistance, isMountainRoute);
    const OPTIMAL_PITCH = computeOptimalPitch(isMountainRoute);
    const BASE_DURATION_MS = computeDurationMs(totalComputedDistance);

    // Smooth lookahead & lead distances scaled for calm, readable polyline tracking
    const LOOKAHEAD_DIST = Math.max(60, Math.min(200, totalComputedDistance * 0.025));
    const CAM_LEAD_DIST = Math.max(30, Math.min(95, totalComputedDistance * 0.01));

    // Map style configuration with Genuine 3D Terrain DEM & Satellite Imagery
    // Priority: MapTiler (if key set) -> Mapbox (if token set) -> Mapterhorn + Esri/CARTO (free, no key)
    function getMapStyleSpec(styleType) {
      const hasMaptiler = MAPTILER_KEY && MAPTILER_KEY.trim().length > 8;
      const hasMapbox = !hasMaptiler && MAPBOX_TOKEN && MAPBOX_TOKEN.trim().length > 20 && MAPBOX_TOKEN.startsWith('pk.');

      const satelliteTiles = hasMaptiler
        ? ['https://api.maptiler.com/tiles/satellite-v2/{z}/{x}/{y}.jpg?key=' + MAPTILER_KEY]
        : hasMapbox
          ? [
              'https://api.mapbox.com/v4/mapbox.satellite/{z}/{x}/{y}@2x.webp?access_token=' + MAPBOX_TOKEN,
              'https://api.mapbox.com/v4/mapbox.satellite/{z}/{x}/{y}.webp?access_token=' + MAPBOX_TOKEN
            ]
          : ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'];

      const demSourceSpec = hasMaptiler
        ? {
            type: 'raster-dem',
            tiles: ['https://api.maptiler.com/tiles/terrain-rgb-v2/{z}/{x}/{y}.webp?key=' + MAPTILER_KEY],
            tileSize: 512,
            encoding: 'mapbox',
            maxzoom: 14
          }
        : hasMapbox
          ? {
              type: 'raster-dem',
              tiles: ['https://api.mapbox.com/v4/mapbox.terrain-rgb/{z}/{x}/{y}.pngraw?access_token=' + MAPBOX_TOKEN],
              tileSize: 256,
              encoding: 'mapbox',
              maxzoom: 14
            }
          : {
              type: 'raster-dem',
              tiles: ['https://tiles.mapterhorn.com/{z}/{x}/{y}.webp'],
              tileSize: 512,
              encoding: 'terrarium',
              maxzoom: 12
            };

      const sources = {
        'terrain-dem': demSourceSpec,
        // Dedicated hillshade DEM source so MapLibre renders crisp 3D mountain shadows with zero source-sharing warnings
        'hillshade-dem': Object.assign({}, demSourceSpec)
      };

      const layers = [];

      if (styleType === 'satellite') {
        sources['imagery'] = {
          type: 'raster',
          tiles: satelliteTiles,
          tileSize: hasMaptiler ? 512 : 256,
          maxzoom: (hasMaptiler || hasMapbox) ? 20 : 19
        };
        layers.push({
          id: 'imagery-layer',
          type: 'raster',
          source: 'imagery'
        });
        layers.push({
          id: 'terrain-hillshade',
          type: 'hillshade',
          source: 'hillshade-dem',
          paint: {
            'hillshade-exaggeration': 0.5,
            'hillshade-shadow-color': '#040810',
            'hillshade-highlight-color': '#ffffff',
            'hillshade-illumination-direction': 315
          }
        });
      } else {
        sources['carto-dark'] = {
          type: 'raster',
          tiles: hasMaptiler
            ? ['https://api.maptiler.com/maps/streets-v2-dark/256/{z}/{x}/{y}.png?key=' + MAPTILER_KEY]
            : [
                'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
                'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
                'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png'
              ],
          tileSize: 256,
          maxzoom: 19
        };
        layers.push({
          id: 'dark-layer',
          type: 'raster',
          source: 'carto-dark'
        });
        layers.push({
          id: 'dark-hillshade',
          type: 'hillshade',
          source: 'hillshade-dem',
          paint: {
            'hillshade-exaggeration': 0.65,
            'hillshade-shadow-color': '#020406',
            'hillshade-highlight-color': '#2563EB',
            'hillshade-illumination-direction': 315
          }
        });
      }

      return {
        version: 8,
        sources: sources,
        layers: layers,
        terrain: {
          source: 'terrain-dem',
          exaggeration: TERRAIN_EXAGGERATION
        },
        sky: {
          'sky-color': '#071626',
          'horizon-color': '#2a4964',
          'fog-color': '#111827',
          'horizon-fog-blend': 0.18
        }
      };
    }

    // Automatic fallback to Mapterhorn DEM + Esri World Imagery if MapTiler/Mapbox requests encounter errors
    let fallbackActivated = false;
    function activateGlobalFallback() {
      if (fallbackActivated || !map) return;
      fallbackActivated = true;
      console.warn('[3D Flyover] Activating Mapterhorn DEM & Esri World Imagery fallback');
      try {
        if (typeof map.setTerrain === 'function') {
          map.setTerrain(null);
        }
        if (map.getSource('terrain-dem')) {
          map.removeSource('terrain-dem');
        }
        map.addSource('terrain-dem', {
          type: 'raster-dem',
          tiles: [
            'https://tiles.mapterhorn.com/{z}/{x}/{y}.webp'
          ],
          tileSize: 512,
          encoding: 'terrarium',
          maxzoom: 12
        });
        map.setTerrain({ source: 'terrain-dem', exaggeration: TERRAIN_EXAGGERATION });

        if (map.getSource('imagery') && (MAPBOX_TOKEN || MAPTILER_KEY)) {
          if (map.getLayer('imagery-layer')) {
            map.removeLayer('imagery-layer');
          }
          map.removeSource('imagery');
          map.addSource('imagery', {
            type: 'raster',
            tiles: [
              'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
            ],
            tileSize: 256,
            maxzoom: 19
          });
          const beforeId = map.getLayer('full-route-casing') ? 'full-route-casing' : undefined;
          map.addLayer({ id: 'imagery-layer', type: 'raster', source: 'imagery' }, beforeId);
        }
      } catch (err) {
        console.warn('[3D Flyover] Fallback activation error:', err);
      }
    }

    function setup3DScene() {
      if (!map) return;
      const start = validPoints[0];
      const end = validPoints[validPoints.length - 1];

      // Guarantee 3D Terrain mesh is active on the map
      try {
        if (typeof map.getTerrain === 'function' && !map.getTerrain() && map.getSource('terrain-dem')) {
          map.setTerrain({ source: 'terrain-dem', exaggeration: TERRAIN_EXAGGERATION });
        }
        if (typeof map.setSky === 'function') {
          map.setSky({
            'sky-color': '#071626',
            'horizon-color': '#2a4964',
            'fog-color': '#111827',
            'horizon-fog-blend': 0.18
          });
        }
      } catch (terrainErr) {
        console.warn('[3D Flyover] 3D Terrain notice:', terrainErr);
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
          maxPitch: 85,
          attributionControl: false,
          interactive: true,
          preserveDrawingBuffer: true
        });

        map.on('error', (e) => {
          const hasMaptiler = MAPTILER_KEY && MAPTILER_KEY.trim().length > 8;
          const hasMapbox = !hasMaptiler && MAPBOX_TOKEN && MAPBOX_TOKEN.trim().length > 20 && MAPBOX_TOKEN.startsWith('pk.');
          if ((hasMaptiler || hasMapbox) && e && (e.sourceId === 'terrain-dem' || e.sourceId === 'imagery') && !fallbackActivated) {
            activateGlobalFallback();
          }
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
          console.warn('MapLibre event error:', e && e.error ? (e.error.message || e.error) : e);
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
    let isRecordingExport = false;
    let savedPlaybackSpeed = 1.0;
    let recCanvas = null;
    let recCtx = null;

    function copyFrameToRecorderCanvas() {
      if (!isRecordingExport || !recCtx || !recCanvas || !map) return;
      try {
        const mapCanvas = map.getCanvas();
        if (mapCanvas && mapCanvas.width > 0 && mapCanvas.height > 0) {
          recCtx.drawImage(mapCanvas, 0, 0, recCanvas.width, recCanvas.height);
        }
      } catch (e) {}
    }

    function stepAnimation(timestamp) {
      if (!isPlaying) return;
      if (!lastTimestamp) lastTimestamp = timestamp;
      const rawDelta = Math.max(0, timestamp - lastTimestamp);
      lastTimestamp = timestamp;
      // Use real-time delta so recorded gallery playback speed matches the in-app preview 1:1
      const delta = rawDelta;

      const stepProgress = (delta / BASE_DURATION_MS) * playbackSpeed;
      progress = Math.min(1.0, progress + stepProgress);

      updateProgress(progress, false);
      if (isRecordingExport) {
        if (map && typeof map.triggerRepaint === 'function') {
          map.triggerRepaint();
        }
        copyFrameToRecorderCanvas();
      }

      if (progress >= 1.0) {
        isPlaying = false;
        notifyNative('PLAYBACK_COMPLETE');
        if (mediaRecorder && mediaRecorder.state === 'recording') {
          setTimeout(() => {
            try {
              mediaRecorder.stop();
            } catch (e) {}
          }, 100);
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
        // Ultra-smooth cinema gimbal turn rate limiter (max 1.2 degrees/frame)
        smoothBearing = smoothTurn(smoothBearing, targetBearing, 1.2);
      }

      // Camera lead point: positions camera slightly ahead so runner is in lower-third of view
      const camLeadDistance = Math.min(totalComputedDistance, currentDistance + CAM_LEAD_DIST);
      const targetCam = getPointAtDistance(camLeadDistance);

      // Smooth low-pass camera center: eliminates micro-jitter from noisy GPS coordinates
      if (isDirectSeek || !smoothCamLng) {
        smoothCamLng = targetCam.longitude;
        smoothCamLat = targetCam.latitude;
      } else {
        smoothCamLng += (targetCam.longitude - smoothCamLng) * 0.09;
        smoothCamLat += (targetCam.latitude - smoothCamLat) * 0.09;
      }

      // 3-Act Relive-style camera choreography:
      // Act 1 (0% -> 8%): Smooth opening dive from overview into close-up chase view
      // Act 2 (8% -> 88%): Intimate close-up chase flight along roads, houses & hills
      // Act 3 (88% -> 100%): Grand-finale pull-back to reveal the entire completed route
      function easeInOut(t) {
        return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      }

      let activeZoom = OPTIMAL_ZOOM;
      let activePitch = OPTIMAL_PITCH;
      let activeCenterLng = smoothCamLng;
      let activeCenterLat = smoothCamLat;

      if (prog < 0.08) {
        const t = easeInOut(prog / 0.08);
        activeZoom = (OPTIMAL_ZOOM - 1.4) + t * 1.4;
        activePitch = 48 + t * (OPTIMAL_PITCH - 48);
      } else if (prog > 0.88) {
        const t = easeInOut((prog - 0.88) / 0.12);
        activeZoom = OPTIMAL_ZOOM + t * (OVERVIEW_ZOOM - OPTIMAL_ZOOM);
        activePitch = OPTIMAL_PITCH + t * (36 - OPTIMAL_PITCH);
        activeCenterLng = smoothCamLng + t * (routeCenterLng - smoothCamLng);
        activeCenterLat = smoothCamLat + t * (routeCenterLat - smoothCamLat);
      }

      map.jumpTo({
        center: [activeCenterLng, activeCenterLat],
        bearing: smoothBearing,
        pitch: activePitch,
        zoom: activeZoom
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

      // Live altitude calculation: Query genuine DEM 3D terrain elevation at current point
      let currentAlt = 0;
      if (map && typeof map.queryTerrainElevation === 'function') {
        try {
          const demElevation = map.queryTerrainElevation([runnerState.longitude, runnerState.latitude]);
          if (typeof demElevation === 'number' && !isNaN(demElevation)) {
            currentAlt = Math.round(demElevation);
          }
        } catch (e) {}
      }
      if (!currentAlt && typeof runnerState.altitude === 'number' && !isNaN(runnerState.altitude)) {
        currentAlt = Math.round(runnerState.altitude);
      }

      // Throttle HUD metrics to React Native (10 times/sec) to keep rendering at 60 FPS
      const now = Date.now();
      if (now - lastProgressNotifyTime > 100 || prog >= 1.0 || isDirectSeek) {
        lastProgressNotifyTime = now;
        const elapsedSec = prog * (TOTAL_DURATION || (totalComputedDistance / 3.0));
        notifyNative('PROGRESS', {
          progress: prog,
          currentDistanceMeters: currentDistance,
          currentElevationMeters: Math.max(0, currentAlt),
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
          if (isRecordingExport) return;
          const mapCanvas = map.getCanvas();
          if (!mapCanvas) throw new Error('3D Map canvas not found');
          if (typeof MediaRecorder === 'undefined') {
            throw new Error('MediaRecorder is not available on this device');
          }

          // Use a dedicated 16-aligned 720p recording canvas so Android/iOS hardware decoders
          // never fail on odd WebView pixel dimensions, and encoding runs 3x faster.
          const aspect = (mapCanvas.height && mapCanvas.width) ? (mapCanvas.height / mapCanvas.width) : (16 / 9);
          const recWidth = 720;
          const recHeight = Math.max(480, Math.round((recWidth * aspect) / 16) * 16);
          recCanvas = document.createElement('canvas');
          recCanvas.width = recWidth;
          recCanvas.height = recHeight;
          recCtx = recCanvas.getContext('2d');

          const captureSource = (recCtx && typeof recCanvas.captureStream === 'function') ? recCanvas : mapCanvas;
          if (typeof captureSource.captureStream !== 'function') {
            throw new Error('Canvas video recording is not supported on this device');
          }
          const stream = captureSource.captureStream(30); // Steady 30 FPS stream
          recordedChunks = [];

          // On Android WebView, H.264 (codec=1) often fails with "Can't use VEA" producing 0:00 videos.
          // VP8 WebM uses Chromium's reliable software encoder and works on 100% of Android devices.
          const isAndroidUA = /Android/i.test(navigator.userAgent || '');
          const mimeCandidates = isAndroidUA
            ? [
                'video/webm;codecs=vp8',
                'video/webm;codecs=vp9',
                'video/webm',
                'video/mp4;codecs=avc1.42E01E',
                'video/mp4'
              ]
            : [
                'video/mp4;codecs=avc1.42E01E',
                'video/mp4;codecs=h264',
                'video/mp4',
                'video/webm;codecs=vp8',
                'video/webm'
              ];
          let mimeType = '';
          for (let i = 0; i < mimeCandidates.length; i++) {
            if (MediaRecorder.isTypeSupported(mimeCandidates[i])) {
              mimeType = mimeCandidates[i];
              break;
            }
          }
          if (!mimeType) {
            throw new Error('No supported video recording codec found on this device');
          }

          let recordingStartTime = Date.now();

          // Patch WebM EBML Info element with actual Duration so Android Gallery doesn't show 0:00
          function patchWebmDurationBuffer(arrayBuffer, durationMs) {
            try {
              const bytes = new Uint8Array(arrayBuffer);
              const scanLimit = Math.min(bytes.length - 12, 4096);
              // Find Info element ID: 0x15 0x49 0xA9 0x66
              let infoIdx = -1;
              for (let i = 0; i < scanLimit; i++) {
                if (bytes[i] === 0x15 && bytes[i + 1] === 0x49 && bytes[i + 2] === 0xA9 && bytes[i + 3] === 0x66) {
                  infoIdx = i;
                  break;
                }
              }
              if (infoIdx < 0) return arrayBuffer;

              // Parse VINT size of Info element
              const sizePos = infoIdx + 4;
              const firstByte = bytes[sizePos];
              let vintLen = 1;
              let mask = 0x80;
              while (vintLen <= 8 && (firstByte & mask) === 0) {
                vintLen++;
                mask >>= 1;
              }
              if (vintLen > 8 || sizePos + vintLen >= bytes.length) return arrayBuffer;

              // Unknown size (all 1s) check
              let infoSize = firstByte & (mask - 1);
              for (let j = 1; j < vintLen; j++) {
                infoSize = infoSize * 256 + bytes[sizePos + j];
              }
              const infoBodyStart = sizePos + vintLen;
              const infoBodyEnd = Math.min(bytes.length, infoBodyStart + infoSize);

              // Check if Duration (0x44 0x89) already exists inside Info
              for (let k = infoBodyStart; k < infoBodyEnd - 4; k++) {
                if (bytes[k] === 0x44 && bytes[k + 1] === 0x89) {
                  const durSizeByte = bytes[k + 2];
                  if (durSizeByte === 0x88 && k + 11 <= bytes.length) {
                    const view = new DataView(bytes.buffer, bytes.byteOffset + k + 3, 8);
                    view.setFloat64(0, durationMs, false);
                    return bytes.buffer;
                  } else if (durSizeByte === 0x84 && k + 7 <= bytes.length) {
                    const view = new DataView(bytes.buffer, bytes.byteOffset + k + 3, 4);
                    view.setFloat32(0, durationMs, false);
                    return bytes.buffer;
                  }
                }
              }

              // Duration tag not present: insert 11-byte [0x44, 0x89, 0x88, <float64>] at start of Info body
              // Only update if new infoSize fits in existing VINT width
              const newInfoSize = infoSize + 11;
              const maxForVint = Math.pow(2, 7 * vintLen) - 2;
              if (newInfoSize > maxForVint) return arrayBuffer;

              const out = new Uint8Array(bytes.length + 11);
              out.set(bytes.subarray(0, infoBodyStart), 0);
              // Write updated VINT size
              let rem = newInfoSize;
              for (let j = vintLen - 1; j >= 0; j--) {
                out[sizePos + j] = rem & 0xff;
                rem = Math.floor(rem / 256);
              }
              out[sizePos] |= mask;

              // Write Duration element (0x44 0x89, size 8 = 0x88, float64 BE)
              out[infoBodyStart] = 0x44;
              out[infoBodyStart + 1] = 0x89;
              out[infoBodyStart + 2] = 0x88;
              const dv = new DataView(out.buffer, infoBodyStart + 3, 8);
              dv.setFloat64(0, durationMs, false);

              out.set(bytes.subarray(infoBodyStart), infoBodyStart + 11);
              return out.buffer;
            } catch (e) {
              return arrayBuffer;
            }
          }

          mediaRecorder = new MediaRecorder(stream, {
            mimeType: mimeType,
            videoBitsPerSecond: 1800000 // 1.8 Mbps: crisp mobile video, fast encoding & smaller gallery file
          });

          mediaRecorder.ondataavailable = function(e) {
            if (e.data && e.data.size > 0) {
              recordedChunks.push(e.data);
            }
          };

          mediaRecorder.onstop = function() {
            isRecordingExport = false;
            playbackSpeed = savedPlaybackSpeed;
            recCanvas = null;
            recCtx = null;
            const actualDurationMs = Math.max(1000, Date.now() - recordingStartTime);
            try {
              const rawBlob = new Blob(recordedChunks, { type: mimeType });
              if (!rawBlob || rawBlob.size === 0) {
                notifyNative('RECORDING_ERROR', 'Recorded video was empty');
                return;
              }

              const finalizeAndSend = function(finalBlob) {
                const reader = new FileReader();
                reader.onloadend = function() {
                  try {
                    const fullDataUrl = String(reader.result || '');
                    const commaIdx = fullDataUrl.indexOf(',');
                    const rawBase64 = commaIdx >= 0 ? fullDataUrl.slice(commaIdx + 1) : fullDataUrl;
                    const CHUNK_SIZE = 1024 * 1024;
                    const totalChunks = Math.ceil(rawBase64.length / CHUNK_SIZE);
                    notifyNative('RECORDING_CHUNK_START', {
                      mimeType: mimeType,
                      size: finalBlob.size,
                      totalChunks: totalChunks
                    });
                    for (let idx = 0; idx < totalChunks; idx++) {
                      const slice = rawBase64.slice(idx * CHUNK_SIZE, (idx + 1) * CHUNK_SIZE);
                      notifyNative('RECORDING_CHUNK', {
                        index: idx,
                        data: slice
                      });
                    }
                    notifyNative('RECORDING_CHUNK_END', {
                      mimeType: mimeType,
                      size: finalBlob.size
                    });
                  } catch (sendErr) {
                    notifyNative('RECORDING_ERROR', 'Failed to transfer video: ' + (sendErr ? sendErr.message : 'unknown'));
                  }
                };
                reader.onerror = function() {
                  notifyNative('RECORDING_ERROR', 'Failed to read recorded video blob');
                };
                reader.readAsDataURL(finalBlob);
              };

              if (mimeType.includes('webm') && typeof rawBlob.arrayBuffer === 'function') {
                rawBlob.arrayBuffer().then(function(buf) {
                  const patchedBuf = patchWebmDurationBuffer(buf, actualDurationMs);
                  finalizeAndSend(new Blob([patchedBuf], { type: mimeType }));
                }).catch(function() {
                  finalizeAndSend(rawBlob);
                });
              } else {
                finalizeAndSend(rawBlob);
              }
            } catch (blobErr) {
              notifyNative('RECORDING_ERROR', 'Failed to encode video blob: ' + (blobErr ? blobErr.message : 'unknown'));
            }
          };

          // Lock speed to 1x so gallery playback matches app speed 1:1 within 30s-40s
          savedPlaybackSpeed = playbackSpeed;
          playbackSpeed = 1.0;
          isRecordingExport = true;
          this.restart();
          setTimeout(() => {
            try {
              copyFrameToRecorderCanvas();
              recordingStartTime = Date.now();
              mediaRecorder.start(500);
              this.play();
              notifyNative('RECORDING_STARTED', {
                durationSeconds: Math.round(BASE_DURATION_MS / 1000)
              });
            } catch (recErr) {
              isRecordingExport = false;
              playbackSpeed = savedPlaybackSpeed;
              notifyNative('RECORDING_ERROR', 'Failed to start video recorder: ' + (recErr ? recErr.message : 'unknown'));
            }
          }, 150);
        } catch (err) {
          isRecordingExport = false;
          playbackSpeed = savedPlaybackSpeed;
          notifyNative('RECORDING_ERROR', 'Video recording error: ' + (err ? err.message : 'unknown'));
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
