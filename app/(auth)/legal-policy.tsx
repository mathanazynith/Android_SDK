import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LegalPolicy, LegalPolicyType, legalAPI } from "../../service/api";

const validPolicyTypes: LegalPolicyType[] = ["terms-and-conditions", "privacy-policy"];

const displayText = (html: string) => html
  .replace(/<(h1|h2|h3|p|div|li|br)\b[^>]*>/gi, "\n")
  .replace(/<\/[^>]+>/g, "")
  .replace(/&nbsp;/gi, " ")
  .replace(/&amp;/gi, "&")
  .replace(/&lt;/gi, "<")
  .replace(/&gt;/gi, ">")
  .replace(/&#39;|&apos;/gi, "'")
  .replace(/&quot;/gi, '"')
  .replace(/\n\s*\n\s*\n/g, "\n\n")
  .trim();

export default function LegalPolicyViewer() {
  const { policyType: requestedType } = useLocalSearchParams<{ policyType?: string }>();
  const policyType: LegalPolicyType = validPolicyTypes.includes(requestedType as LegalPolicyType)
    ? requestedType as LegalPolicyType
    : "terms-and-conditions";
  const [policy, setPolicy] = useState<LegalPolicy | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const loadPolicy = useCallback(async () => {
    setLoading(true);
    setNotFound(false);
    try {
      const response = await legalAPI.getPolicy(policyType);
      const payload = response.data as LegalPolicy & { data?: LegalPolicy; policy?: LegalPolicy };
      setPolicy(payload.data ?? payload.policy ?? payload);
    } catch (error: any) {
      setPolicy(null);
      const missing = error?.response?.status === 404;
      setNotFound(missing);
      if (!missing) Alert.alert("Unable to load policy", "Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, [policyType]);

  useEffect(() => { loadPolicy(); }, [loadPolicy]);

  const fallbackTitle = policyType === "privacy-policy" ? "Privacy Policy" : "Terms & Conditions";
  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.closeButton} accessibilityRole="button" accessibilityLabel="Close policy">
          <Ionicons name="close" size={25} color="#F8FAFC" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{policy?.title || fallbackTitle}</Text>
        <View style={styles.headerSpacer} />
      </View>

      {loading ? (
        <View style={styles.centered}><ActivityIndicator size="large" color="#22C55E" /><Text style={styles.statusText}>Loading policy…</Text></View>
      ) : policy ? (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={styles.title}>{policy.title}</Text>
          {policy.version ? <Text style={styles.meta}>Version {policy.version}{policy.published_at ? ` · Published ${new Date(policy.published_at).toLocaleDateString()}` : ""}</Text> : null}
          <Text style={styles.document}>{displayText(policy.content)}</Text>
        </ScrollView>
      ) : (
        <View style={styles.centered}>
          <Ionicons name={notFound ? "document-outline" : "cloud-offline-outline"} size={42} color="#94A3B8" />
          <Text style={styles.emptyTitle}>{notFound ? "Policy unavailable" : "Couldn’t load policy"}</Text>
          <Text style={styles.statusText}>{notFound ? "This policy has not been published yet." : "Please try again."}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadPolicy}><Text style={styles.retryText}>Retry</Text></TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#0F172A" },
  header: { minHeight: 58, flexDirection: "row", alignItems: "center", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#334155", paddingHorizontal: 12 },
  closeButton: { width: 42, height: 42, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, color: "#F8FAFC", fontSize: 17, fontWeight: "700", textAlign: "center" },
  headerSpacer: { width: 42 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: 28 },
  statusText: { color: "#94A3B8", fontSize: 14, textAlign: "center", marginTop: 14 },
  content: { padding: 24, paddingBottom: 48 },
  title: { color: "#F8FAFC", fontSize: 25, fontWeight: "800", marginBottom: 6 },
  meta: { color: "#94A3B8", fontSize: 12, marginBottom: 24 },
  document: { color: "#E2E8F0", fontSize: 16, lineHeight: 25 },
  emptyTitle: { color: "#F8FAFC", fontSize: 18, fontWeight: "700", marginTop: 14 },
  retryButton: { backgroundColor: "#22C55E", borderRadius: 9, paddingHorizontal: 22, paddingVertical: 11, marginTop: 20 },
  retryText: { color: "#052E16", fontWeight: "800" },
});
