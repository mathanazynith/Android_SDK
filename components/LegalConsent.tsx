import { router } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "../contexts/ThemeContext";

const POLICY_ROUTE = "/(auth)/legal-policy" as any;

export function LegalConsent({ align = "center" }: { align?: "left" | "center" }) {
  const { colors } = useTheme();
  const openPolicy = (policyType: "terms-and-conditions" | "privacy-policy") => {
    router.push({ pathname: POLICY_ROUTE, params: { policyType } });
  };

  return (
    <View style={styles.container} accessibilityLabel="Legal agreement">
      <Text style={[styles.text, { color: colors.textSecondary, textAlign: align }]}>
        By continuing, you accept all the{" "}
        <Text         style={[styles.link, { color: colors.primary }]} onPress={() => openPolicy("terms-and-conditions")}>
          Terms and Conditions
        </Text>
        {" "}and also the{" "}
        <Text         style={[styles.link, { color: colors.primary }]} onPress={() => openPolicy("privacy-policy")}>
          Privacy Policy
        </Text>
        {" "}of the app.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 12, marginBottom: 12 },
  text: { fontSize: 12, lineHeight: 17 },
  link: { fontWeight: "700" },
});
