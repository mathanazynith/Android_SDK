import { Redirect, useRootNavigationState } from 'expo-router';
import { StatusBar, StyleSheet, View } from 'react-native';
import { RunningLoader } from '../components/common/RunningLoader';
import { useAuth } from '../service/auth';

const runnerLoopGreen = require('../assets/animations/runner-loop-green.json');
const runnerLoopMuted = require('../assets/animations/runner-loop-muted.json');

export default function SplashScreen() {
  const { user, isLoading } = useAuth();
  const rootNavigationState = useRootNavigationState();

  if (isLoading || !rootNavigationState?.key) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#0A0A0A" />
        <RunningLoader
          size={120}
          mode="lottie"
          baseSource={runnerLoopMuted}
          fillSource={runnerLoopGreen}
          showSpeedLines={false}
          showShadow={false}
        />
      </View>
    );
  }

  return <Redirect href={user ? '/(app)/dashboard' : '/(auth)/login'} />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
