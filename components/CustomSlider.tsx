import React from 'react';
import {
    Dimensions,
    GestureResponderEvent,
    PanResponder,
    StyleSheet,
    View
} from 'react-native';

interface CustomSliderProps {
  value: number;
  minimumValue: number;
  maximumValue: number;
  onValueChange: (value: number) => void;
  step?: number;
  minimumTrackTintColor?: string;
  maximumTrackTintColor?: string;
  thumbTintColor?: string;
  style?: any;
}

export const CustomSlider: React.FC<CustomSliderProps> = ({
  value,
  minimumValue,
  maximumValue,
  onValueChange,
  step = 1,
  minimumTrackTintColor = '#35C72B',
  maximumTrackTintColor = '#393C3E',
  thumbTintColor = '#35C72B',
  style,
}) => {
  const TRACK_HEIGHT = 4;
  const THUMB_RADIUS = 12;
  const TRACK_WIDTH = Dimensions.get('window').width - 64; // Account for padding

  const range = maximumValue - minimumValue;
  const normalizedValue = (value - minimumValue) / range;
  const thumbPosition = normalizedValue * (TRACK_WIDTH - 2 * THUMB_RADIUS);

  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (evt: GestureResponderEvent) => {
      handleSliderMove(evt.nativeEvent.locationX);
    },
    onPanResponderMove: (evt: GestureResponderEvent) => {
      handleSliderMove(evt.nativeEvent.locationX);
    },
  });

  const handleSliderMove = (xPosition: number) => {
    let newPosition = Math.max(THUMB_RADIUS, Math.min(xPosition, TRACK_WIDTH - THUMB_RADIUS));
    let normalizedPosition = (newPosition - THUMB_RADIUS) / (TRACK_WIDTH - 2 * THUMB_RADIUS);
    let newValue = minimumValue + normalizedPosition * range;

    // Apply step
    newValue = Math.round(newValue / step) * step;
    newValue = Math.max(minimumValue, Math.min(newValue, maximumValue));

    onValueChange(newValue);
  };

  return (
    <View style={[styles.container, style]}>
      <View
        style={[
          styles.track,
          {
            height: TRACK_HEIGHT,
            width: TRACK_WIDTH,
            backgroundColor: maximumTrackTintColor,
          },
        ]}
        {...panResponder.panHandlers}
      >
        {/* Filled track */}
        <View
          style={[
            styles.filledTrack,
            {
              height: TRACK_HEIGHT,
              width: thumbPosition + THUMB_RADIUS,
              backgroundColor: minimumTrackTintColor,
            },
          ]}
        />

        {/* Thumb */}
        <View
          style={[
            styles.thumb,
            {
              width: THUMB_RADIUS * 2,
              height: THUMB_RADIUS * 2,
              borderRadius: THUMB_RADIUS,
              backgroundColor: thumbTintColor,
              left: thumbPosition,
              top: -THUMB_RADIUS + TRACK_HEIGHT / 2,
            },
          ]}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: 40,
  },
  track: {
    position: 'relative',
    borderRadius: 2,
  },
  filledTrack: {
    position: 'absolute',
    top: 0,
    left: 0,
    borderRadius: 2,
  },
  thumb: {
    position: 'absolute',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 4,
  },
});
