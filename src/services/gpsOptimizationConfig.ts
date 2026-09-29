/**
 * Centralized configuration for GPS point selection and route optimization.
 *
 * All thresholds for adaptive point selection, GPS filtering, and route
 * simplification are defined here for easy tuning and consistency across
 * the location tracking pipeline.
 */

export interface GpsOptimizationConfig {
  // ============================================================
  // GPS VALIDATION & NOISE FILTERING
  // ============================================================

  /** Maximum GPS accuracy radius (meters) to accept a GPS sample during live tracking */
  maxAccuracyMetersLive: number;

  /** Maximum GPS accuracy radius (meters) to accept a GPS sample during save filtering */
  maxAccuracyMetersSave: number;

  /** Minimum movement distance (meters) to consider a GPS sample meaningful */
  minMovementDistanceMeters: number;

  /** Maximum realistic running/walking speed (m/s) - prevents GPS jump detection */
  maxReasonableSpeedMetersPerSecond: number;

  /** Maximum realistic jump distance (meters) - anything larger is rejected as GPS error */
  maxJumpDistanceMeters: number;

  // ============================================================
  // INDOOR DRIFT DETECTION
  // ============================================================

  /** Maximum radius (meters) to classify as stationary indoor drift */
  indoorDriftMaxRadiusMeters: number;

  /** Minimum duration (seconds) to analyze for drift pattern */
  indoorDriftMinDurationSeconds: number;

  /** Minimum wander ratio (travelled_distance / radius) to detect drift */
  indoorDriftMinWanderRatio: number;

  // ============================================================
  // ADAPTIVE POINT SELECTION DURING SAVE
  // ============================================================

  /** Heading change threshold (degrees) to classify as a TURN (>= this value) */
  headingChangeTurnThresholdDegrees: number;

  /** Heading change threshold (degrees) to classify as a CURVE (>= this, < turn threshold) */
  headingChangeCurveThresholdDegrees: number;

  /** For STRAIGHT segments: minimum distance from last retained point (meters) */
  straightLineMinDistanceMeters: number;

  /** For STRAIGHT segments: maximum distance before must retain (meters) */
  straightLineMaxDistanceMeters: number;

  /** For CURVE segments: minimum distance from last retained point (meters) */
  curveLineMinDistanceMeters: number;

  /** For CURVE segments: maximum distance before must retain (meters) */
  curveLineMaxDistanceMeters: number;

  /** For TURN segments: minimum distance from last retained point (meters) */
  turnLineMinDistanceMeters: number;

  /** For TURN segments: maximum distance before must retain (meters) */
  turnLineMaxDistanceMeters: number;

  /** Speed change threshold (m/s) to consider significant - may trigger point retention */
  significantSpeedChangeMetersPerSecond: number;

  /** Minimum time (seconds) between retained points for distance-based retention */
  minDisplayIntervalSeconds: number;

  /** Maximum distance gap (meters) in final optimized polyline for density preservation */
  maxFinalPointGapMeters: number;

  // ============================================================
  // RDP (RAMER-DOUGLAS-PEUCKER) SIMPLIFICATION TOLERANCES
  // ============================================================

  /** RDP tolerance (meters) for STRAIGHT line segments */
  rdpStraightToleranceMeters: number;

  /** RDP tolerance (meters) for CURVE segments */
  rdpCurveToleranceMeters: number;

  /** RDP tolerance (meters) for TURN segments */
  rdpTurnToleranceMeters: number;

  // ============================================================
  // LOGGING & DIAGNOSTICS
  // ============================================================

  /** Frequency of raw GPS logging (log every Nth sample, 1 = every sample, 15 = every 15th) */
  rawGpsLogFrequency: number;

  /** Enable detailed point acceptance/rejection logging during filtering */
  enableDetailedFilterLogging: boolean;

  /** Enable detailed movement analysis logging during optimization */
  enableDetailedMovementAnalysisLogging: boolean;

  /** Enable distance validation logging */
  enableDistanceValidationLogging: boolean;
}

/**
 * Production defaults optimized for outdoor running and indoor walking.
 * Values are tuned to:
 * - Accept meaningful movement while filtering GPS noise
 * - Preserve turns and curves in the final route
 * - Minimize point count for straight sections
 * - Maintain accurate distance calculation
 */
export const DEFAULT_GPS_OPTIMIZATION_CONFIG: GpsOptimizationConfig = {
  // GPS Validation
  maxAccuracyMetersLive: 50,        // Live display: slightly loose for responsiveness
  maxAccuracyMetersSave: 50,        // Save filtering: consistent with live
  minMovementDistanceMeters: 0.5,   // Any movement above GPS noise floor
  maxReasonableSpeedMetersPerSecond: 16, // ~57 km/h, reasonable for running
  maxJumpDistanceMeters: 80,        // Reject obvious GPS teleports

  // Indoor Drift Detection
  indoorDriftMaxRadiusMeters: 30,   // Room-sized area
  indoorDriftMinDurationSeconds: 90, // Must wander for at least 1.5 minutes
  indoorDriftMinWanderRatio: 6,     // Travelled 6x the net displacement

  // Adaptive Point Selection
  headingChangeTurnThresholdDegrees: 20,     // >= 20° is a TURN
  headingChangeCurveThresholdDegrees: 5,     // >= 5° (< 20°) is a CURVE
  straightLineMinDistanceMeters: 1,          // Straight: retain after 1m
  straightLineMaxDistanceMeters: 3,          // Straight: must retain after 3m
  curveLineMinDistanceMeters: 1,             // Curve: retain after 1m
  curveLineMaxDistanceMeters: 2,             // Curve: must retain after 2m
  turnLineMinDistanceMeters: 1,              // Turn: retain after 1m
  turnLineMaxDistanceMeters: 2,              // Turn: must retain after 2m
  significantSpeedChangeMetersPerSecond: 0.5, // 0.5 m/s speed change is notable
  minDisplayIntervalSeconds: 1,              // At least 1 second between points
  maxFinalPointGapMeters: 5,                 // Preserve density every 5m

  // RDP Tolerances
  rdpStraightToleranceMeters: 1.5,  // Straight: tight tolerance (small simplification)
  rdpCurveToleranceMeters: 1,       // Curve: very tight (preserve shape)
  rdpTurnToleranceMeters: 0.5,      // Turn: extremely tight (preserve angle)

  // Logging
  rawGpsLogFrequency: 15,                    // Log every 15th raw GPS point
  enableDetailedFilterLogging: true,         // Show each point's decision
  enableDetailedMovementAnalysisLogging: true, // Show heading/speed analysis
  enableDistanceValidationLogging: true,     // Show distance calculations
};

/**
 * Get the global GPS optimization config.
 * Can be overridden for testing or tuning.
 */
let globalConfig = DEFAULT_GPS_OPTIMIZATION_CONFIG;

export function getGpsOptimizationConfig(): GpsOptimizationConfig {
  return globalConfig;
}

export function setGpsOptimizationConfig(config: Partial<GpsOptimizationConfig>): void {
  globalConfig = { ...globalConfig, ...config };
  console.log('[GPS Config] Configuration updated:', globalConfig);
}

export function resetGpsOptimizationConfig(): void {
  globalConfig = DEFAULT_GPS_OPTIMIZATION_CONFIG;
  console.log('[GPS Config] Configuration reset to defaults');
}
