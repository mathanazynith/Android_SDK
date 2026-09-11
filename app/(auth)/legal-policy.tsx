import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LegalPolicy, LegalPolicyType, legalAPI } from "../../service/api";

const validPolicyTypes: LegalPolicyType[] = ["terms-and-conditions", "privacy-policy"];

type PolicyBlock =
  | { type: "heading" | "paragraph" | "bullet"; text: string }
  | { type: "contact"; label: string; text: string }
  | { type: "contactHeading" | "contactSubtext"; text: string };

const decodeHtml = (value: string) => value
  .replace(/<\/?(?:p|div|br)\b[^>]*>/gi, "\n")
  .replace(/<[^>]+>/g, "")
  .replace(/&nbsp;/gi, " ")
  .replace(/&amp;/gi, "&")
  .replace(/&lt;/gi, "<")
  .replace(/&gt;/gi, ">")
  .replace(/&bull;/gi, "•")
  .replace(/\u00e2\u0080\u00a2/g, "•")
  .replace(/&#39;|&apos;/gi, "'")
  .replace(/&quot;/gi, '"')
  .replace(/[ \t]+/g, " ")
  .replace(/\s*\n\s*/g, "\n")
  .trim();

const sectionHeadings = [
  "Recurring Payments and Auto-Renewal",
  "User Content and Information",
  "Running and Fitness Disclaimer",
  "Account Suspension or Termination",
  "Limitation of Liability",
  "Third-Party Services",
  "Intellectual Property",
  "Service Availability",
  "Payment Processing",
  "Changes to These Terms",
  "About ZyRun",
  "Acceptable Use",
  "Contact Us",
  "Eligibility",
  "Subscriptions",
  "Pricing",
];

const splitSectionHeading = (text: string) => {
  const heading = sectionHeadings.find((value) => text === value || text.startsWith(`${value} `));
  if (!heading) return null;
  return { heading, body: text.slice(heading.length).trim() };
};

const getPolicyBlocks = (html: string): PolicyBlock[] => {
  const blocks: PolicyBlock[] = [];
  const blockPattern = /<(h[1-3]|li|p|div)\b[^>]*>([\s\S]*?)<\/\1>|<br\s*\/?>(?![^<]*<\/)/gi;
  let match: RegExpExecArray | null;

  while ((match = blockPattern.exec(html)) !== null) {
    const text = decodeHtml(match[2] || "");
    if (!text) continue;

    const tag = (match[1] || "").toLowerCase();
    const type = tag === "li" ? "bullet" : tag.startsWith("h") ? "heading" : "paragraph";
    const parts = text.split(/\s*[•●]\s*/).map((part) => part.trim()).filter(Boolean);

    if (type === "paragraph" && /(?:^|\n)(Email|Phone|Address):/i.test(text)) {
      text.split("\n").map((line) => line.trim()).filter(Boolean).forEach((line) => {
        const contact = line.match(/^(Email|Phone|Address):\s*(.*)$/i);
        if (contact) {
          blocks.push({ type: "contact", label: `${contact[1]}:`, text: contact[2] });
        } else if (/^ZyRun$/i.test(line)) {
          blocks.push({ type: "contact", label: "Company:", text: "ZyRun" });
        } else {
          blocks.push({ type: "paragraph", text: line });
        }
      });
      continue;
    }

    if (type === "bullet" && /^Contact Us\b/i.test(text)) {
      blocks.push({ type: "contactHeading", text: "Contact Us" });
      const subtext = text.replace(/^Contact Us\s*/i, "").trim();
      if (subtext) blocks.push({ type: "contactSubtext", text: subtext });
      continue;
    }

    blocks.push({ type, text: parts[0] });
    parts.slice(1).forEach((part) => blocks.push({ type: "bullet", text: part }));
  }

  if (blocks.length > 0) return blocks;

  const text = decodeHtml(html);
  return text ? [{ type: "paragraph", text }] : [];
};

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

  useEffect(() => {
    const timer = setTimeout(() => { void loadPolicy(); }, 0);
    return () => clearTimeout(timer);
  }, [loadPolicy]);

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
          {(() => {
            const blocks = getPolicyBlocks(policy.content);
            const contactRows = blocks.filter((block) => block.type === "contact");
            return (
              <View>
                {blocks.map((block, index) => {
                  if (block.type === "contactHeading") {
                    const subtext = blocks.find((item) => item.type === "contactSubtext");
                    return (
                      <View key={`${block.type}-${index}`} style={styles.contactContainer}>
                        <Text style={styles.contactHeading}>{block.text}</Text>
                        {subtext?.type === "contactSubtext" ? <Text style={styles.contactSubtext}>{subtext.text}</Text> : null}
                        {contactRows.map((row, rowIndex) => row.type === "contact" ? (
                          <View key={`${row.type}-${rowIndex}`} style={styles.contactRow}>
                            <Text style={styles.contactLabel}>{row.label}</Text>
                            <Text style={styles.contactValue}>{row.text}</Text>
                          </View>
                        ) : null)}
                      </View>
                    );
                  }

                  if (block.type === "contact" || block.type === "contactSubtext") return null;

                  return (
                    <Text
                      key={`${block.type}-${index}`}
                      style={block.type === "heading" ? styles.heading : block.type === "bullet" ? styles.bullet : styles.document}
                    >
                      {block.type === "bullet" ? "• " : ""}
                      {block.type === "bullet" && splitSectionHeading(block.text) ? (
                        <>
                          <Text style={styles.inlineHeading}>{splitSectionHeading(block.text)?.heading}</Text>
                          {splitSectionHeading(block.text)?.body ? ` ${splitSectionHeading(block.text)?.body}` : ""}
                        </>
                      ) : block.text}
                    </Text>
                  );
                })}
              </View>
            );
          })()}
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
  header: { minHeight: 62, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#334155", paddingTop: 4, paddingHorizontal: 12 },
  closeButton: { width: 48, height: 48, padding: 12, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, color: "#F8FAFC", fontSize: 17, fontWeight: "700", textAlign: "center" },
  headerSpacer: { width: 48 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: 28 },
  statusText: { color: "#94A3B8", fontSize: 14, textAlign: "center", marginTop: 14 },
  content: { padding: 24, paddingBottom: 48 },
  title: { color: "#22C55E", fontSize: 25, fontWeight: "800", marginBottom: 12 },
  meta: { color: "#94A3B8", fontSize: 12, marginBottom: 24 },
  heading: { color: "#22C55E", fontSize: 18, fontWeight: "800", lineHeight: 26, marginTop: 16, marginBottom: 6, textAlign: "justify" },
  inlineHeading: { color: "#22C55E", fontWeight: "800" },
  document: { color: "#E2E8F0", fontSize: 16, lineHeight: 25, marginBottom: 12, textAlign: "justify" },
  bullet: { color: "#E2E8F0", fontSize: 16, lineHeight: 25, marginBottom: 10, paddingLeft: 6, textAlign: "justify" },
  contactContainer: { marginTop: 16, marginBottom: 16, paddingTop: 4 },
  contactHeading: { color: "#22C55E", fontSize: 18, fontWeight: "800", lineHeight: 26, marginBottom: 6 },
  contactSubtext: { color: "#E2E8F0", fontSize: 16, lineHeight: 25, marginBottom: 14, textAlign: "justify" },
  contactRow: { flexDirection: "row", alignItems: "flex-start", marginBottom: 10 },
  contactLabel: { color: "#22C55E", fontSize: 16, fontWeight: "800", lineHeight: 25, width: 78 },
  contactValue: { color: "#E2E8F0", flex: 1, fontSize: 16, lineHeight: 25, textAlign: "left" },
  emptyTitle: { color: "#F8FAFC", fontSize: 18, fontWeight: "700", marginTop: 14 },
  retryButton: { backgroundColor: "#22C55E", borderRadius: 9, paddingHorizontal: 22, paddingVertical: 11, marginTop: 20 },
  retryText: { color: "#052E16", fontWeight: "800" },
});
