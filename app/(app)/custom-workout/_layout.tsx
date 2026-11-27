import { Stack, useGlobalSearchParams } from 'expo-router';
import TabZoomTransition from '../../../components/navigation/TabZoomTransition';
import { getActivityLaunchOrigin, getDashboardLaunchOrigin, getTabLaunchOrigin } from '../../../components/navigation/dashboardLaunchTransition';
import { CustomWorkoutProvider } from './workout-context';

export default function CustomWorkoutLayout() {
  const params = useGlobalSearchParams();
  const hasOuterLaunchOrigin = Boolean(
    getDashboardLaunchOrigin(params) ?? getTabLaunchOrigin(params) ?? getActivityLaunchOrigin(params),
  );

  return (
    <CustomWorkoutProvider>
      <Stack
        screenOptions={{ headerShown: false, animation: 'none' }}
        screenLayout={({ route, children }) => (
          <TabZoomTransition
            key={route.key}
            animate={route.name !== 'index' || !hasOuterLaunchOrigin}
          >
            {children}
          </TabZoomTransition>
        )}
      >
        <Stack.Screen name="suggested-routes" />
      </Stack>
    </CustomWorkoutProvider>
  );
}
