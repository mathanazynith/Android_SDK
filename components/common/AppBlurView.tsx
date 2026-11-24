import { BlurView, type BlurViewProps } from 'expo-blur';
import { Platform, View } from 'react-native';

/**
 * expo-blur's Android native view can try to resolve its blur target while the
 * Activity is being recreated (for example during Expo reloads). Keep the same
 * translucent surface on Android without mounting that native view.
 */
export default function AppBlurView({ children, style, ...props }: BlurViewProps) {
  if (Platform.OS === 'android') {
    return <View style={style}>{children}</View>;
  }

  return <BlurView {...props} style={style}>{children}</BlurView>;
}
