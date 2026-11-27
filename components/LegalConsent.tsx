import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "../contexts/ThemeContext";
import { openLegalPage } from "../src/utils/legalLinks";

export function LegalConsent({ align = "center" }: { align?: "left" | "center" }) {
  const { colors } = useTheme();

  return (
    <View style={styles.container} accessibilityLabel="Legal agreement">
      <Text style={[styles.text, { color: colors.textSecondary, textAlign: align }]}>
        By continuing, you accept all the{" "}
        <Text style={[styles.link, { color: colors.primary }]} onPress={openLegalPage}>
          Terms and Conditions
        </Text>
        {" "}and also the{" "}
        <Text style={[styles.link, { color: colors.primary }]} onPress={openLegalPage}>
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
