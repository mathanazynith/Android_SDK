import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native';
import { useTheme } from '../contexts/ThemeContext';

interface ScrollTimePickerProps {
  label?: string;
  value?: string;
  allowEmpty?: boolean;
  hint?: string;
  error?: string;
  onChange: (value: string) => void;
  maxHours?: number;
  accentColor?: string;
  compact?: boolean;
}

const ITEM_HEIGHT = 50;
const COMPACT_ITEM_HEIGHT = 46;
const VISIBLE_ITEMS = 3;
const SCROLL_VIEW_HEIGHT = ITEM_HEIGHT * VISIBLE_ITEMS;
import {
  calculateRolloverTime,
  DEFAULT_TIME_VALUE,
  formatTimeValue,
  parseTimeValue,
  type TimeParts,
} from '../src/utils/timePickerUtils';
export {
  calculateRolloverTime,
  DEFAULT_TIME_VALUE,
  formatTimeValue,
  parseTimeValue,
  type TimeParts,
};

const WheelValue = ({
  value,
  unit,
  selected,
  accentColor,
  compact = false,
}: {
  value: number;
  unit: string;
  selected: boolean;
  accentColor?: string;
  compact?: boolean;
}) => {
  const { colors } = useTheme();
  const highlightColor = accentColor || colors.primary;
  return (
    <Text
      style={[
        compact ? styles.itemTextCompact : styles.itemText,
        { color: colors.textTertiary, opacity: selected ? 1 : 0.72 },
        selected && { color: colors.textPrimary },
      ]}
    >
      <Text>{String(value).padStart(2, "0")}</Text>
      <Text style={{ color: selected ? highlightColor : colors.textSecondary }}>
        {unit}
      </Text>
    </Text>
  );
};

const CYCLE_COUNT = 15;
const CENTER_CYCLE = Math.floor(CYCLE_COUNT / 2); // 7

interface LoopingItem {
  index: number;
  value: number;
}

/**
 * ScrollTimePicker Component
 *
 * A wheel/picker-style time selector with three scrollable columns:
 * - Hours (0-99)
 * - Minutes (0-59, looping)
 * - Seconds (0-59, looping)
 *
 * Scrolling seconds past 59 wraps to 00 and increments minutes (+1).
 * Scrolling minutes past 59 wraps to 00 and increments hours (+1).
 * Hours can also be scrolled independently.
 */
export const ScrollTimePicker: React.FC<ScrollTimePickerProps> = ({
  label,
  value,
  allowEmpty = false,
  hint,
  error,
  onChange,
  maxHours = 99,
  accentColor,
  compact = false,
}) => {
  const { colors } = useTheme();
  const [time, setTime] = useState<TimeParts>(() => parseTimeValue(value, maxHours, allowEmpty));
  const timeRef = useRef(time);
  const didApplyDefaultRef = useRef(false);

  const itemHeight = compact ? COMPACT_ITEM_HEIGHT : ITEM_HEIGHT;
  const scrollViewHeight = itemHeight * VISIBLE_ITEMS;

  // Refs for scroll views
  const hoursScrollRef = useRef<ScrollView>(null);
  const minutesScrollRef = useRef<ScrollView>(null);
  const secondsScrollRef = useRef<ScrollView>(null);

  // Generate range arrays
  const hoursArray = useMemo(() => {
    return Array.from({ length: maxHours + 1 }, (_, i) => i);
  }, [maxHours]);

  const minutesArray = useMemo<LoopingItem[]>(() => {
    const items: LoopingItem[] = [];
    for (let cycle = 0; cycle < CYCLE_COUNT; cycle += 1) {
      for (let min = 0; min < 60; min += 1) {
        items.push({ index: cycle * 60 + min, value: min });
      }
    }
    return items;
  }, []);

  const secondsArray = useMemo<LoopingItem[]>(() => {
    const items: LoopingItem[] = [];
    for (let cycle = 0; cycle < CYCLE_COUNT; cycle += 1) {
      for (let sec = 0; sec < 60; sec += 1) {
        items.push({ index: cycle * 60 + sec, value: sec });
      }
    }
    return items;
  }, []);

  const selectedTime = useMemo(() => formatTimeValue(time), [time]);

  // Initial content offset for instantaneous layout on mount
  const initialTime = useMemo(() => parseTimeValue(value, maxHours, allowEmpty), []);
  const initialSecondsOffset = useMemo(
    () => (CENTER_CYCLE * 60 + initialTime.seconds) * itemHeight,
    [initialTime.seconds, itemHeight]
  );
  const initialMinutesOffset = useMemo(
    () => (CENTER_CYCLE * 60 + initialTime.minutes) * itemHeight,
    [initialTime.minutes, itemHeight]
  );
  const initialHoursOffset = useMemo(
    () => initialTime.hours * itemHeight,
    [initialTime.hours, itemHeight]
  );

  // Position tracking refs
  const secondsIndexRef = useRef<number>(CENTER_CYCLE * 60 + initialTime.seconds);
  const minutesIndexRef = useRef<number>(CENTER_CYCLE * 60 + initialTime.minutes);
  const hoursIndexRef = useRef<number>(initialTime.hours);
  const isProgrammaticScrollRef = useRef<{ minutes?: boolean; hours?: boolean }>({});

  const scrollIndexFromOffset = useCallback((offsetY: number, length: number) => {
    const index = Math.round(offsetY / itemHeight);
    return Math.max(0, Math.min(index, length - 1));
  }, [itemHeight]);

  // Helper functions to scroll to specific values
  const scrollToHour = useCallback((targetHour: number, animated: boolean = true) => {
    if (hoursScrollRef.current) {
      hoursScrollRef.current.scrollTo({
        y: Math.max(0, targetHour * itemHeight),
        animated,
      });
    }
  }, [itemHeight]);

  const scrollToMinuteIndex = useCallback((targetIndex: number, animated: boolean = true) => {
    if (minutesScrollRef.current) {
      minutesScrollRef.current.scrollTo({
        y: Math.max(0, targetIndex * itemHeight),
        animated,
      });
    }
  }, [itemHeight]);

  const scrollToSecondIndex = useCallback((targetIndex: number, animated: boolean = true) => {
    if (secondsScrollRef.current) {
      secondsScrollRef.current.scrollTo({
        y: Math.max(0, targetIndex * itemHeight),
        animated,
      });
    }
  }, [itemHeight]);

  const scrollToTime = useCallback((nextTime: TimeParts, animated = false) => {
    const secIndex = CENTER_CYCLE * 60 + nextTime.seconds;
    const minIndex = CENTER_CYCLE * 60 + nextTime.minutes;
    secondsIndexRef.current = secIndex;
    minutesIndexRef.current = minIndex;
    hoursIndexRef.current = nextTime.hours;

    scrollToHour(nextTime.hours, animated);
    scrollToMinuteIndex(minIndex, animated);
    scrollToSecondIndex(secIndex, animated);
  }, [scrollToHour, scrollToMinuteIndex, scrollToSecondIndex]);

  // Silent re-centering to keep infinite scroll bounds around the middle cycle
  const checkAndRecenter = useCallback((axis: 'seconds' | 'minutes', currentIndex: number, currentValue: number) => {
    const currentCycle = Math.floor(currentIndex / 60);
    if (currentCycle < 3 || currentCycle > 11) {
      const recenteredIndex = CENTER_CYCLE * 60 + currentValue;
      setTimeout(() => {
        if (axis === 'seconds') {
          secondsIndexRef.current = recenteredIndex;
          secondsScrollRef.current?.scrollTo({
            y: recenteredIndex * itemHeight,
            animated: false,
          });
        } else {
          minutesIndexRef.current = recenteredIndex;
          minutesScrollRef.current?.scrollTo({
            y: recenteredIndex * itemHeight,
            animated: false,
          });
        }
      }, 50);
    }
  }, [itemHeight]);

  // A parent update after a user selection must not reset the wheels. Only
  // synchronize when an externally supplied value actually differs.
  useEffect(() => {
    const nextTime = parseTimeValue(value, maxHours, allowEmpty);
    if (formatTimeValue(timeRef.current) === formatTimeValue(nextTime)) return;

    timeRef.current = nextTime;
    setTime(nextTime);
    requestAnimationFrame(() => scrollToTime(nextTime));
  }, [allowEmpty, maxHours, scrollToTime, value]);

  useEffect(() => {
    const timer = setTimeout(() => {
      scrollToTime(timeRef.current, false);
    }, 30);
    return () => clearTimeout(timer);
  }, [scrollToTime]);

  // Keep the displayed default, parent answer, validation, and pace in sync
  // even when a time question is opened with no saved value yet.
  useEffect(() => {
    if (!allowEmpty && !value && !didApplyDefaultRef.current) {
      didApplyDefaultRef.current = true;
      onChange(formatTimeValue(timeRef.current));
    }
  }, [allowEmpty, onChange, value]);

  const finalizeSecondsScroll = useCallback((offsetY: number) => {
    const rawIndex = Math.round(offsetY / itemHeight);
    const newIndex = Math.max(0, Math.min(rawIndex, secondsArray.length - 1));
    const prevIndex = secondsIndexRef.current;

    if (newIndex === prevIndex) return;

    secondsIndexRef.current = newIndex;
    const { nextTime, cycleDelta } = calculateRolloverTime(
      timeRef.current,
      'seconds',
      newIndex,
      prevIndex,
      maxHours,
    );

    timeRef.current = nextTime;
    setTime(nextTime);
    onChange(formatTimeValue(nextTime));

    if (cycleDelta !== 0) {
      // Update minutes wheel with smooth animation
      const prevMinIndex = minutesIndexRef.current;
      const targetMinIndex = prevMinIndex + cycleDelta;
      minutesIndexRef.current = targetMinIndex;
      isProgrammaticScrollRef.current.minutes = true;
      scrollToMinuteIndex(targetMinIndex, true);

      // If hours changed as well, animate hours wheel
      if (nextTime.hours !== hoursIndexRef.current) {
        hoursIndexRef.current = nextTime.hours;
        isProgrammaticScrollRef.current.hours = true;
        scrollToHour(nextTime.hours, true);
      }

      checkAndRecenter('minutes', targetMinIndex, nextTime.minutes);
    }

    checkAndRecenter('seconds', newIndex, nextTime.seconds);
  }, [checkAndRecenter, itemHeight, maxHours, onChange, scrollToHour, scrollToMinuteIndex, secondsArray.length]);

  const finalizeMinutesScroll = useCallback((offsetY: number) => {
    if (isProgrammaticScrollRef.current.minutes) {
      isProgrammaticScrollRef.current.minutes = false;
      return;
    }

    const rawIndex = Math.round(offsetY / itemHeight);
    const newIndex = Math.max(0, Math.min(rawIndex, minutesArray.length - 1));
    const prevIndex = minutesIndexRef.current;

    if (newIndex === prevIndex) return;

    minutesIndexRef.current = newIndex;
    const { nextTime, cycleDelta } = calculateRolloverTime(
      timeRef.current,
      'minutes',
      newIndex,
      prevIndex,
      maxHours,
    );

    timeRef.current = nextTime;
    setTime(nextTime);
    onChange(formatTimeValue(nextTime));

    if (cycleDelta !== 0 && nextTime.hours !== hoursIndexRef.current) {
      hoursIndexRef.current = nextTime.hours;
      isProgrammaticScrollRef.current.hours = true;
      scrollToHour(nextTime.hours, true);
    }

    checkAndRecenter('minutes', newIndex, nextTime.minutes);
  }, [checkAndRecenter, itemHeight, maxHours, minutesArray.length, onChange, scrollToHour]);

  const finalizeHoursScroll = useCallback((offsetY: number) => {
    if (isProgrammaticScrollRef.current.hours) {
      isProgrammaticScrollRef.current.hours = false;
      return;
    }

    const newHour = scrollIndexFromOffset(offsetY, hoursArray.length);
    if (newHour === timeRef.current.hours) return;

    hoursIndexRef.current = newHour;
    const { nextTime } = calculateRolloverTime(
      timeRef.current,
      'hours',
      newHour,
      timeRef.current.hours,
      maxHours,
    );

    timeRef.current = nextTime;
    setTime(nextTime);
    onChange(formatTimeValue(nextTime));
  }, [hoursArray.length, maxHours, onChange, scrollIndexFromOffset]);


  return (
    <View style={[styles.card, compact && styles.cardCompact]}>
      {label ? <Text style={[styles.label, { color: colors.text }]}>{label}</Text> : null}
      {/* Time Picker */}
      <View
        style={[
          styles.pickerContainer,
          {
            height: scrollViewHeight,
            borderRadius: compact ? 12 : 20,
            backgroundColor: colors.surface,
            borderColor: accentColor ? `${accentColor}35` : colors.border,
          },
        ]}
      >
        <View
          style={[
            styles.highlightOverlay,
            {
              height: itemHeight,
              transform: [{ translateY: -itemHeight / 2 }],
            },
          ]}
          pointerEvents="none"
        >
          <View
            style={[
              styles.centerLine,
              accentColor
                ? {
                    backgroundColor: `${accentColor}12`,
                    borderTopColor: `${accentColor}2E`,
                    borderBottomColor: `${accentColor}2E`,
                  }
                : undefined,
            ]}
          />
        </View>

        {/* Hours Column */}
        <View style={[styles.columnWrapper, { height: scrollViewHeight }]}>
          <ScrollView
            ref={hoursScrollRef}
            style={[styles.scrollColumn, { height: scrollViewHeight }]}
            contentContainerStyle={{
              paddingTop: itemHeight,
              paddingBottom: itemHeight,
            }}
            contentOffset={{ x: 0, y: initialHoursOffset }}
            scrollEventThrottle={16}
            onMomentumScrollEnd={(event) => finalizeHoursScroll(event.nativeEvent.contentOffset.y)}
            onScrollEndDrag={(event) => finalizeHoursScroll(event.nativeEvent.contentOffset.y)}
            scrollEnabled={true}
            nestedScrollEnabled={true}
            showsVerticalScrollIndicator={false}
            snapToInterval={itemHeight}
            snapToAlignment="center"
            decelerationRate="fast"
          >
            {hoursArray.map((hour) => (
              <View key={`hour-${hour}`} style={[styles.item, { height: itemHeight }]}>
                <WheelValue
                  value={hour}
                  unit="h"
                  selected={hour === time.hours}
                  accentColor={accentColor}
                  compact={compact}
                />
              </View>
            ))}
          </ScrollView>
        </View>

        {/* Separator */}
        <Text
          style={[
            styles.separator,
            compact && styles.separatorCompact,
            { height: itemHeight, lineHeight: itemHeight },
          ]}
        >
          :
        </Text>

        {/* Minutes Column */}
        <View style={[styles.columnWrapper, { height: scrollViewHeight }]}>
          <ScrollView
            ref={minutesScrollRef}
            style={[styles.scrollColumn, { height: scrollViewHeight }]}
            contentContainerStyle={{
              paddingTop: itemHeight,
              paddingBottom: itemHeight,
            }}
            contentOffset={{ x: 0, y: initialMinutesOffset }}
            scrollEventThrottle={16}
            onMomentumScrollEnd={(event) => finalizeMinutesScroll(event.nativeEvent.contentOffset.y)}
            onScrollEndDrag={(event) => finalizeMinutesScroll(event.nativeEvent.contentOffset.y)}
            scrollEnabled={true}
            nestedScrollEnabled={true}
            showsVerticalScrollIndicator={false}
            snapToInterval={itemHeight}
            snapToAlignment="center"
            decelerationRate="fast"
          >
            {minutesArray.map((item) => (
              <View key={`minute-${item.index}`} style={[styles.item, { height: itemHeight }]}>
                <WheelValue
                  value={item.value}
                  unit="m"
                  selected={item.value === time.minutes}
                  accentColor={accentColor}
                  compact={compact}
                />
              </View>
            ))}
          </ScrollView>
        </View>

        {/* Separator */}
        <Text
          style={[
            styles.separator,
            compact && styles.separatorCompact,
            { height: itemHeight, lineHeight: itemHeight },
          ]}
        >
          :
        </Text>

        {/* Seconds Column */}
        <View style={[styles.columnWrapper, { height: scrollViewHeight }]}>
          <ScrollView
            ref={secondsScrollRef}
            style={[styles.scrollColumn, { height: scrollViewHeight }]}
            contentContainerStyle={{
              paddingTop: itemHeight,
              paddingBottom: itemHeight,
            }}
            contentOffset={{ x: 0, y: initialSecondsOffset }}
            scrollEventThrottle={16}
            onMomentumScrollEnd={(event) => finalizeSecondsScroll(event.nativeEvent.contentOffset.y)}
            onScrollEndDrag={(event) => finalizeSecondsScroll(event.nativeEvent.contentOffset.y)}
            scrollEnabled={true}
            nestedScrollEnabled={true}
            showsVerticalScrollIndicator={false}
            snapToInterval={itemHeight}
            snapToAlignment="center"
            decelerationRate="fast"
          >
            {secondsArray.map((item) => (
              <View key={`second-${item.index}`} style={[styles.item, { height: itemHeight }]}>
                <WheelValue
                  value={item.value}
                  unit="s"
                  selected={item.value === time.seconds}
                  accentColor={accentColor}
                  compact={compact}
                />
              </View>
            ))}
          </ScrollView>
        </View>
      </View>

      {/* Selected time display */}
      <View
        style={[
          compact ? styles.selectedTimeContainerCompact : styles.selectedTimeContainer,
          {
            backgroundColor: colors.surfaceRaised,
            borderColor: accentColor ? `${accentColor}44` : colors.border,
            borderWidth: 1,
          },
        ]}
      >
        <Text
          style={[
            compact ? styles.selectedLabelCompact : styles.selectedLabel,
            { color: colors.textSecondary },
          ]}
        >
          Selected:
        </Text>
        <Text
          style={[
            compact ? styles.selectedTimeCompact : styles.selectedTime,
            { color: accentColor || colors.textPrimary },
          ]}
        >
          {selectedTime}
        </Text>
      </View>

      {/* Error message */}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    marginTop: 8,
    marginBottom: 8,
  },

  cardCompact: {
    marginTop: 6,
    marginBottom: 6,
  },

  label: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
  },

  hint: {
    color: '#8E8E93',
    fontSize: 12,
    marginBottom: 10,
  },

  pickerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: SCROLL_VIEW_HEIGHT,
    backgroundColor: '#1A1A1A',
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#303236',
    position: 'relative',
  },

  columnWrapper: {
    flex: 1,
    height: SCROLL_VIEW_HEIGHT,
    overflow: 'hidden',
    zIndex: 1,
  },

  scrollColumn: {
    flex: 1,
    height: SCROLL_VIEW_HEIGHT,
  },

  item: {
    height: ITEM_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
  },

  itemText: {
    fontSize: 18,
    fontWeight: '500',
    color: '#9CA3AF',
    opacity: 0.35,
    textAlign: 'center',
  },

  itemTextCompact: {
    fontSize: 18,
    fontWeight: '500',
    color: '#9CA3AF',
    opacity: 0.35,
    textAlign: 'center',
  },

  itemTextSelected: {
    fontSize: 20,
    fontWeight: '600',
    color: '#FFFFFF',
    opacity: 1,
  },

  selectedUnit: {
    color: '#4ADE80',
  },

  inactiveUnit: {
    color: '#9CA3AF',
  },

  separator: {
    fontSize: 20,
    fontWeight: '600',
    color: '#FFFFFF',
    height: ITEM_HEIGHT,
    lineHeight: ITEM_HEIGHT,
    textAlign: 'center',
    textAlignVertical: 'center',
    marginHorizontal: 8,
    zIndex: 1,
  },

  separatorCompact: {
    fontSize: 18,
    marginHorizontal: 6,
  },

  scrollContainer: {
    paddingTop: ITEM_HEIGHT,
    paddingBottom: ITEM_HEIGHT,
  },

  highlightOverlay: {
    position: 'absolute',
    top: '50%',
    left: 0,
    right: 0,
    height: ITEM_HEIGHT,
    transform: [{ translateY: -ITEM_HEIGHT / 2 }],
    alignItems: 'stretch',
    zIndex: 0,
    pointerEvents: 'none',
  },

  centerLine: {
    flex: 1,
    backgroundColor: 'rgba(52, 199, 89, 0.07)',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderTopColor: 'rgba(52, 199, 89, 0.14)',
    borderBottomColor: 'rgba(52, 199, 89, 0.14)',
  },

  selectedTimeContainer: {
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#202124',
    borderRadius: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  selectedTimeContainerCompact: {
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#202124',
    borderRadius: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  selectedLabel: {
    color: '#8E8E93',
    fontSize: 13,
    fontWeight: '500',
  },

  selectedLabelCompact: {
    color: '#8E8E93',
    fontSize: 12,
    fontWeight: '500',
  },

  selectedTime: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 2,
  },

  selectedTimeCompact: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 1.5,
  },

  errorText: {
    color: '#FF5252',
    fontSize: 12,
    marginTop: 8,
    fontWeight: '400',
  },
});
