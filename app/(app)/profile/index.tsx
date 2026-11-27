import { router } from "expo-router";
import { useEffect } from "react";
import { RunningLoader } from "../../../components/common/RunningLoader";
import { useAuth } from "../../../service/auth";
import { useTheme } from "../../../contexts/ThemeContext";
import { View } from "react-native";

export default function ProfileTabScreen() {
  const { user, isLoading } = useAuth();
  const { colors } = useTheme();

  useEffect(() => {
    if (!user?.id) return;
    router.replace({
      pathname: "/(app)/runner/[id]",
      params: { id: String(user.id), selfProfile: "1" },
    });
  }, [user?.id]);

  if (isLoading && !user) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>
        <RunningLoader size={64} label="Loading your profile..." />
      </View>
    );
  }

  if (!user?.id) return null;

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>
      <RunningLoader size={48} label="Opening your profile..." />
    </View>
  );
}
