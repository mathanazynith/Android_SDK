import { StyleSheet, View } from 'react-native';
import GlobalBottomNav from '../../components/navigation/GlobalBottomNav';
import { useTheme } from '../../contexts/ThemeContext';

export default function StatsScreen() {
  const { colors } = useTheme();
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
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
