import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native';
import { BRAND_GREEN, useTheme } from '../contexts/ThemeContext';

interface ScrollTimePickerProps {
  label?: string;
  value?: string;
  allowEmpty?: boolean;
  hint?: string;
  error?: string;
  onChange: (value: string) => void;
  maxHours?: number;
}

const ITEM_HEIGHT = 50;
const VISIBLE_ITEMS = 3;
const SCROLL_VIEW_HEIGHT = ITEM_HEIGHT * VISIBLE_ITEMS;
export const DEFAULT_TIME_VALUE = '01:00:00';

type TimeAxis = 'hours' | 'minutes' | 'seconds';
type TimeParts = { hours: number; minutes: number; seconds: number };

const parseTimeComponent = (part: string, maxValue: number) => {
  const parsed = Number.parseInt(part, 10);
  return Number.isFinite(parsed) ? Math.min(Math.max(parsed, 0), maxValue) : 0;
};

const parseTimeValue = (timeValue: string | undefined, maxHours: number, allowEmpty = false): TimeParts => {
  const parts = String(timeValue || (allowEmpty ? '00:00:00' : DEFAULT_TIME_VALUE)).split(':');
  return {
    hours: parseTimeComponent(parts[0] || '0', maxHours),
    minutes: parseTimeComponent(parts[1] || '0', 59),
    seconds: parseTimeComponent(parts[2] || '0', 59),
  };
};

const formatTimeValue = ({ hours, minutes, seconds }: TimeParts) =>
  `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

const WheelValue = ({ value, unit, selected }: { value: number; unit: string; selected: boolean }) => {
  const { colors } = useTheme();
  return <Text style={[styles.itemText, { color: colors.textTertiary, opacity: selected ? 1 : 0.72 }, selected && { color: colors.textPrimary }] }>
    <Text>{String(value).padStart(2, '0')}</Text>
    <Text style={{ color: selected ? colors.primary : colors.textSecondary }}>{unit}</Text>
  </Text>;
};

/**
 * ScrollTimePicker Component
 *
 * A wheel/picker-style time selector with three scrollable columns:
 * - Hours (0-99)
 * - Minutes (0-59)
 * - Seconds (0-59)
 *
 * Provides visual feedback with a centered highlight and displays
 * the selected time in HH:MM:SS format below the picker.
 */
export const ScrollTimePicker: React.FC<ScrollTimePickerProps> = ({
  label,
  value,
  allowEmpty = false,
  hint,
  error,
  onChange,
  maxHours = 99,
}) => {
  const { colors } = useTheme();
  const [time, setTime] = useState<TimeParts>(() => parseTimeValue(value, maxHours, allowEmpty));
  const timeRef = useRef(time);
  const didApplyDefaultRef = useRef(false);

  // Refs for scroll views
  const hoursScrollRef = useRef<ScrollView>(null);
  const minutesScrollRef = useRef<ScrollView>(null);
  const secondsScrollRef = useRef<ScrollView>(null);

  // Generate range arrays
  const hoursArray = useMemo(() => {
    return Array.from({ length: maxHours + 1 }, (_, i) => i);
  }, [maxHours]);

  const minutesArray = useMemo(() => {
    return Array.from({ length: 60 }, (_, i) => i);
  }, []);

  const secondsArray = useMemo(() => {
    return Array.from({ length: 60 }, (_, i) => i);
  }, []);

  const selectedTime = useMemo(() => formatTimeValue(time), [time]);

  const scrollIndexFromOffset = useCallback((offsetY: number, length: number) => {
    const index = Math.round(offsetY / ITEM_HEIGHT);
    return Math.max(0, Math.min(index, length - 1));
  }, []);

  // Helper functions to scroll to specific values
  const scrollToHour = useCallback((targetHour: number, animated: boolean = true) => {
    if (hoursScrollRef.current) {
      hoursScrollRef.current.scrollTo({
        y: Math.max(0, targetHour * ITEM_HEIGHT),
        animated,
      });
    }
  }, []);

  const scrollToMinute = useCallback((targetMinute: number, animated: boolean = true) => {
    if (minutesScrollRef.current) {
      minutesScrollRef.current.scrollTo({
        y: Math.max(0, targetMinute * ITEM_HEIGHT),
        animated,
      });
    }
  }, []);

  const scrollToSecond = useCallback((targetSecond: number, animated: boolean = true) => {
    if (secondsScrollRef.current) {
      secondsScrollRef.current.scrollTo({
        y: Math.max(0, targetSecond * ITEM_HEIGHT),
        animated,
      });
    }
  }, []);

  const scrollToTime = useCallback((nextTime: TimeParts, animated = false) => {
    scrollToHour(nextTime.hours, animated);
    scrollToMinute(nextTime.minutes, animated);
    scrollToSecond(nextTime.seconds, animated);
  }, [scrollToHour, scrollToMinute, scrollToSecond]);

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
    const frame = requestAnimationFrame(() => scrollToTime(timeRef.current));
    return () => cancelAnimationFrame(frame);
  }, [scrollToTime]);

  // Keep the displayed default, parent answer, validation, and pace in sync
  // even when a time question is opened with no saved value yet.
  useEffect(() => {
    if (!allowEmpty && !value && !didApplyDefaultRef.current) {
      didApplyDefaultRef.current = true;
      onChange(formatTimeValue(timeRef.current));
    }
  }, [allowEmpty, onChange, value]);

  const finalizeScroll = useCallback((axis: TimeAxis, offsetY: number) => {
    const length = axis === 'hours' ? hoursArray.length : 60;
    const nextValue = scrollIndexFromOffset(offsetY, length);
    const currentTime = timeRef.current;
    const nextTime = { ...currentTime, [axis]: nextValue } as TimeParts;

    if (formatTimeValue(nextTime) === formatTimeValue(currentTime)) return;

    timeRef.current = nextTime;
    setTime(nextTime);
    onChange(formatTimeValue(nextTime));
  }, [hoursArray.length, onChange, scrollIndexFromOffset]);


  return (
    <View style={styles.card}>
      {label ? <Text style={[styles.label, { color: colors.text }]}>{label}</Text> : null}
      {/* Time Picker */}
      <View style={[styles.pickerContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.highlightOverlay} pointerEvents="none">
          <View style={styles.centerLine} />
        </View>

        {/* Hours Column */}
        <View style={styles.columnWrapper}>
          <ScrollView
            ref={hoursScrollRef}
            style={styles.scrollColumn}
            contentContainerStyle={styles.scrollContainer}
            scrollEventThrottle={16}
            onMomentumScrollEnd={(event) => finalizeScroll('hours', event.nativeEvent.contentOffset.y)}
            onScrollEndDrag={(event) => finalizeScroll('hours', event.nativeEvent.contentOffset.y)}
            scrollEnabled={true}
            nestedScrollEnabled={true}
            showsVerticalScrollIndicator={false}
            snapToInterval={ITEM_HEIGHT}
            snapToAlignment="center"
            decelerationRate="normal"
          >
            {hoursArray.map((hour) => (
              <View key={`hour-${hour}`} style={styles.item}>
                <WheelValue value={hour} unit="h" selected={hour === time.hours} />
              </View>
            ))}
          </ScrollView>
        </View>

        {/* Separator */}
        <Text style={styles.separator}>:</Text>

        {/* Minutes Column */}
        <View style={styles.columnWrapper}>
          <ScrollView
            ref={minutesScrollRef}
            style={styles.scrollColumn}
            contentContainerStyle={styles.scrollContainer}
            scrollEventThrottle={16}
            onMomentumScrollEnd={(event) => finalizeScroll('minutes', event.nativeEvent.contentOffset.y)}
            onScrollEndDrag={(event) => finalizeScroll('minutes', event.nativeEvent.contentOffset.y)}
            scrollEnabled={true}
            nestedScrollEnabled={true}
            showsVerticalScrollIndicator={false}
            snapToInterval={ITEM_HEIGHT}
            snapToAlignment="center"
            decelerationRate="normal"
          >
            {minutesArray.map((minute) => (
              <View key={`minute-${minute}`} style={styles.item}>
                <WheelValue value={minute} unit="m" selected={minute === time.minutes} />
              </View>
            ))}
          </ScrollView>
        </View>

        {/* Separator */}
        <Text style={styles.separator}>:</Text>

        {/* Seconds Column */}
        <View style={styles.columnWrapper}>
          <ScrollView
            ref={secondsScrollRef}
            style={styles.scrollColumn}
            contentContainerStyle={styles.scrollContainer}
            scrollEventThrottle={16}
            onMomentumScrollEnd={(event) => finalizeScroll('seconds', event.nativeEvent.contentOffset.y)}
            onScrollEndDrag={(event) => finalizeScroll('seconds', event.nativeEvent.contentOffset.y)}
            scrollEnabled={true}
            nestedScrollEnabled={true}
            showsVerticalScrollIndicator={false}
            snapToInterval={ITEM_HEIGHT}
            snapToAlignment="center"
            decelerationRate="normal"
          >
            {secondsArray.map((second) => (
              <View key={`second-${second}`} style={styles.item}>
                <WheelValue value={second} unit="s" selected={second === time.seconds} />
              </View>
            ))}
          </ScrollView>
        </View>
      </View>

      {/* Selected time display */}
      <View style={[styles.selectedTimeContainer, { backgroundColor: colors.surfaceRaised, borderColor: colors.border, borderWidth: 1 }]}>
        <Text style={[styles.selectedLabel, { color: colors.textSecondary }]}>Selected:</Text>
        <Text style={[styles.selectedTime, { color: colors.textPrimary }]}>{selectedTime}</Text>
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

  selectedLabel: {
    color: '#8E8E93',
    fontSize: 13,
    fontWeight: '500',
  },

  selectedTime: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 2,
  },

  errorText: {
    color: '#FF5252',
    fontSize: 12,
    marginTop: 8,
    fontWeight: '400',
  },
});
