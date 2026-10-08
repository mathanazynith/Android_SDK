import { Stack } from "expo-router";
import TabZoomTransition from "../../../components/navigation/TabZoomTransition";

export default function ProfileLayout() {
  return (
    <Stack
      screenOptions={{ headerShown: false, animation: "none" }}
      screenLayout={({ route, children }) => (
        <TabZoomTransition key={route.key}>{children}</TabZoomTransition>
      )}
    >
      <Stack.Screen
        name="index"
        options={{
          title: "Profile",
        }}
      />

      <Stack.Screen
        name="edit"
        options={{
          title: "Edit Profile",
        }}
      />
      <Stack.Screen name="subscription" />
    </Stack>
  );
}
