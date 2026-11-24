import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Avatar } from "../../../components/Avatar";
import ActivityRouteMap from "../../../components/ActivityRouteMap";
import { useTheme } from "../../../contexts/ThemeContext";
import { getBackendErrorMessage } from "../../../service/api";
import { useAuth } from "../../../service/auth";
import {
  connectionsAPI,
  extractApiResults,
  socialAPI,
  type ConnectionProfile,
  type ConnectionUser,
  type ContentReportReason,
  type SocialPost,
} from "../../../src/services/socialApi";

type ProfileTab = "posts" | "followers" | "following";
const reportReasons: { value: ContentReportReason; label: string }[] = [
  { value: "SPAM", label: "Spam or scam" },
  { value: "HARASSMENT", label: "Harassment or bullying" },
  { value: "HATE", label: "Hateful content" },
  { value: "INAPPROPRIATE", label: "Inappropriate content" },
  { value: "DANGEROUS", label: "Dangerous activity" },
  { value: "IMPERSONATION", label: "Impersonation" },
  { value: "OTHER", label: "Other" },
];

const distanceText = (distance: number) => `${Number(distance || 0).toFixed(2)} km`;
const durationText = (seconds: number) => {
  const total = Math.max(0, Math.floor(seconds || 0));
  const minutes = Math.floor(total / 60);
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
};

export default function RunnerProfileScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const userId = Number(id);
  const [profile, setProfile] = useState<ConnectionProfile | null>(null);
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [people, setPeople] = useState<ConnectionUser[]>([]);
  const [tab, setTab] = useState<ProfileTab>("posts");
  const [postCursor, setPostCursor] = useState<string | null>(null);
  const [peopleCursor, setPeopleCursor] = useState<string | null>(null);
  const [postsHasMore, setPostsHasMore] = useState(false);
  const [peopleHasMore, setPeopleHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reportPost, setReportPost] = useState<SocialPost | null>(null);
  const [reportReason, setReportReason] = useState<ContentReportReason | null>(null);
  const [reportDetails, setReportDetails] = useState("");
  const [reportBusy, setReportBusy] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  const loadProfile = useCallback(async (refresh = false) => {
    if (!Number.isInteger(userId) || userId <= 0) {
      setError("This profile could not be opened.");
      setLoading(false);
      return;
    }
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const [profileResponse, postsResponse] = await Promise.all([
        connectionsAPI.getUserProfile(userId),
        socialAPI.getUserPosts(userId),
      ]);
      setProfile(profileResponse.data.data);
      const page = postsResponse.data.data;
      setPosts(extractApiResults<SocialPost>(postsResponse.data));
      setPostCursor(page.next_cursor || null);
      setPostsHasMore(Boolean(page.has_more));
    } catch (loadError) {
      setError(getBackendErrorMessage(loadError, "Unable to load this profile."));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId]);

  useEffect(() => { void loadProfile(); }, [loadProfile]);

  const selectTab = useCallback(async (nextTab: ProfileTab) => {
    setTab(nextTab);
    setError(null);
    if (nextTab === "posts") return;
    setPeople([]);
    setPeopleCursor(null);
    setPeopleHasMore(false);
    setLoadingMore(true);
    try {
      const response = nextTab === "followers"
        ? await connectionsAPI.getUserFollowers(userId)
        : await connectionsAPI.getUserFollowing(userId);
      const page = response.data.data;
      setPeople(extractApiResults<ConnectionUser>(response.data));
      setPeopleCursor(page.next_cursor || null);
      setPeopleHasMore(Boolean(page.has_more));
      if (page.locked) setProfile((current) => current ? { ...current, can_view_details: false } : current);
    } catch (loadError) {
      setError(getBackendErrorMessage(loadError, `Unable to load ${nextTab}.`));
    } finally {
      setLoadingMore(false);
    }
  }, [userId]);

  const loadMore = useCallback(async () => {
    if (loadingMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      if (tab === "posts" && postsHasMore && postCursor) {
        const response = await socialAPI.getUserPosts(userId, postCursor);
        const page = response.data.data;
        setPosts((current) => [...current, ...extractApiResults<SocialPost>(response.data)]);
        setPostCursor(page.next_cursor || null);
        setPostsHasMore(Boolean(page.has_more));
      } else if (tab !== "posts" && peopleHasMore && peopleCursor) {
        const response = tab === "followers"
          ? await connectionsAPI.getUserFollowers(userId, peopleCursor)
          : await connectionsAPI.getUserFollowing(userId, peopleCursor);
        const page = response.data.data;
        setPeople((current) => [...current, ...extractApiResults<ConnectionUser>(response.data)]);
        setPeopleCursor(page.next_cursor || null);
        setPeopleHasMore(Boolean(page.has_more));
      }
    } catch (loadError) {
      setError(getBackendErrorMessage(loadError, "Unable to load more items."));
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, peopleCursor, peopleHasMore, postCursor, postsHasMore, tab, userId]);

  const confirmBlock = useCallback(() => {
    if (!profile) return;
    const blocked = profile.is_blocked_by_me;
    Alert.alert(
      blocked ? "Unblock runner?" : "Block runner?",
      blocked
        ? `${profile.full_name || profile.username} will be able to find and interact with you again.`
        : `${profile.full_name || profile.username} will no longer be able to find or interact with you.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: blocked ? "Unblock" : "Block",
          style: blocked ? "default" : "destructive",
          onPress: () => {
            void (async () => {
              setActionBusy(true);
              try {
                if (blocked) await connectionsAPI.unblockAccount(userId);
                else await connectionsAPI.blockAccount(userId);
                if (blocked) setProfile((current) => current ? { ...current, is_blocked_by_me: false } : current);
                else router.back();
              } catch (actionError) {
                Alert.alert(blocked ? "Unable to unblock runner" : "Unable to block runner", getBackendErrorMessage(actionError));
              } finally {
                setActionBusy(false);
              }
            })();
          },
        },
      ],
    );
  }, [profile, userId]);

  const submitReport = useCallback(async () => {
    if (!reportPost || !reportReason || reportBusy) return;
    setReportBusy(true);
    setReportError(null);
    try {
      await socialAPI.reportContent({
        target_type: "POST",
        target_id: reportPost.id,
        reason: reportReason,
        ...(reportDetails.trim() ? { details: reportDetails.trim() } : {}),
      });
      setReportPost(null);
      Alert.alert("Report sent", "Thanks. Your report was sent privately to the moderation team.");
    } catch (submitError) {
      setReportError(getBackendErrorMessage(submitError, "Unable to send this report."));
    } finally {
      setReportBusy(false);
    }
  }, [reportBusy, reportDetails, reportPost, reportReason]);

  const header = (
    <View>
      <View style={styles.topBar}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.back()} style={styles.iconButton}>
          <Feather name="arrow-left" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.pageTitle, { color: colors.text }]}>Runner</Text>
        <View style={styles.iconButton} />
      </View>
      {profile ? (
        <View style={[styles.profileCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Avatar name={profile.full_name || profile.username} imageUrl={profile.avatar_url || undefined} size={64} />
          <Text style={[styles.name, { color: colors.text }]}>{profile.full_name || profile.username}</Text>
          <Text style={[styles.username, { color: colors.textSecondary }]}>@{profile.username}</Text>
          {profile.is_private ? <View style={styles.privateBadge}><Feather name="lock" size={12} color={colors.textSecondary} /><Text style={[styles.privateText, { color: colors.textSecondary }]}>Private account</Text></View> : null}
          <View style={styles.countRow}>
            <TouchableOpacity style={styles.countButton} onPress={() => void selectTab("followers")}>
              <Text style={[styles.countValue, { color: colors.text }]}>{profile.followers_count}</Text>
              <Text style={[styles.countLabel, { color: colors.textSecondary }]}>Followers</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.countButton} onPress={() => void selectTab("following")}>
              <Text style={[styles.countValue, { color: colors.text }]}>{profile.following_count}</Text>
              <Text style={[styles.countLabel, { color: colors.textSecondary }]}>Following</Text>
            </TouchableOpacity>
          </View>
          {user?.id != null && String(profile.id) !== String(user.id) ? (
            <TouchableOpacity accessibilityRole="button" disabled={actionBusy} onPress={confirmBlock} style={[styles.blockButton, { borderColor: colors.border }]}>
              {actionBusy ? <ActivityIndicator size="small" color={colors.primary} /> : <Feather name={profile.is_blocked_by_me ? "user-check" : "user-x"} size={15} color={profile.is_blocked_by_me ? colors.primary : "#E5484D"} />}
              <Text style={[styles.blockButtonText, { color: profile.is_blocked_by_me ? colors.primary : "#E5484D" }]}>{profile.is_blocked_by_me ? "Unblock runner" : "Block runner"}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
      <View style={[styles.tabs, { borderBottomColor: colors.border }]}>
        {(["posts", "followers", "following"] as const).map((value) => (
          <TouchableOpacity key={value} onPress={() => void selectTab(value)} style={[styles.tab, tab === value && { borderBottomColor: colors.primary }]}>
            <Text style={[styles.tabText, { color: tab === value ? colors.primary : colors.textSecondary }]}>
              {value === "posts" ? "Posts" : value === "followers" ? "Followers" : "Following"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      {error ? <Text style={[styles.errorText, { color: "#E5484D" }]}>{error}</Text> : null}
      {profile && !profile.can_view_details ? (
        <View style={styles.lockedBox}>
          <Feather name="lock" size={25} color={colors.textSecondary} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>This account is private</Text>
          <Text style={[styles.emptyCopy, { color: colors.textSecondary }]}>Posts and connection lists are available only to approved followers.</Text>
        </View>
      ) : null}
    </View>
  );

  const renderPost = (post: SocialPost) => (
    <View key={`post-${post.id}`} style={[styles.postCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.postTitleRow}>
        <View style={styles.postSummary}>
          <Feather name="activity" size={17} color={colors.primary} />
          <Text style={[styles.postType, { color: colors.text }]}>{post.activity.activity_type || "Workout"}</Text>
          <Text style={[styles.postDistance, { color: colors.text }]}>{distanceText(post.activity.distance_km)}</Text>
        </View>
        {!isOwnProfile ? <TouchableOpacity accessibilityRole="button" accessibilityLabel="Report workout" onPress={() => { setReportPost(post); setReportReason(null); setReportDetails(""); setReportError(null); }} style={styles.iconButton}>
          <Feather name="more-horizontal" size={20} color={colors.textSecondary} />
        </TouchableOpacity> : null}
      </View>
      <View style={styles.metricsRow}>
        <Feather name="clock" size={13} color={colors.textTertiary} />
        <Text style={[styles.metricText, { color: colors.textSecondary }]}>{durationText(post.activity.moving_time)}</Text>
        <Feather name="navigation" size={13} color={colors.textTertiary} />
        <Text style={[styles.metricText, { color: colors.textSecondary }]}>{new Date(post.activity.start_time).toLocaleDateString()}</Text>
      </View>
      {!post.hide_map && post.activity.encoded_polyline ? (
        <View style={styles.map}><ActivityRouteMap encodedPolyline={post.activity.encoded_polyline} variant="preview" compactPreview googleMapPreview routeOnly /></View>
      ) : null}
      {post.caption ? <Text style={[styles.caption, { color: colors.text }]}>{post.caption}</Text> : null}
    </View>
  );

  const peopleView = tab !== "posts";
  const list = peopleView ? people : posts;
  const hasMore = peopleView ? peopleHasMore : postsHasMore;
  const canShowContent = !profile || profile.can_view_details;
  const isOwnProfile = profile !== null && user?.id != null && String(profile.id) === String(user.id);

  return (
    <SafeAreaView edges={["top", "left", "right"]} style={[styles.screen, { backgroundColor: colors.background }]}>
      {loading ? <View style={styles.center}><ActivityIndicator color={colors.primary} /></View> : (
        <>
          <ScrollView
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void loadProfile(true)} tintColor={colors.primary} />}
            contentContainerStyle={styles.pageContent}
          >
            {header}
            {canShowContent && !loadingMore && list.length === 0 ? (
              <View style={styles.emptyBox}>
                <Text style={[styles.emptyTitle, { color: colors.text }]}>{peopleView ? `No ${tab} to show` : "No posts yet"}</Text>
              </View>
            ) : null}
            {canShowContent ? (peopleView
              ? people.map((person) => (
                <TouchableOpacity key={`person-${person.id}`} onPress={() => router.push({ pathname: "/(app)/runner/[id]", params: { id: String(person.id) } })} style={[styles.personRow, { borderBottomColor: colors.border }]}>
                  <Avatar name={person.full_name || person.username} imageUrl={person.avatar_url || undefined} size={44} />
                  <View style={styles.personInfo}>
                    <Text style={[styles.postType, { color: colors.text }]}>{person.full_name || person.username}</Text>
                    <Text style={[styles.username, { color: colors.textSecondary }]}>@{person.username}</Text>
                  </View>
                  <Feather name="chevron-right" size={18} color={colors.textTertiary} />
                </TouchableOpacity>
              ))
              : posts.map(renderPost)) : null}
            {canShowContent && hasMore ? (
              <TouchableOpacity disabled={loadingMore} onPress={() => void loadMore()} style={[styles.loadMore, { borderColor: colors.border }]}>
                {loadingMore ? <ActivityIndicator size="small" color={colors.primary} /> : <Text style={[styles.loadMoreText, { color: colors.primary }]}>Load more</Text>}
              </TouchableOpacity>
            ) : null}
            {loadingMore && !hasMore ? <ActivityIndicator style={styles.moreSpinner} size="small" color={colors.primary} /> : null}
          </ScrollView>
        </>
      )}
      <Modal visible={reportPost !== null} transparent animationType="fade" onRequestClose={() => setReportPost(null)}>
        <View style={styles.reportOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setReportPost(null)} accessibilityLabel="Close report" />
          <View style={[styles.reportCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.reportTitle, { color: colors.text }]}>Report workout</Text>
            <Text style={[styles.reportHint, { color: colors.textSecondary }]}>Choose a reason to send this post to moderation.</Text>
            <ScrollView style={styles.reasonList}>
              {reportReasons.map((reason) => {
                const selected = reportReason === reason.value;
                return (
                  <TouchableOpacity key={reason.value} onPress={() => setReportReason(reason.value)} style={[styles.reasonRow, { borderBottomColor: colors.border }]}>
                    <Text style={[styles.personInfo, { color: colors.text }]}>{reason.label}</Text>
                    <Feather name={selected ? "check-circle" : "circle"} size={17} color={selected ? colors.primary : colors.textTertiary} />
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <TextInput
              value={reportDetails}
              onChangeText={setReportDetails}
              placeholder="Additional details (optional)"
              placeholderTextColor={colors.textTertiary}
              maxLength={2000}
              multiline
              style={[styles.reportInput, { color: colors.text, borderColor: colors.border }]}
            />
            {reportError ? <Text style={styles.errorText}>{reportError}</Text> : null}
            <TouchableOpacity disabled={!reportReason || reportBusy} onPress={() => void submitReport()} style={[styles.submitReport, { backgroundColor: colors.primary, opacity: !reportReason || reportBusy ? 0.55 : 1 }]}>
              {reportBusy ? <ActivityIndicator size="small" color={colors.primaryText} /> : <Text style={[styles.submitReportText, { color: colors.primaryText }]}>Send report</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  pageContent: { paddingHorizontal: 14, paddingBottom: 36 },
  topBar: { minHeight: 52, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  pageTitle: { fontSize: 18, fontWeight: "800" },
  iconButton: { width: 38, height: 38, alignItems: "center", justifyContent: "center" },
  profileCard: { alignItems: "center", borderWidth: StyleSheet.hairlineWidth, borderRadius: 18, padding: 18, marginTop: 6 },
  name: { fontSize: 18, fontWeight: "800", marginTop: 10 },
  username: { fontSize: 12, marginTop: 2 },
  privateBadge: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 8 },
  privateText: { fontSize: 11 },
  countRow: { width: "100%", flexDirection: "row", justifyContent: "center", marginTop: 18 },
  countButton: { minWidth: "42%", alignItems: "center", paddingVertical: 4 },
  countValue: { fontSize: 16, fontWeight: "800" },
  countLabel: { fontSize: 11, marginTop: 2 },
  blockButton: { minHeight: 36, flexDirection: "row", alignItems: "center", gap: 7, borderWidth: StyleSheet.hairlineWidth, borderRadius: 18, paddingHorizontal: 13, marginTop: 15 },
  blockButtonText: { fontSize: 12, fontWeight: "700" },
  tabs: { flexDirection: "row", borderBottomWidth: StyleSheet.hairlineWidth, marginTop: 14 },
  tab: { flex: 1, alignItems: "center", paddingVertical: 13, borderBottomWidth: 2, borderBottomColor: "transparent" },
  tabText: { fontSize: 12, fontWeight: "700" },
  errorText: { fontSize: 12, lineHeight: 17, marginVertical: 10 },
  lockedBox: { alignItems: "center", paddingHorizontal: 28, paddingVertical: 42 },
  emptyBox: { alignItems: "center", paddingVertical: 28 },
  emptyTitle: { fontSize: 15, fontWeight: "700", marginTop: 8 },
  emptyCopy: { fontSize: 12, lineHeight: 18, textAlign: "center", marginTop: 6 },
  personRow: { minHeight: 68, flexDirection: "row", alignItems: "center", gap: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  personInfo: { flex: 1, fontSize: 13, fontWeight: "600" },
  postCard: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 15, padding: 11, marginTop: 11 },
  postTitleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  postSummary: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8 },
  postType: { fontSize: 14, fontWeight: "700" },
  postDistance: { marginLeft: "auto", fontSize: 13, fontWeight: "800" },
  metricsRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 5 },
  metricText: { fontSize: 11 },
  map: { marginTop: 9, overflow: "hidden", borderRadius: 12 },
  caption: { fontSize: 13, lineHeight: 18, marginTop: 9 },
  loadMore: { minHeight: 42, alignItems: "center", justifyContent: "center", borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, marginTop: 14 },
  loadMoreText: { fontSize: 13, fontWeight: "700" },
  moreSpinner: { margin: 12 },
  reportOverlay: { flex: 1, justifyContent: "center", padding: 18, backgroundColor: "rgba(0,0,0,0.55)" },
  reportCard: { maxHeight: "85%", borderWidth: StyleSheet.hairlineWidth, borderRadius: 18, padding: 16 },
  reportTitle: { fontSize: 16, fontWeight: "800" },
  reportHint: { fontSize: 12, lineHeight: 17, marginTop: 5, marginBottom: 8 },
  reasonList: { maxHeight: 260 },
  reasonRow: { minHeight: 40, flexDirection: "row", alignItems: "center", borderBottomWidth: StyleSheet.hairlineWidth },
  reportInput: { minHeight: 58, maxHeight: 92, borderWidth: StyleSheet.hairlineWidth, borderRadius: 10, padding: 9, textAlignVertical: "top", marginTop: 10 },
  submitReport: { minHeight: 42, borderRadius: 11, alignItems: "center", justifyContent: "center", marginTop: 12 },
  submitReportText: { fontSize: 13, fontWeight: "700" },
});
