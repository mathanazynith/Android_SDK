import { Redirect, useRootNavigationState } from 'expo-router';
import { Image, StyleSheet, View } from 'react-native';
import { useAuth } from '../service/auth';

export default function SplashScreen() {
  const { user, isLoading } = useAuth();
  const rootNavigationState = useRootNavigationState();

  if (isLoading || !rootNavigationState?.key) {
    return (
      <View style={styles.container}>
        <Image
          source={require('../assets/Loading_image_app.png')}
          style={styles.loadingImage}
          resizeMode="cover"
          accessibilityLabel="Zy-Run loading"
        />
      </View>
    );
  }

  return <Redirect href={user ? '/(app)/dashboard' : '/(auth)/login'} />;
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