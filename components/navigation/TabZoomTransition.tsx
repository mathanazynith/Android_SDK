import { type ReactNode } from 'react';
import { StyleSheet, type StyleProp, type ViewStyle, View } from 'react-native';

interface TabZoomTransitionProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}

export default function TabZoomTransition({ children, style }: TabZoomTransitionProps) {
  return (
    <View style={[styles.container, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
