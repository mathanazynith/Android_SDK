import { Feather } from "@expo/vector-icons";
import React from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Avatar } from "../Avatar";
import ActivityRouteMap from "../ActivityRouteMap";
import { useTheme } from "../../contexts/ThemeContext";
import type { SocialComment, SocialPost } from "../../src/services/socialApi";
import { AnchoredMoreButton, formatDistance, formatDuration, formatPace, formatRelativeTime } from "./FeedPostCard";

type ThemeColors = ReturnType<typeof useTheme>["colors"];

export function PostDetailsModal({
  post,
  colors,
  onClose,
}: {
  post: SocialPost | null;
  colors: ThemeColors;
  onClose: () => void;
}) {
  return (
    <Modal visible={post !== null} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView edges={["top", "left", "right", "bottom"]} style={[styles.modalScreen, { backgroundColor: colors.background }]}>
        <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close workout details" onPress={onClose} style={styles.modalBack}>
            <Feather name="chevron-left" size={25} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.modalTitle, { color: colors.text }]}>Workout details</Text>
          <View style={styles.modalBack} />
        </View>
        {post ? (
          <ScrollView contentContainerStyle={styles.detailsContent} showsVerticalScrollIndicator={false}>
            <View style={[styles.detailsHero, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.detailsHeroTop}>
                <View style={[styles.detailsActivityIcon, { backgroundColor: colors.background }]}>
                  <Feather name="activity" size={20} color={colors.primary} />
                </View>
                <View style={styles.detailsHeroCopy}>
                  <Text style={[styles.detailsActivityName, { color: colors.text }]}>
                    {post.activity.activity_type
                      ? `${post.activity.activity_type.charAt(0).toUpperCase()}${post.activity.activity_type.slice(1).toLowerCase()}`
                      : "Workout"}
                  </Text>
                  <Text style={[styles.detailsByline, { color: colors.textSecondary }]}>
                    {post.author.full_name || post.author.username} · {formatRelativeTime(post.created_at)}
                  </Text>
                </View>
              </View>
              <Text style={[styles.detailsDistance, { color: colors.text }]}>{formatDistance(post.activity.distance_km)}</Text>
              <Text style={[styles.detailsDistanceLabel, { color: colors.textSecondary }]}>Total distance</Text>
            </View>

            {!post.hide_map && post.activity.encoded_polyline ? (
              <View style={[styles.detailsMap, { borderColor: colors.border }]}>
                <ActivityRouteMap
                  encodedPolyline={post.activity.encoded_polyline}
                  variant="preview"
                  compactPreview
                  googleMapPreview
                />
              </View>
            ) : null}

            <Text style={[styles.detailsSectionTitle, { color: colors.textSecondary }]}>ACTIVITY SUMMARY</Text>
            <View style={styles.detailsStatsGrid}>
              <View style={[styles.detailsStatCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Feather name="clock" size={17} color={colors.primary} />
                <Text style={[styles.detailsStatValue, { color: colors.text }]}>{formatDuration(post.activity.moving_time)}</Text>
                <Text style={[styles.detailsStatLabel, { color: colors.textSecondary }]}>Moving time</Text>
              </View>
              <View style={[styles.detailsStatCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Feather name="navigation" size={17} color={colors.primary} />
                <Text style={[styles.detailsStatValue, { color: colors.text }]}>{formatPace(post.activity.avg_pace)}</Text>
                <Text style={[styles.detailsStatLabel, { color: colors.textSecondary }]}>Average pace</Text>
              </View>
              <View style={[styles.detailsStatCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Feather name="trending-up" size={17} color={colors.primary} />
                <Text style={[styles.detailsStatValue, { color: colors.text }]}>{Math.round(post.activity.elevation_gain || 0)} m</Text>
                <Text style={[styles.detailsStatLabel, { color: colors.textSecondary }]}>Elevation gain</Text>
              </View>
              <View style={[styles.detailsStatCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Feather name="zap" size={17} color={colors.primary} />
                <Text style={[styles.detailsStatValue, { color: colors.text }]}>{Math.round(post.activity.calories || 0)}</Text>
                <Text style={[styles.detailsStatLabel, { color: colors.textSecondary }]}>Calories</Text>
              </View>
            </View>

            {post.caption ? (
              <View style={[styles.detailsCaptionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.detailsSectionTitle, { color: colors.textSecondary, marginTop: 0 }]}>NOTE</Text>
                <Text style={[styles.detailsCaption, { color: colors.text }]}>{post.caption}</Text>
              </View>
            ) : null}
          </ScrollView>
        ) : null}
      </SafeAreaView>
    </Modal>
  );
}

export function PostCommentsModal({
  post,
  comments,
  loading,
  sending,
  text,
  colors,
  onTextChange,
  onSend,
  onClose,
  onCommentOptions,
}: {
  post: SocialPost | null;
  comments: SocialComment[];
  loading: boolean;
  sending: boolean;
  text: string;
  colors: ThemeColors;
  onTextChange: (value: string) => void;
  onSend: () => void;
  onClose: () => void;
  onCommentOptions: (comment: SocialComment, anchor: { x: number; y: number; width: number; height: number }) => void;
}) {
  return (
    <Modal visible={post !== null} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView edges={["top", "left", "right", "bottom"]} style={[styles.modalScreen, { backgroundColor: colors.background }]}>
        <KeyboardAvoidingView
          style={styles.keyboardAvoiding}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={0}
        >
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close comments" onPress={onClose} style={styles.modalBack}>
              <Feather name="chevron-left" size={25} color={colors.text} />
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Comments</Text>
            <View style={styles.modalBack} />
          </View>
          {loading ? <ActivityIndicator style={styles.searchLoader} color={colors.primary} /> : null}
          <FlatList
            style={styles.commentsList}
            data={comments}
            keyExtractor={(item) => String(item.id)}
            contentContainerStyle={styles.commentList}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
            automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
            renderItem={({ item }) => (
              <View style={styles.commentRow}>
                <Avatar name={item.author.full_name || item.author.username} imageUrl={item.author.avatar_url || undefined} size={34} />
                <View style={[styles.commentBubble, { backgroundColor: colors.surface }]}>
                  <View style={styles.commentHeader}>
                    <Text style={[styles.commentAuthor, { color: colors.text }]}>{item.author.full_name || item.author.username}</Text>
                    <AnchoredMoreButton
                      label="Comment options"
                      size={16}
                      color={colors.textTertiary}
                      onPress={(anchor) => onCommentOptions(item, anchor)}
                    />
                  </View>
                  <Text style={[styles.commentBody, { color: colors.textSecondary }]}>{item.body}</Text>
                </View>
              </View>
            )}
            ListEmptyComponent={!loading ? (
              <Text style={[styles.emptyCopy, { color: colors.textSecondary }]}>No comments yet. Start the conversation.</Text>
            ) : null}
          />
          <View style={[styles.commentComposer, { borderTopColor: colors.border, paddingBottom: 8 }]}>
            <TextInput
              value={text}
              onChangeText={onTextChange}
              placeholder="Write a comment..."
              placeholderTextColor={colors.textTertiary}
              style={[styles.commentInput, { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border }]}
              maxLength={2000}
              multiline
            />
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Send comment"
              disabled={!text.trim() || sending}
              onPress={onSend}
              style={[styles.sendButton, { backgroundColor: colors.primary, opacity: !text.trim() || sending ? 0.55 : 1 }]}
            >
              {sending ? <ActivityIndicator size="small" color={colors.primaryText} /> : <Feather name="send" size={17} color={colors.primaryText} />}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalScreen: { flex: 1 },
  keyboardAvoiding: { flex: 1 },
  modalHeader: { height: 54, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12 },
  modalBack: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  modalTitle: { fontSize: 17, fontWeight: "700" },
  detailsContent: { padding: 16, paddingBottom: 28, gap: 14 },
  detailsHero: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 18, padding: 16 },
  detailsHeroTop: { flexDirection: "row", alignItems: "center", gap: 11 },
  detailsActivityIcon: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  detailsHeroCopy: { flex: 1, minWidth: 0 },
  detailsActivityName: { fontSize: 16, fontWeight: "800" },
  detailsByline: { fontSize: 11, marginTop: 3 },
  detailsDistance: { fontSize: 30, lineHeight: 36, fontWeight: "800", marginTop: 18 },
  detailsDistanceLabel: { fontSize: 12, marginTop: 2 },
  detailsMap: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, overflow: "hidden" },
  detailsSectionTitle: { fontSize: 10, fontWeight: "800", letterSpacing: 0.9, marginTop: 4 },
  detailsStatsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  detailsStatCard: { width: "48%", minHeight: 104, borderWidth: StyleSheet.hairlineWidth, borderRadius: 15, padding: 12, justifyContent: "center" },
  detailsStatValue: { fontSize: 17, fontWeight: "800", marginTop: 9 },
  detailsStatLabel: { fontSize: 11, marginTop: 2 },
  detailsCaptionCard: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 15, padding: 14, gap: 8 },
  detailsCaption: { fontSize: 14, lineHeight: 20 },
  searchLoader: { margin: 18 },
  commentList: { padding: 16, flexGrow: 1 },
  commentsList: { flex: 1 },
  commentRow: { flexDirection: "row", alignItems: "flex-start", gap: 9, marginBottom: 12 },
  commentBubble: { flex: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 9 },
  commentHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  commentAuthor: { fontSize: 12, fontWeight: "700" },
  commentBody: { fontSize: 13, lineHeight: 18, marginTop: 3 },
  commentComposer: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, paddingTop: 10, flexDirection: "row", alignItems: "flex-end", gap: 8 },
  commentInput: { flex: 1, minHeight: 40, maxHeight: 110, borderWidth: StyleSheet.hairlineWidth, borderRadius: 18, paddingHorizontal: 13, paddingTop: 10, paddingBottom: 9, fontSize: 13, textAlignVertical: "center" },
  sendButton: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", marginBottom: 2 },
  emptyCopy: { fontSize: 13, lineHeight: 19, textAlign: "center", marginTop: 8, paddingHorizontal: 12 },
});
