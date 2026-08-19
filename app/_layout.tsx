import { Stack } from 'expo-router';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { AuthProvider } from '../service/auth';
import { QuestionnaireProvider } from '../contexts/QuestionnaireContext';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SafeAreaView edges={['top']} style={{ flex: 1, paddingTop: 16, backgroundColor: '#090B0C' }}>
        <AuthProvider>
          <QuestionnaireProvider>
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="index" />
              <Stack.Screen name="(auth)" />
              <Stack.Screen name="(app)" />
            </Stack>
          </QuestionnaireProvider>
        </AuthProvider>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}