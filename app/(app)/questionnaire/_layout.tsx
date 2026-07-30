import { Stack } from 'expo-router';

export default function QuestionnaireLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen 
        name="index" 
        options={{ 
          headerShown: true,
          title: "Questionnaire",
          headerBackVisible: false,
        }} 
      />
    </Stack>
  );
}