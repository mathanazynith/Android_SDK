import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import {
  Image,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const steps = [
  { number: '01', title: 'Start a run', icon: 'walk-outline' as const },
  { number: '02', title: 'Track your route', icon: 'navigate-outline' as const },
  { number: '03', title: 'See your progress', icon: 'stats-chart-outline' as const },
];

export default function WelcomeScreen() {
  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor="#080B09" />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.brand}>
          <View style={styles.brandIcon}>
            <Image
              source={require('../../assets/images/zyrun-adaptive-foreground.png')}
              resizeMode="contain"
              style={styles.brandIconImage}
              accessibilityLabel="Zy-Run logo"
            />
          </View>
          <Text style={styles.brandName}>ZY<Text style={styles.brandAccent}>-RUN</Text></Text>
          <View style={styles.brandPill}>
            <Text style={styles.brandPillText}>RUN YOUR WAY</Text>
          </View>
        </View>

        <View style={styles.hero}>
          <Image
            source={require('../../assets/Zy-Run_Official.png')}
            resizeMode="cover"
            style={styles.heroImage}
          />
          <LinearGradient
            colors={['rgba(8,11,9,0.02)', 'rgba(8,11,9,0.16)', '#080B09']}
            locations={[0, 0.48, 1]}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.heroCopy}>
            <Text style={styles.eyebrow}>YOUR NEXT MILE STARTS HERE</Text>
            <Text style={styles.headline}>Run stronger.{'\n'}<Text style={styles.headlineAccent}>Go farther.</Text></Text>
            <Text style={styles.heroSubtitle}>
              Make every run count with tools that keep you moving.
            </Text>
          </View>
          <View style={styles.liveBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>MADE FOR YOUR NEXT RUN</Text>
          </View>
        </View>

        <View style={styles.features}>
          <View style={styles.featureItem}>
            <Ionicons name="navigate-outline" size={18} color="#8BFA50" />
            <Text style={styles.featureTitle}>GPS tracking</Text>
            <Text style={styles.featureCaption}>Your route, live</Text>
          </View>
          <View style={styles.featureDivider} />
          <View style={styles.featureItem}>
            <Ionicons name="barbell-outline" size={18} color="#8BFA50" />
            <Text style={styles.featureTitle}>Run plans</Text>
            <Text style={styles.featureCaption}>Built around you</Text>
          </View>
          <View style={styles.featureDivider} />
          <View style={styles.featureItem}>
            <Ionicons name="trending-up-outline" size={18} color="#8BFA50" />
            <Text style={styles.featureTitle}>Progress</Text>
            <Text style={styles.featureCaption}>See every win</Text>
          </View>
        </View>

        <View style={styles.howSection}>
          <Text style={styles.sectionEyebrow}>HOW IT WORKS</Text>
          <Text style={styles.sectionTitle}>Three steps. One better you.</Text>
          <View style={styles.steps}>
            {steps.map((step) => (
              <View key={step.number} style={styles.stepCard}>
                <View style={styles.stepTop}>
                  <Text style={styles.stepNumber}>{step.number}</Text>
                  <Ionicons name={step.icon} size={19} color="#8BFA50" />
                </View>
                <Text style={styles.stepTitle}>{step.title}</Text>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Get started with Zy-Run"
          activeOpacity={0.88}
          style={styles.startButton}
          onPress={() => router.push('/(auth)/login')}
        >
          <Text style={styles.startButtonText}>Let&apos;s Run</Text>
          <Ionicons name="arrow-forward" size={19} color="#071007" />
        </TouchableOpacity>
        <Text style={styles.footerCaption}>Your journey starts with one step.</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#080B09',
  },
  scrollContent: {
    paddingBottom: 16,
  },
  brand: {
    height: 54,
    marginHorizontal: 22,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  brandIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#090B0A',
    overflow: 'hidden',
  },
  brandIconImage: {
    position: 'absolute',
    width: 50,
    height: 50,
    left: -8,
    top: -8,
  },
  brandName: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 1.1,
  },
  brandAccent: {
    color: '#8BFA50',
  },
  brandPill: {
    marginLeft: 'auto',
    borderWidth: 1,
    borderColor: '#28352A',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  brandPillText: {
    color: '#A8B3AA',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.1,
  },
  hero: {
    height: 340,
    marginTop: 6,
    marginHorizontal: 14,
    overflow: 'hidden',
    borderRadius: 26,
    backgroundColor: '#0B130D',
  },
  heroImage: {
    ...StyleSheet.absoluteFill,
    width: undefined,
    height: undefined,
    opacity: 0.72,
  },
  heroCopy: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 20,
  },
  eyebrow: {
    color: '#A6F778',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.7,
    marginBottom: 8,
  },
  headline: {
    color: '#FFFFFF',
    fontSize: 35,
    lineHeight: 39,
    fontWeight: '900',
    letterSpacing: -1,
  },
  headlineAccent: {
    color: '#8BFA50',
  },
  heroSubtitle: {
    maxWidth: 275,
    color: '#D0D8D1',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 8,
  },
  liveBadge: {
    position: 'absolute',
    top: 15,
    left: 15,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: 'rgba(7,12,8,0.74)',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#8BFA50',
  },
  liveText: {
    color: '#ECF5ED',
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  features: {
    marginTop: 12,
    marginHorizontal: 14,
    minHeight: 84,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#1C271E',
    borderRadius: 18,
    backgroundColor: '#0D120E',
  },
  featureItem: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  featureTitle: {
    color: '#F0F4F0',
    fontSize: 11,
    fontWeight: '700',
  },
  featureCaption: {
    color: '#829086',
    fontSize: 9,
  },
  featureDivider: {
    width: 1,
    height: 38,
    backgroundColor: '#243027',
  },
  howSection: {
    marginTop: 23,
    marginHorizontal: 20,
  },
  sectionEyebrow: {
    color: '#8BFA50',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.7,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
    marginTop: 5,
    marginBottom: 12,
  },
  steps: {
    flexDirection: 'row',
    gap: 8,
  },
  stepCard: {
    flex: 1,
    minHeight: 72,
    justifyContent: 'space-between',
    padding: 10,
    borderWidth: 1,
    borderColor: '#1C271E',
    borderRadius: 14,
    backgroundColor: '#0D120E',
  },
  stepTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stepNumber: {
    color: '#6C7C6E',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  stepTitle: {
    color: '#E8EEE8',
    fontSize: 10,
    fontWeight: '700',
    marginTop: 10,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 10,
    backgroundColor: '#080B09',
    borderTopWidth: 1,
    borderTopColor: '#152018',
  },
  startButton: {
    minHeight: 54,
    borderRadius: 16,
    backgroundColor: '#8BFA50',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  startButtonText: {
    color: '#071007',
    fontSize: 16,
    fontWeight: '900',
  },
  footerCaption: {
    color: '#778279',
    textAlign: 'center',
    fontSize: 10,
    marginTop: 8,
  },
});
