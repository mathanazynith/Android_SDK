import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useEffect } from 'react';

export default function OAuthRedirectScreen() {
  useEffect(() => {
    router.replace('/');
  }, []);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#22C55E" />
      <Text style={styles.text}>Completing sign-in...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0D0D0D',
  },
  text: {
    marginTop: 12,
    color: '#FFFFFF',
    fontSize: 16,
  },
});