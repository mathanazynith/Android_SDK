import { router } from 'expo-router';
import { useMemo } from 'react';
import { PanResponder, StyleSheet, View } from 'react-native';

interface AuthDismissHandleProps {
  top: number;
  disabled?: boolean;
}

export default function AuthDismissHandle({ top, disabled = false }: AuthDismissHandleProps) {
  const panResponder = useMemo(
    () => PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) =>
        !disabled && gesture.dy > 8 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dy > 72) router.back();
      },
    }),
    [disabled],
  );

  return (
    <View
      accessibilityLabel="Swipe down to return"
      style={[styles.touchArea, { top }]}
      {...panResponder.panHandlers}
    >
      <View style={styles.handle} />
    </View>
  );
}

const styles = StyleSheet.create({
  touchArea: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 40,
    zIndex: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  handle: {
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#707070',
  },
});
