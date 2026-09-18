import { router } from "expo-router";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

const POLICY_ROUTE = "/(auth)/legal-policy" as any;

export function LegalConsent() {
  const openPolicy = (policyType: "terms-and-conditions" | "privacy-policy") => {
    router.push({ pathname: POLICY_ROUTE, params: { policyType } });
  };

  return (
    <View style={styles.container} accessibilityLabel="Legal agreement">
      <Text style={styles.text}>
        By continuing, you accept all the{" "}
        <Text style={styles.link} onPress={() => openPolicy("terms-and-conditions")}>
          Terms and Conditions
        </Text>
        {" "}and also the{" "}
        <Text style={styles.link} onPress={() => openPolicy("privacy-policy")}>
          Privacy Policy
        </Text>
        {" "}of the app.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 12, marginBottom: 12 },
  text: { color: "#94A3B8", fontSize: 13, lineHeight: 19, textAlign: "center" },
  link: { color: "#22C55E", fontWeight: "700" },
});
