import { Stack } from 'expo-router';
import TabZoomTransition from '../../../components/navigation/TabZoomTransition';
import { CustomWorkoutProvider } from './workout-context';

export default function CustomWorkoutLayout() {
  return (
    <CustomWorkoutProvider>
      <Stack
        screenOptions={{ headerShown: false, animation: 'none' }}
        screenLayout={({ route, children }) => (
          <TabZoomTransition key={route.key}>{children}</TabZoomTransition>
        )}
      />
    </CustomWorkoutProvider>
  );
}