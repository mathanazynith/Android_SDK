import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import type { ReactNode } from 'react';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QuestionnaireProvider } from '../contexts/QuestionnaireContext';
import { ThemeProvider, useTheme } from '../contexts/ThemeContext';
import { AuthProvider } from '../service/auth';

function RootSurface({ children }: { children: ReactNode }) {
  const { isDark } = useTheme();
  return <>
    <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} translucent backgroundColor="transparent" />
    <>{children}</>
  </>;
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    ...Ionicons.font,
    ...Feather.font,
    ...MaterialCommunityIcons.font,
  });

  if (!fontsLoaded && !fontError) {
    return null;
  }
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <RootSurface>
          <AuthProvider>
            <QuestionnaireProvider>
              <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="index" />
                <Stack.Screen name="oauthredirect" />
                <Stack.Screen name="(auth)" />
                <Stack.Screen name="(app)" />
              </Stack>
            </QuestionnaireProvider>
          </AuthProvider>
        </RootSurface>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}