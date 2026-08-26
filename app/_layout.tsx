import { Stack } from 'expo-router';
import type { ReactNode } from 'react';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { AuthProvider } from '../service/auth';
import { QuestionnaireProvider } from '../contexts/QuestionnaireContext';
import { ThemeProvider, useTheme } from '../contexts/ThemeContext';

function RootSurface({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  return <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.background }}>{children}</SafeAreaView>;
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