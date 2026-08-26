import { StyleSheet, View } from 'react-native';
import GlobalBottomNav from '../../components/navigation/GlobalBottomNav';

export default function StatsScreen() {
  return (
    <View style={styles.container}>
      <GlobalBottomNav />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B0E0F',
  },
});
