import { router, useRootNavigationState } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { useAuth } from '../service/auth';

export default function SplashScreen() {
  const { user, isLoading } = useAuth();
  const rootNavigationState = useRootNavigationState();
  const hasRedirectedRef = useRef(false);

  useEffect(() => {
    if (isLoading || !rootNavigationState?.key || hasRedirectedRef.current) {
      return;
    }

    hasRedirectedRef.current = true;
    const targetRoute = user ? '/(app)/dashboard' : '/(auth)/login';
    router.replace(targetRoute);
  }, [isLoading, user, rootNavigationState?.key]);

  return (
    <View style={styles.container}>
      <Image
        source={require('../assets/Loading_image_app.jpg')}
        style={styles.loadingImage}
        resizeMode="cover"
        accessibilityLabel="Zy-Run loading"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1A1A1A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingImage: {
    width: '100%',
    height: '100%',
  },
});