import { router, useRootNavigationState } from 'expo-router';
import { useEffect, useRef } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
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
      <ActivityIndicator size="large" color="#34C759" />
      <Text style={styles.logo}>Zy-Run</Text>
      <Text style={styles.subtitle}>Loading...</Text>
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
  logo: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#34C759',
    marginTop: 20,
  },
  subtitle: {
    fontSize: 16,
    color: '#8E8E93',
    marginTop: 8,
  },
});