import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useRef } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Colors } from "../constants/theme";
import {
  formatSecondsToPace,
  getPaceUnitLabel,
  type DistanceUnitType,
} from "../src/utils/workoutCalculations";

const ITEM_HEIGHT = 32;
const VISIBLE_ITEMS = 3;
const SCROLL_HEIGHT = ITEM_HEIGHT * VISIBLE_ITEMS;
const MINUTES_LIST = Array.from({ length: 60 }, (_, i) => i + 1); // 1 to 60 mins
const SECONDS_LIST = Array.from({ length: 60 }, (_, i) => i); // 00 to 59 (60 seconds)
const PACE_DIFF_MIN_SEC = 15; // Minimum difference in seconds

interface TargetPaceRangePickerProps {
  fasterPaceSec: number;
  slowerPaceSec: number;
  onChange: (fasterSec: number, slowerSec: number) => void;
  unit: DistanceUnitType;
  accentColor?: string;
}

interface PaceCardProps {
  title: string;
  paceSec: number;
  onPaceChange: (nextSec: number) => void;
  accentColor: string;
  unit: DistanceUnitType;
}

function PaceCard({
  title,
  paceSec,
  onPaceChange,
  accentColor,
  unit,
}: PaceCardProps) {
  const minScrollRef = useRef<ScrollView>(null);
  const secScrollRef = useRef<ScrollView>(null);
  const isInternalScrollRef = useRef(false);

  const minutes = Math.max(1, Math.min(60, Math.floor(paceSec / 60)));
  const seconds = Math.max(0, Math.min(59, paceSec % 60));

  // Scroll minute wheel to position
  const scrollToMinute = useCallback((targetMin: number, animated = true) => {
    const y = Math.max(0, (targetMin - 1) * ITEM_HEIGHT);
    minScrollRef.current?.scrollTo({ y, animated });
  }, []);

  // Scroll second wheel to position
  const scrollToSecond = useCallback((targetSec: number, animated = true) => {
    const secIndex = Math.max(0, Math.min(59, targetSec));
    const y = Math.max(0, secIndex * ITEM_HEIGHT);
    secScrollRef.current?.scrollTo({ y, animated });
  }, []);

  // Sync wheels on external change
  useEffect(() => {
    if (!isInternalScrollRef.current) {
      scrollToMinute(minutes, false);
      scrollToSecond(seconds, false);
    }
  }, [minutes, scrollToMinute, scrollToSecond, seconds]);

  // Handle minute wheel scroll end
  const handleMinScrollEnd = useCallback(
    (offsetY: number) => {
      isInternalScrollRef.current = true;
      const index = Math.round(offsetY / ITEM_HEIGHT);
      const selectedMin = Math.max(1, Math.min(60, index + 1));
      if (selectedMin !== minutes) {
        try {
          Haptics.selectionAsync();
        } catch {}
        onPaceChange(selectedMin * 60 + seconds);
      }
      setTimeout(() => {
        isInternalScrollRef.current = false;
      }, 60);
    },
    [minutes, onPaceChange, seconds]
  );

  // Handle second wheel scroll end
  const handleSecScrollEnd = useCallback(
    (offsetY: number) => {
      isInternalScrollRef.current = true;
      const index = Math.max(
        0,
        Math.min(59, Math.round(offsetY / ITEM_HEIGHT))
      );
      if (index !== seconds) {
        try {
          Haptics.selectionAsync();
        } catch {}
        onPaceChange(minutes * 60 + index);
      }
      setTimeout(() => {
        isInternalScrollRef.current = false;
      }, 60);
    },
    [minutes, onPaceChange, seconds]
  );

  // Handle minute tap
  const handleSelectMin = useCallback(
    (m: number) => {
      try {
        Haptics.selectionAsync();
      } catch {}
      scrollToMinute(m, true);
      onPaceChange(m * 60 + seconds);
    },
    [onPaceChange, scrollToMinute, seconds]
  );

  // Handle second tap
  const handleSelectSec = useCallback(
    (s: number) => {
      try {
        Haptics.selectionAsync();
      } catch {}
      scrollToSecond(s, true);
      onPaceChange(minutes * 60 + s);
    },
    [minutes, onPaceChange, scrollToSecond]
  );

  // Stepper buttons handler (+5s / -5s)
  const handleAdjustStep = useCallback(
    (deltaSeconds: number) => {
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch {}

      let nextSec = seconds + deltaSeconds;
      let nextMin = minutes;

      if (nextSec >= 60) {
        nextSec -= 60;
        if (nextMin < 60) {
          nextMin += 1;
        }
      } else if (nextSec < 0) {
        nextSec += 60;
        if (nextMin > 1) {
          nextMin -= 1;
        }
      }

      scrollToMinute(nextMin, true);
      scrollToSecond(nextSec, true);
      onPaceChange(nextMin * 60 + nextSec);
    },
    [minutes, onPaceChange, scrollToMinute, scrollToSecond, seconds]
  );

  const paceUnit = getPaceUnitLabel(unit);

  return (
    <View style={[styles.stepperCard, { borderColor: `${accentColor}35` }]}>
      {/* Title */}
      <Text style={styles.stepperLabel}>{title}</Text>

      {/* Middle: Scrollable Timer for both Mins & Secs */}
      <View style={styles.wheelContainer}>
        {/* Center Highlight Pill */}
        <View
          style={[
            styles.wheelCenterPill,
            {
              backgroundColor: `${accentColor}18`,
              borderColor: `${accentColor}45`,
            },
          ]}
          pointerEvents="none"
        />

        {/* Minutes Wheel */}
        <ScrollView
          ref={minScrollRef}
          style={styles.wheelColumn}
          contentContainerStyle={styles.wheelContent}
          nestedScrollEnabled={true}
          showsVerticalScrollIndicator={false}
          snapToInterval={ITEM_HEIGHT}
          snapToAlignment="center"
          decelerationRate="fast"
          onMomentumScrollEnd={(e) =>
            handleMinScrollEnd(e.nativeEvent.contentOffset.y)
          }
          onScrollEndDrag={(e) =>
            handleMinScrollEnd(e.nativeEvent.contentOffset.y)
          }
        >
          {MINUTES_LIST.map((m) => {
            const isSelected = m === minutes;
            return (
              <TouchableOpacity
                key={`min-${m}`}
                style={styles.wheelItem}
                onPress={() => handleSelectMin(m)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.wheelText,
                    isSelected
                      ? [styles.wheelTextActive, { color: accentColor }]
                      : styles.wheelTextInactive,
                  ]}
                >
                  {String(m).padStart(2, "0")}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Colon Separator */}
        <View style={styles.colonBox}>
          <Text style={[styles.colonText, { color: accentColor }]}>:</Text>
        </View>

        {/* Seconds Wheel */}
        <ScrollView
          ref={secScrollRef}
          style={styles.wheelColumn}
          contentContainerStyle={styles.wheelContent}
          nestedScrollEnabled={true}
          showsVerticalScrollIndicator={false}
          snapToInterval={ITEM_HEIGHT}
          snapToAlignment="center"
          decelerationRate="fast"
          onMomentumScrollEnd={(e) =>
            handleSecScrollEnd(e.nativeEvent.contentOffset.y)
          }
          onScrollEndDrag={(e) =>
            handleSecScrollEnd(e.nativeEvent.contentOffset.y)
          }
        >
          {SECONDS_LIST.map((s) => {
            const isSelected = s === seconds;
            return (
              <TouchableOpacity
                key={`sec-${s}`}
                style={styles.wheelItem}
                onPress={() => handleSelectSec(s)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.wheelText,
                    isSelected
                      ? [styles.wheelTextActive, { color: accentColor }]
                      : styles.wheelTextInactive,
                  ]}
                >
                  {String(s).padStart(2, "0")}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Unit label below the wheel */}
      <Text style={styles.unitUnderWheel}>{paceUnit}</Text>

      {/* Old Design: -5s / +5s Circular Buttons Row */}
      <View style={styles.stepperButtonsRow}>
        <TouchableOpacity
          style={[styles.stepperBtn, { backgroundColor: `${accentColor}18` }]}
          onPress={() => handleAdjustStep(-5)}
          activeOpacity={0.7}
          accessibilityLabel={`Decrease ${title} by 5 seconds`}
        >
          <Feather name="minus" size={18} color={accentColor} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.stepperBtn, { backgroundColor: `${accentColor}18` }]}
          onPress={() => handleAdjustStep(5)}
          activeOpacity={0.7}
          accessibilityLabel={`Increase ${title} by 5 seconds`}
        >
          <Feather name="plus" size={18} color={accentColor} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

export function TargetPaceRangePicker({
  fasterPaceSec,
  slowerPaceSec,
  onChange,
  unit,
  accentColor = Colors.primary,
}: TargetPaceRangePickerProps) {
  // Ensure constraint: slower >= faster + PACE_DIFF_MIN_SEC (15s)
  const handleFasterChange = useCallback(
    (nextFasterRaw: number) => {
      const nextFaster = Math.max(
        60,
        Math.min(3600 - PACE_DIFF_MIN_SEC, nextFasterRaw)
      );
      let nextSlower = slowerPaceSec;
      if (nextFaster + PACE_DIFF_MIN_SEC > nextSlower) {
        nextSlower = Math.min(3600, nextFaster + PACE_DIFF_MIN_SEC);
      }
      onChange(nextFaster, nextSlower);
    },
    [onChange, slowerPaceSec]
  );

  const handleSlowerChange = useCallback(
    (nextSlowerRaw: number) => {
      const nextSlower = Math.max(
        60 + PACE_DIFF_MIN_SEC,
        Math.min(3600, nextSlowerRaw)
      );
      let nextFaster = fasterPaceSec;
      if (nextSlower - PACE_DIFF_MIN_SEC < nextFaster) {
        nextFaster = Math.max(60, nextSlower - PACE_DIFF_MIN_SEC);
      }
      onChange(nextFaster, nextSlower);
    },
    [fasterPaceSec, onChange]
  );

  const fasterStr = formatSecondsToPace(fasterPaceSec, unit, false);
  const slowerStr = formatSecondsToPace(slowerPaceSec, unit, false);
  const unitLabel = getPaceUnitLabel(unit);

  const medianSec = Math.round((fasterPaceSec + slowerPaceSec) / 2);
  const medianStr = formatSecondsToPace(medianSec, unit, true);

  return (
    <View style={styles.container}>
      {/* Top Header Summary Row */}
      <View style={styles.summaryRow}>
        <View style={styles.summaryLeft}>
          <Text style={styles.rangeText}>
            {fasterStr}–{slowerStr}{" "}
            <Text style={styles.summaryUnit}>{unitLabel}</Text>
          </Text>
          <Text style={styles.diffBadge}>
            Diff: {Math.max(15, slowerPaceSec - fasterPaceSec)}s (min 15s)
          </Text>
        </View>

        <View
          style={[
            styles.medianBadge,
            {
              backgroundColor: `${accentColor}18`,
              borderColor: `${accentColor}35`,
            },
          ]}
        >
          <Text style={[styles.medianBadgeText, { color: accentColor }]}>
            Median: {medianStr}
          </Text>
        </View>
      </View>

      {/* Two Pace Cards side by side in old layout */}
      <View style={styles.stepperRow}>
        <PaceCard
          title="Fastest pace"
          paceSec={fasterPaceSec}
          onPaceChange={handleFasterChange}
          accentColor={accentColor}
          unit={unit}
        />
        <PaceCard
          title="Lowest pace"
          paceSec={slowerPaceSec}
          onPaceChange={handleSlowerChange}
          accentColor={accentColor}
          unit={unit}
        />
      </View>

      {/* Instructional Helper */}
      <Text style={styles.helperText}>
        Scroll minutes &amp; seconds in the middle or tap - / + to adjust by 5s.
        Minimum 15s difference is maintained.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  summaryLeft: {
    flexDirection: "column",
  },
  rangeText: {
    fontSize: 20,
    fontWeight: "700",
    color: Colors.text,
    letterSpacing: 0.5,
  },
  summaryUnit: {
    fontSize: 13,
    fontWeight: "500",
    color: Colors.textSecondary,
  },
  diffBadge: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
    fontWeight: "500",
  },
  medianBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  medianBadgeText: {
    fontSize: 12,
    fontWeight: "600",
  },
  stepperRow: {
    flexDirection: "row",
    gap: 12,
  },
  stepperCard: {
    flex: 1,
    backgroundColor: "#262629",
    borderRadius: 14,
    padding: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#3A3A3E",
  },
  stepperLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.textSecondary,
    marginBottom: 6,
  },
  wheelContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: SCROLL_HEIGHT,
    width: "100%",
    position: "relative",
    marginVertical: 4,
  },
  wheelCenterPill: {
    position: "absolute",
    top: ITEM_HEIGHT,
    left: 8,
    right: 8,
    height: ITEM_HEIGHT,
    borderRadius: 8,
    borderWidth: 1,
    zIndex: 0,
  },
  wheelColumn: {
    flex: 1,
    height: SCROLL_HEIGHT,
    zIndex: 1,
  },
  wheelContent: {
    paddingTop: ITEM_HEIGHT,
    paddingBottom: ITEM_HEIGHT,
  },
  wheelItem: {
    height: ITEM_HEIGHT,
    justifyContent: "center",
    alignItems: "center",
  },
  wheelText: {
    fontSize: 16,
    textAlign: "center",
  },
  wheelTextActive: {
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  wheelTextInactive: {
    fontSize: 15,
    fontWeight: "500",
    color: Colors.textMuted,
    opacity: 0.35,
  },
  colonBox: {
    width: 14,
    height: ITEM_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
  colonText: {
    fontSize: 20,
    fontWeight: "800",
    lineHeight: 22,
  },
  unitUnderWheel: {
    fontSize: 11,
    fontWeight: "500",
    color: Colors.textMuted,
    marginBottom: 10,
    marginTop: 2,
  },
  stepperButtonsRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  stepperBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  helperText: {
    color: Colors.textMuted,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 10,
    textAlign: "center",
  },
});
