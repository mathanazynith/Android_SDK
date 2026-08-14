import React, {
    useEffect,
    useState,
} from 'react';

import {
    Alert,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

import { router } from 'expo-router';

import { Feather } from '@expo/vector-icons';

import { useAuth } from '../../service/auth';

import {
    Colors,
    Spacing,
} from '../../constants/theme';

import SettingsMenu from '../../components/SettingsMenu';

import { storage } from '../../service/storage';



// ----------------------------------------------------
// Workout type
// ----------------------------------------------------

interface WorkoutDay {
  day: string;
  workout: string;
  distance: string;
  intensity:
    | 'Easy'
    | 'Hard'
    | 'Medium';
  icon: string;
  color: string;
}


// ----------------------------------------------------
// Dashboard
// ----------------------------------------------------

export default function DashboardScreen() {

  const {
    user,
    logout,
  } = useAuth();

  const [
    settingsVisible,
    setSettingsVisible,
  ] = useState(false);

  const [
    savedPlan,
    setSavedPlan,
  ] = useState<any>(null);

  const [
    hasSavedPlan,
    setHasSavedPlan,
  ] = useState(false);


  // --------------------------------------------------
  // Load training plan
  // --------------------------------------------------

  useEffect(() => {
    loadSavedPlan();
  }, []);


  const loadSavedPlan = async () => {

    try {

      const planData =
        await storage.getItem(
          storage.KEYS.TRAINING_PLAN
        );

      if (planData) {

        setSavedPlan(
          JSON.parse(planData)
        );

        setHasSavedPlan(true);

      } else {

        setHasSavedPlan(false);

        setSavedPlan(null);
      }

    } catch (error) {

      console.error(
        'Error loading saved plan:',
        error
      );

      setHasSavedPlan(false);
    }
  };


  // --------------------------------------------------
  // Check profile
  // --------------------------------------------------

  const isProfileComplete = () => {

    const profile =
      user?.profile;

    return !!(
      user?.first_name &&
      user?.last_name &&
      user?.username &&
      profile?.gender &&
      profile?.date_of_birth &&
      profile?.height_cm &&
      profile?.weight_kg
    );
  };


  // --------------------------------------------------
  // Today's workout
  // --------------------------------------------------

  const getTodayWorkout = () => {

    if (
      !savedPlan ||
      !savedPlan.weeklyWorkouts
    ) {
      return null;
    }

    const days = [
      'Sun',
      'Mon',
      'Tue',
      'Wed',
      'Thu',
      'Fri',
      'Sat',
    ];

    return savedPlan.weeklyWorkouts.find(
      (w: WorkoutDay) =>
        w.day ===
        days[new Date().getDay()]
    );
  };


  // --------------------------------------------------
  // Training plan
  // --------------------------------------------------

  const handleGetPlan = () => {

    if (hasSavedPlan) {

      router.push(
        '/questionnaire'
      );

      return;
    }


    if (!isProfileComplete()) {

      Alert.alert(
        'Complete Your Profile',

        'Please complete your profile before generating a training plan. This includes adding your gender, date of birth, height, and weight.',

        [
          {
            text: 'Cancel',
            style: 'cancel',
          },

          {
            text: 'Go to Profile',

            onPress: () =>
              router.push(
                '/(app)/profile/edit'
              ),
          },
        ]
      );

      return;
    }


    router.push(
      '/(app)/questionnaire'
    );
  };


  // --------------------------------------------------
  // Settings
  // --------------------------------------------------

  const handleSettingsOption = (
    option: string
  ) => {

    setSettingsVisible(false);

    switch (option) {

      case 'Edit Profile':

        router.push(
          '/(app)/profile/edit'
        );

        break;


      case 'Change Password':

        router.push(
          '/(app)/screens/change-password'
        );

        break;


      case 'Notifications':

        router.push(
          '/(app)/screens/notifications'
        );

        break;


      case 'Logout':

        Alert.alert(
          'Logout',

          'Are you sure you want to logout?',

          [
            {
              text: 'Cancel',
              style: 'cancel',
            },

            {
              text: 'Logout',

              style: 'destructive',

              onPress: async () => {

                await logout();

                router.replace(
                  '/(auth)/login'
                );
              },
            },
          ]
        );

        break;
    }
  };


  // --------------------------------------------------
  // Quick actions
  // --------------------------------------------------

  const quickActions = [
    {
      label: 'Start Run',
      icon: '▶️',
      route: '/(app)/calendar',
    },

    {
      label: 'Get My Plan',
      icon: '📋',
      route: null,
    },

    {
      label: 'History',
      icon: '📊',
      route: '/(app)/history',
    },

    {
      label: 'Achievements',
      icon: '🏆',
      route: '/(app)/achievements',
    },
  ];


  // --------------------------------------------------
  // Dashboard values
  // --------------------------------------------------

  const todayWorkout =
    getTodayWorkout();

  const isRestDay =
    todayWorkout?.workout ===
      'Rest' ||
    todayWorkout?.workout ===
      'Rest Day';

  const completedProfile =
    isProfileComplete();

  const scheduledRuns =
    savedPlan?.weeklyWorkouts?.filter(
      (w: WorkoutDay) =>
        w.workout !== 'Rest' &&
        w.workout !== 'Rest Day'
    ).length || 0;

  const planLabel =
    hasSavedPlan
      ? 'View My Plan'
      : 'Start Onboarding';


  // --------------------------------------------------
  // UI
  // --------------------------------------------------

  return (
    <View style={styles.container}>

      {/* Header */}

      <View style={styles.topBar}>

        <Text style={styles.pageTitle}>
          Dashboard
        </Text>

      </View>


      {/* Main content */}

      <ScrollView
        showsVerticalScrollIndicator={
          false
        }

        contentContainerStyle={
          styles.scrollContent
        }
      >

        {/* Welcome */}

        <View
          style={styles.welcomeSection}
        >

          <Text
            style={styles.welcomeTitle}
          >
            Welcome
          </Text>

          <Text
            style={styles.welcomeEmail}
          >
            {user?.email ||
              'Your running journey starts here'}
          </Text>

        </View>

        {/* Account status */}

        <View
          style={[
            styles.card,
            styles.statusCard,
          ]}
        >

          <View>

            <Text
              style={styles.cardTitle}
            >
              Account Status
            </Text>

            <Text
              style={styles.cardSubtitle}
            >
              {user?.email
                ? 'Email Verified'
                : 'Account ready'}
            </Text>

            <View
              style={styles.activeRow}
            >

              <Feather
                name="check"
                size={21}
                color="#2BD64F"
              />

              <Text
                style={styles.activeText}
              >
                Active
              </Text>

            </View>

          </View>


          <View
            style={styles.statusIcon}
          >

            <Feather
              name="check"
              size={40}
              color="#0D2512"
            />

          </View>

        </View>


        {/* Health Assessment */}

        <View style={styles.card}>

          <Text
            style={styles.assessmentTitle}
          >
            Health Assessment
          </Text>

          <Text
            style={styles.assessmentDescription}
          >
            Complete your personalized
            {`\n`}
            health assessment
          </Text>

          <TouchableOpacity
            style={[
              styles.primaryCta,

              !completedProfile &&
                styles.primaryCtaDisabled,
            ]}

            onPress={
              handleGetPlan
            }

            disabled={
              !completedProfile &&
              !hasSavedPlan
            }
          >

            <Feather
              name="clipboard"
              size={22}
              color="#FFFFFF"
            />

            <Text
              style={
                styles.primaryCtaText
              }
            >
              Start Assessment
            </Text>

          </TouchableOpacity>

        </View>


        {/* Training Plan */}

        <View style={styles.card}>

          <Text
            style={styles.cardTitle}
          >
            Training Plan
          </Text>

          <Text
            style={styles.planDescription}
          >

            {hasSavedPlan &&
            todayWorkout

              ? (
                isRestDay

                  ? 'Today is an active recovery day.'

                  : `${todayWorkout.workout} · ${todayWorkout.distance}`
              )

              : 'Answer a few questions and generate\nyour personalized running plan.'}

          </Text>


          <TouchableOpacity
            style={styles.primaryCta}

            onPress={
              hasSavedPlan
                ? () =>
                    router.push(
                      '/(app)/training-plan'
                    )
                : handleGetPlan
            }
          >

            <Feather
              name={
                hasSavedPlan
                  ? 'eye'
                  : 'activity'
              }
              size={22}
              color="#FFFFFF"
            />

            <Text
              style={
                styles.primaryCtaText
              }
            >
              {planLabel}
            </Text>

          </TouchableOpacity>

        </View>


        {/* Stats */}

        <View
          style={styles.statsRow}
        >

          <View
            style={styles.statCard}
          >

            <Text
              style={styles.statLabel}
            >
              Distance Today
            </Text>

            <Text
              style={styles.statValue}
            >
              {todayWorkout &&
              !isRestDay
                ? todayWorkout.distance
                : '0 km'}
            </Text>

          </View>


          <View
            style={styles.statCard}
          >

            <Text
              style={styles.statLabel}
            >
              This Week
            </Text>

            <Text
              style={styles.statValue}
            >
              {savedPlan
                ? `${scheduledRuns} runs`
                : 'N/A'}
            </Text>

          </View>

        </View>

      </ScrollView>


      {/* Bottom navigation */}

      <View
        style={styles.floatingTabBar}
      >

        {/* Record */}

        <TouchableOpacity
          style={styles.tabItem}

          onPress={() =>
            router.push(
              '/(app)/calendar' as any
            )
          }
        >

          <View
            style={[
              styles.tabIcon,
              styles.tabIconActive,
            ]}
          >

            <Feather
              name="activity"
              size={24}
              color={Colors.primary}
            />

          </View>

          <Text
            style={[
              styles.tabLabel,
              styles.tabLabelActive,
            ]}
          >
            Plans
          </Text>

        </TouchableOpacity>


        {/* History */}

        <TouchableOpacity
          style={styles.tabItem}

          onPress={() =>
            router.push(
              '/(app)/history' as any
            )
          }
        >

          <View
            style={styles.tabIcon}
          >

            <Feather
              name="clock"
              size={24}
              color="#C4C8C5"
            />

          </View>

          <Text
            style={styles.tabLabel}
          >
            History
          </Text>

        </TouchableOpacity>


        {/* Activity */}

        <TouchableOpacity
          style={styles.tabItem}

          onPress={() =>
            router.push(
              '/(app)/activity' as any
            )
          }
        >

          <View
            style={styles.tabIcon}
          >

            <Feather
              name="layers"
              size={24}
              color="#C4C8C5"
            />

          </View>

          <Text
            style={styles.tabLabel}
          >
            Activity
          </Text>

        </TouchableOpacity>



        {/* Stats */}

        <TouchableOpacity
          style={styles.tabItem}

          onPress={() =>
            router.push(
              '/(app)/attendance'
            )
          }
        >

          <View
            style={styles.tabIcon}
          >

            <Feather
              name="bar-chart-2"
              size={24}
              color="#C4C8C5"
            />

          </View>

          <Text
            style={styles.tabLabel}
          >
            Stats
          </Text>

        </TouchableOpacity>


        {/* Profile */}

        <TouchableOpacity
          style={styles.tabItem}

          onPress={() =>
            router.push(
              '/(app)/profile'
            )
          }
        >

          <View
            style={styles.tabIcon}
          >

            <Feather
              name="user"
              size={24}
              color="#C4C8C5"
            />

          </View>

          <Text
            style={styles.tabLabel}
          >
            Profile
          </Text>

        </TouchableOpacity>


        {/* Settings */}

        <TouchableOpacity
          style={styles.tabItem}

          onPress={() =>
            setSettingsVisible(true)
          }
        >

          <View
            style={styles.tabIcon}
          >

            <Feather
              name="settings"
              size={24}
              color="#C4C8C5"
            />

          </View>

          <Text
            style={styles.tabLabel}
          >
            Settings
          </Text>

        </TouchableOpacity>

      </View>


      {/* Settings menu */}

      <SettingsMenu
        visible={settingsVisible}

        onClose={() =>
          setSettingsVisible(false)
        }

        onSelect={
          handleSettingsOption
        }
      />

    </View>
  );
}


// ----------------------------------------------------
// Styles
// ----------------------------------------------------

const styles = StyleSheet.create({

  container: {
    flex: 1,
    backgroundColor: '#0B0E0F',
  },

  topBar: {
    minHeight: 122,

    paddingHorizontal: 28,

    paddingTop: 45,

    flexDirection: 'row',

    justifyContent:
      'space-between',

    borderBottomWidth:
      StyleSheet.hairlineWidth,

    borderBottomColor:
      '#282B2D',
  },

  pageTitle: {
    color: '#F7F7F7',

    fontSize: 31,

    fontWeight: '700',

    letterSpacing: -0.6,
  },

  scrollContent: {
    paddingHorizontal: 28,

    paddingBottom: 130,
  },

  welcomeSection: {
    paddingTop: 23,

    paddingBottom: 18,
  },

  welcomeTitle: {
    color: '#F7F7F7',

    fontSize: 24,

    lineHeight: 30,

    fontWeight: '700',
  },

  welcomeEmail: {
    color: '#ADAFB1',

    fontSize: 17,

    marginTop: 2,
  },

  // --------------------------------------------------
  // EXISTING DASHBOARD
  // --------------------------------------------------

  card: {
    backgroundColor: '#242627',

    borderWidth: 1.25,

    borderColor: '#65686A',

    borderRadius: 28,

    padding: 22,

    marginBottom: 18,

    shadowColor: '#000',

    shadowOffset: {
      width: 0,
      height: 8,
    },

    shadowOpacity: 0.22,

    shadowRadius: 14,

    elevation: 5,
  },

  statusCard: {
    flexDirection: 'row',

    justifyContent:
      'space-between',

    alignItems: 'center',
  },

  cardTitle: {
    color: '#F2F2F2',

    fontSize: 20,

    fontWeight: '700',
  },

  cardSubtitle: {
    color: '#AEB0B2',

    fontSize: 18,

    marginTop: 4,
  },

  activeRow: {
    flexDirection: 'row',

    alignItems: 'center',

    gap: 5,

    marginTop: 4,
  },

  activeText: {
    color: '#2BD64F',

    fontSize: 18,

    fontWeight: '700',
  },

  statusIcon: {
    width: 48,

    height: 48,

    borderRadius: 24,

    backgroundColor: '#2BD64F',

    alignItems: 'center',

    justifyContent: 'center',
  },

  assessmentTitle: {
    color: '#079DFF',

    fontSize: 21,

    fontWeight: '700',
  },

  assessmentDescription: {
    color: '#079DFF',

    fontSize: 18,

    lineHeight: 24,

    textAlign: 'center',

    marginVertical: 20,
  },

  primaryCta: {
    minHeight: 58,

    borderRadius: 17,

    flexDirection: 'row',

    alignItems: 'center',

    justifyContent: 'center',

    gap: 10,

    backgroundColor: '#2CBD08',
  },

  primaryCtaDisabled: {
    backgroundColor: '#4B6248',
  },

  primaryCtaText: {
    color: '#FFFFFF',

    fontSize: 19,

    fontWeight: '700',
  },

  planDescription: {
    color: '#F0F0F0',

    fontSize: 18,

    lineHeight: 24,

    marginTop: 19,

    marginBottom: 19,
  },

  statsRow: {
    flexDirection: 'row',

    gap: 12,

    marginBottom: 18,
  },

  statCard: {
    flex: 1,

    minHeight: 92,

    borderRadius: 22,

    backgroundColor: '#242627',

    borderWidth: 1.25,

    borderColor: '#65686A',

    padding: 14,

    justifyContent: 'center',
  },

  statLabel: {
    color: '#ADAFB1',

    fontSize: 12,

    marginBottom: 5,
  },

  statValue: {
    color: '#F7F7F7',

    fontSize: 21,

    fontWeight: '700',
  },


  // --------------------------------------------------
  // BOTTOM TAB BAR
  // --------------------------------------------------

  floatingTabBar: {
    position: 'absolute',

    left: 38,

    right: 38,

    bottom: 18,

    minHeight: 90,

    borderRadius: 46,

    paddingHorizontal: 12,

    paddingVertical: 8,

    flexDirection: 'row',

    justifyContent:
      'space-around',

    alignItems: 'center',

    backgroundColor:
      'rgba(41, 47, 41, 0.96)',

    borderWidth: 1,

    borderColor:
      'rgba(255,255,255,0.14)',

    shadowColor: '#000',

    shadowOpacity: 0.4,

    shadowOffset: {
      width: 0,
      height: 10,
    },

    shadowRadius: 18,

    elevation: 12,
  },

  tabItem: {
    flex: 1,

    alignItems: 'center',

    justifyContent: 'center',
  },

  tabIcon: {
    width: 46,

    height: 43,

    borderRadius: 23,

    alignItems: 'center',

    justifyContent: 'center',
  },

  tabIconActive: {
    backgroundColor:
      'rgba(47, 194, 14, 0.20)',
  },

  tabLabel: {
    color: '#C4C8C5',

    fontSize: 12,

    fontWeight: '500',

    marginTop: 1,
  },

  tabLabelActive: {
    color: Colors.primary,

    fontWeight: '700',
  },

});
