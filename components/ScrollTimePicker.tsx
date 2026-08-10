import React, { useEffect, useRef, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Dimensions,
} from 'react-native';

interface ScrollTimePickerProps {
  label?: string;
  value?: string;
  hint?: string;
  error?: string;
  onChange: (value: string) => void;
  maxHours?: number;
}

const ITEM_HEIGHT = 50;
const VISIBLE_ITEMS = 3;
const SCROLL_VIEW_HEIGHT = ITEM_HEIGHT * VISIBLE_ITEMS;

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
  value = '00:00:00',
  hint,
  error,
  onChange,
  maxHours = 99,
}) => {
  // Parse initial value
  const [hours, setHours] = useState<number>(() => {
    const parts = value.split(':');
    const h = parseInt(parts[0] || '0', 10);
    return Math.min(Math.max(h, 0), maxHours);
  });

  const [minutes, setMinutes] = useState<number>(() => {
    const parts = value.split(':');
    const m = parseInt(parts[1] || '0', 10);
    return Math.min(Math.max(m, 0), 59);
  });

  const [seconds, setSeconds] = useState<number>(() => {
    const parts = value.split(':');
    const s = parseInt(parts[2] || '0', 10);
    return Math.min(Math.max(s, 0), 59);
  });

  // Refs for scroll views
  const hoursScrollRef = useRef<ScrollView>(null);
  const minutesScrollRef = useRef<ScrollView>(null);
  const secondsScrollRef = useRef<ScrollView>(null);

  // Track if we've scrolled to initial position
  const initialScrollDoneRef = useRef(false);

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

  // Format selected time
  const selectedTime = useMemo(() => {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }, [hours, minutes, seconds]);

  // Emit onChange when time changes
  useEffect(() => {
    onChange(selectedTime);
  }, [selectedTime, onChange]);

  // Scroll to initial position on mount
  useEffect(() => {
    if (!initialScrollDoneRef.current) {
      // Delay scroll to allow layout to complete
      const timer = setTimeout(() => {
        scrollToHour(hours, false);
        scrollToMinute(minutes, false);
        scrollToSecond(seconds, false);
        initialScrollDoneRef.current = true;
      }, 100);
      return () => clearTimeout(timer);
    }
  }, []);

  // Helper functions to scroll to specific values
  const scrollToHour = (targetHour: number, animated: boolean = true) => {
    const index = hoursArray.indexOf(targetHour);
    if (index >= 0 && hoursScrollRef.current) {
      hoursScrollRef.current.scrollTo({
        y: Math.max(0, (index - 1) * ITEM_HEIGHT),
        animated,
      });
    }
  };

  const scrollToMinute = (targetMinute: number, animated: boolean = true) => {
    const index = minutesArray.indexOf(targetMinute);
    if (index >= 0 && minutesScrollRef.current) {
      minutesScrollRef.current.scrollTo({
        y: Math.max(0, (index - 1) * ITEM_HEIGHT),
        animated,
      });
    }
  };

  const scrollToSecond = (targetSecond: number, animated: boolean = true) => {
    const index = secondsArray.indexOf(targetSecond);
    if (index >= 0 && secondsScrollRef.current) {
      secondsScrollRef.current.scrollTo({
        y: Math.max(0, (index - 1) * ITEM_HEIGHT),
        animated,
      });
    }
  };

  // Handle hours scroll
  const handleHoursScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetY = event.nativeEvent.contentOffset.y;
    const index = Math.round(offsetY / ITEM_HEIGHT) + 1;
    const clampedIndex = Math.max(0, Math.min(index, hoursArray.length - 1));
    setHours(hoursArray[clampedIndex]);
  };

  // Handle minutes scroll
  const handleMinutesScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetY = event.nativeEvent.contentOffset.y;
    const index = Math.round(offsetY / ITEM_HEIGHT) + 1;
    const clampedIndex = Math.max(0, Math.min(index, minutesArray.length - 1));
    setMinutes(minutesArray[clampedIndex]);
  };

  // Handle seconds scroll
  const handleSecondsScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetY = event.nativeEvent.contentOffset.y;
    const index = Math.round(offsetY / ITEM_HEIGHT) + 1;
    const clampedIndex = Math.max(0, Math.min(index, secondsArray.length - 1));
    setSeconds(secondsArray[clampedIndex]);
  };

  return (
    <View style={styles.card}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}

      {/* Time Picker */}
      <View style={styles.pickerContainer}>
        {/* Hours Column */}
        <View style={styles.columnWrapper}>
          <ScrollView
            ref={hoursScrollRef}
            style={styles.scrollColumn}
            scrollEventThrottle={16}
            onScroll={handleHoursScroll}
            scrollEnabled={true}
            showsVerticalScrollIndicator={false}
            snapToInterval={ITEM_HEIGHT}
            decelerationRate="fast"
          >
            {/* Top padding */}
            <View style={{ height: ITEM_HEIGHT }} />

            {/* Items */}
            {hoursArray.map((hour) => (
              <View key={`hour-${hour}`} style={styles.item}>
                <Text
                  style={[
                    styles.itemText,
                    hour === hours && styles.itemTextSelected,
                  ]}
                >
                  {String(hour).padStart(2, '0')}h
                </Text>
              </View>
            ))}

            {/* Bottom padding */}
            <View style={{ height: ITEM_HEIGHT }} />
          </ScrollView>
        </View>

        {/* Separator */}
        <Text style={styles.separator}>:</Text>

        {/* Minutes Column */}
        <View style={styles.columnWrapper}>
          <ScrollView
            ref={minutesScrollRef}
            style={styles.scrollColumn}
            scrollEventThrottle={16}
            onScroll={handleMinutesScroll}
            scrollEnabled={true}
            showsVerticalScrollIndicator={false}
            snapToInterval={ITEM_HEIGHT}
            decelerationRate="fast"
          >
            {/* Top padding */}
            <View style={{ height: ITEM_HEIGHT }} />

            {/* Items */}
            {minutesArray.map((minute) => (
              <View key={`minute-${minute}`} style={styles.item}>
                <Text
                  style={[
                    styles.itemText,
                    minute === minutes && styles.itemTextSelected,
                  ]}
                >
                  {String(minute).padStart(2, '0')}m
                </Text>
              </View>
            ))}

            {/* Bottom padding */}
            <View style={{ height: ITEM_HEIGHT }} />
          </ScrollView>
        </View>

        {/* Separator */}
        <Text style={styles.separator}>:</Text>

        {/* Seconds Column */}
        <View style={styles.columnWrapper}>
          <ScrollView
            ref={secondsScrollRef}
            style={styles.scrollColumn}
            scrollEventThrottle={16}
            onScroll={handleSecondsScroll}
            scrollEnabled={true}
            showsVerticalScrollIndicator={false}
            snapToInterval={ITEM_HEIGHT}
            decelerationRate="fast"
          >
            {/* Top padding */}
            <View style={{ height: ITEM_HEIGHT }} />

            {/* Items */}
            {secondsArray.map((second) => (
              <View key={`second-${second}`} style={styles.item}>
                <Text
                  style={[
                    styles.itemText,
                    second === seconds && styles.itemTextSelected,
                  ]}
                >
                  {String(second).padStart(2, '0')}s
                </Text>
              </View>
            ))}

            {/* Bottom padding */}
            <View style={{ height: ITEM_HEIGHT }} />
          </ScrollView>
        </View>
      </View>

      {/* Highlight overlay (center line) */}
      <View style={styles.highlightOverlay} pointerEvents="none">
        <View style={styles.centerLine} />
      </View>

      {/* Selected time display */}
      <View style={styles.selectedTimeContainer}>
        <Text style={styles.selectedLabel}>Selected:</Text>
        <Text style={styles.selectedTime}>{selectedTime}</Text>
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
    color: '#6A6A6A',
    textAlign: 'center',
  },

  itemTextSelected: {
    fontSize: 20,
    fontWeight: '600',
    color: '#FFFFFF',
  },

  separator: {
    fontSize: 20,
    fontWeight: '600',
    color: '#FFFFFF',
    marginHorizontal: 8,
    marginTop: -ITEM_HEIGHT * 0.5,
  },

  highlightOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    height: SCROLL_VIEW_HEIGHT,
    justifyContent: 'center',
    pointerEvents: 'none',
  },

  centerLine: {
    height: ITEM_HEIGHT,
    backgroundColor: 'rgba(52, 199, 89, 0.1)',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderTopColor: 'rgba(52, 199, 89, 0.2)',
    borderBottomColor: 'rgba(52, 199, 89, 0.2)',
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
