import { Stack } from 'expo-router';
import type { ReactNode } from 'react';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from '../service/auth';
import { QuestionnaireProvider } from '../contexts/QuestionnaireContext';
import { ThemeProvider, useTheme } from '../contexts/ThemeContext';

function RootSurface({ children }: { children: ReactNode }) {
  const { isDark } = useTheme();
  return <>
    <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} translucent backgroundColor="transparent" />
    <>{children}</>
  </>;
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <RootSurface>
          <AuthProvider>
            <QuestionnaireProvider>
              <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="index" />
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