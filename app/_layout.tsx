import { Stack } from 'expo-router';
import { AuthProvider } from '../service/auth';
import { QuestionnaireProvider } from '../contexts/QuestionnaireContext';

export default function RootLayout() {
  return (
    <AuthProvider>
      <QuestionnaireProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(app)" />
        </Stack>
      </QuestionnaireProvider>
    </AuthProvider>
  );
}