import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { RunningLoader } from '../components/common/RunningLoader';

export default function OAuthRedirectScreen() {
  useEffect(() => {
    router.replace('/');
  }, []);

  return (
    <View style={styles.container}>
      <RunningLoader size={64} label="Completing sign-in..." />
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