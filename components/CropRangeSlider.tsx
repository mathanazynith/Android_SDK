import { useState } from 'react';
import { LayoutChangeEvent, PanResponder, StyleSheet, View } from 'react-native';

interface CropRangeSliderProps {
  minimumValue: number;
  maximumValue: number;
  startValue: number;
  endValue: number;
  onStartChange: (value: number) => void;
  onEndChange: (value: number) => void;
}

export function CropRangeSlider({
  minimumValue,
  maximumValue,
  startValue,
  endValue,
  onStartChange,
  onEndChange,
}: CropRangeSliderProps) {
  const [trackWidth, setTrackWidth] = useState(0);
  const range = Math.max(1, maximumValue - minimumValue);
  const valueToX = (value: number) => ((value - minimumValue) / range) * trackWidth;

  const createThumbResponder = (thumb: 'start' | 'end') => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderMove: (_event, gesture) => {
      if (!trackWidth) return;

      const initialValue = thumb === 'start' ? startValue : endValue;
      const nextValue = Math.round(initialValue + (gesture.dx / trackWidth) * range);
      const boundedValue = Math.max(minimumValue, Math.min(nextValue, maximumValue));

      if (thumb === 'start') {
        onStartChange(Math.min(boundedValue, endValue));
      } else {
        onEndChange(Math.max(boundedValue, startValue));
      }
    },
  });

  const startResponder = createThumbResponder('start');
  const endResponder = createThumbResponder('end');

  const onLayout = (event: LayoutChangeEvent) => setTrackWidth(event.nativeEvent.layout.width);
  const startX = valueToX(startValue);
  const endX = valueToX(endValue);

  return (
    <View style={styles.touchArea} onLayout={onLayout}>
      <View style={styles.track} />
      <View style={[styles.selectedTrack, { left: startX, width: Math.max(0, endX - startX) }]} />
      <View style={[styles.thumb, { left: startX - 17 }]} {...startResponder.panHandlers} />
      <View style={[styles.thumb, { left: endX - 17 }]} {...endResponder.panHandlers} />
    </View>
  );
}

const styles = StyleSheet.create({
  touchArea: { height: 44, justifyContent: 'center' },
  track: { height: 8, borderRadius: 4, backgroundColor: '#393C3E' },
  selectedTrack: { position: 'absolute', top: 18, height: 8, borderRadius: 4, backgroundColor: '#2FD45B' },
  thumb: {
    position: 'absolute', top: 5, width: 34, height: 34, borderRadius: 17, backgroundColor: '#F7F7F7',
    borderWidth: 1, borderColor: '#D6D9D6', elevation: 4,
  },
});
