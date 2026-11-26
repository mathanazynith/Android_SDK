import { Feather, Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Platform,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Avatar } from "../../../components/Avatar";
import ActivityRouteMap from "../../../components/ActivityRouteMap";
import ActivitySplitsModal from "../../../components/ActivitySplitsModal";
import OriginZoomModal from "../../../components/navigation/OriginZoomModal";
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
import type { ActivitySegmentSplits } from "../../../src/types/activity";
import { formatDurationHhMmSs } from "../../../src/utils/splitFormatters";
import type { DashboardLaunchOrigin } from "../../../components/navigation/dashboardLaunchTransition";

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
  const hours = Math.floor(total / 3600);
  const remainder = total % 60;
  return hours > 0
    ? `${String(hours).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
};
const paceText = (secondsPerKm: number) => {
  if (!Number.isFinite(secondsPerKm) || secondsPerKm <= 0) return "--:--/km";
  const total = Math.round(secondsPerKm);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}/km`;
};

export default function RunnerProfileScreen() {
  const { colors } = useTheme();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
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
  const [reportTarget, setReportTarget] = useState<{ target_type: "USER" | "POST"; target_id: number; label: "runner" | "workout" } | null>(null);
  const [reportReason, setReportReason] = useState<ContentReportReason | null>(null);
  const [reportDetails, setReportDetails] = useState("");
  const [reportBusy, setReportBusy] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [reportSuccessMessage, setReportSuccessMessage] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [runnerOptionsVisible, setRunnerOptionsVisible] = useState(false);
  const [runnerOptionsOrigin, setRunnerOptionsOrigin] = useState<DashboardLaunchOrigin | undefined>();
  const runnerOptionsButtonRef = useRef<View>(null);
  const runnerOptionsExitActionRef = useRef<(() => void) | null>(null);
  const [blockConfirmVisible, setBlockConfirmVisible] = useState(false);
  const [detailsPost, setDetailsPost] = useState<SocialPost | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [splitsVisible, setSplitsVisible] = useState(false);
  const detailsRequestId = useRef(0);
  const isOwnProfile = profile !== null && user?.id != null && String(profile.id) === String(user.id);

  const detailSegments = useMemo<ActivitySegmentSplits[]>(() => (
    (detailsPost?.activity.segments ?? []).map((segment) => {
      const mapSplit = (split: NonNullable<typeof segment.splits>[number]) => ({
        split_number: split.split_number,
        distance_m: split.distance_m,
        time_s: split.time_s,
        pace_s_per_km: split.pace_s_per_km ?? 0,
        steps: split.steps,
        average_spm: split.average_spm,
        cadence_spm: split.cadence_spm,
      });
      return {
        sequence: segment.sequence,
        type: segment.type,
        planned_distance_m: segment.planned_distance_m ?? undefined,
        completed_distance_m: segment.completed_distance_m ?? undefined,
        actual_time_s: segment.actual_time_s ?? undefined,
        actual_pace_s_per_km: segment.actual_pace_s_per_km ?? undefined,
        splits: (segment.splits ?? segment.laps?.flatMap((lap) => lap.splits) ?? []).map(mapSplit),
        laps: segment.laps?.map((lap) => ({
          sequence: lap.lap_number,
          label: `Lap ${lap.lap_number}`,
          distance_m: lap.distance_m,
          time_s: lap.time_s,
          pace_s_per_km: lap.pace_s_per_km ?? undefined,
          steps: lap.steps,
          cadence_spm: lap.cadence_spm,
          splits: lap.splits.map(mapSplit),
        })),
      };
    })
  ), [detailsPost?.activity.segments]);

  const openPostDetails = useCallback(async (post: SocialPost) => {
    const requestId = detailsRequestId.current + 1;
    detailsRequestId.current = requestId;
    setDetailsPost(post);
    setDetailsError(null);
    setDetailsLoading(true);
    try {
      const response = await socialAPI.getPost(post.id);
      if (detailsRequestId.current === requestId) setDetailsPost(response.data.data);
    } catch (detailError) {
      if (detailsRequestId.current === requestId) setDetailsError(getBackendErrorMessage(detailError, "Unable to load workout details."));
    } finally {
      if (detailsRequestId.current === requestId) setDetailsLoading(false);
    }
  }, []);

  const closePostDetails = useCallback(() => {
    detailsRequestId.current += 1;
    setDetailsPost(null);
    setDetailsError(null);
    setDetailsLoading(false);
    setSplitsVisible(false);
  }, []);

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
    runnerOptionsExitActionRef.current = () => setBlockConfirmVisible(true);
    setRunnerOptionsVisible(false);
  }, [profile]);

  const performBlockAction = useCallback(async () => {
    if (!profile || actionBusy) return;
    const blocked = profile.is_blocked_by_me;
    setActionBusy(true);
    setError(null);
    try {
      if (blocked) await connectionsAPI.unblockAccount(userId);
      else await connectionsAPI.blockAccount(userId);
      setBlockConfirmVisible(false);
      if (blocked) setProfile((current) => current ? { ...current, is_blocked_by_me: false } : current);
      else router.back();
    } catch (actionError) {
      setError(getBackendErrorMessage(actionError, blocked ? "Unable to unblock runner." : "Unable to block runner."));
    } finally {
      setActionBusy(false);
    }
  }, [actionBusy, profile, userId]);

  const submitReport = useCallback(async () => {
    if (!reportTarget || !reportReason || reportBusy) return;
    setReportBusy(true);
    setReportError(null);
    try {
      const response = await socialAPI.reportContent({
        target_type: reportTarget.target_type,
        target_id: reportTarget.target_id,
        reason: reportReason,
        ...(reportDetails.trim() ? { details: reportDetails.trim() } : {}),
      });
      setReportSuccessMessage(response.data.message?.trim() || "Thanks. Your report was sent privately to the moderation team.");
    } catch (submitError) {
      setReportError(getBackendErrorMessage(submitError, "Unable to send this report."));
    } finally {
      setReportBusy(false);
    }
  }, [reportBusy, reportDetails, reportReason, reportTarget]);

  const openReport = useCallback((target: { target_type: "USER" | "POST"; target_id: number; label: "runner" | "workout" }) => {
    setReportTarget(target);
    setReportReason(null);
    setReportDetails("");
    setReportError(null);
    setReportSuccessMessage(null);
  }, []);

  const openRunnerOptions = useCallback(() => {
    if (!profile || isOwnProfile) return;
    runnerOptionsButtonRef.current?.measureInWindow((x, y, width, height) => {
      setRunnerOptionsOrigin({ x, y, width, height });
      setRunnerOptionsVisible(true);
    });
  }, [isOwnProfile, profile]);

  const header = (
    <View>
      <View style={styles.topBar}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.back()} style={styles.iconButton}>
          <Feather name="arrow-left" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.pageTitle, { color: colors.text }]}>Runner</Text>
        {profile && !isOwnProfile ? (
          <TouchableOpacity ref={runnerOptionsButtonRef} accessibilityRole="button" accessibilityLabel="Runner options" accessibilityState={{ disabled: actionBusy }} disabled={actionBusy} onPress={openRunnerOptions} style={styles.iconButton}>
            {actionBusy ? <ActivityIndicator size="small" color={colors.primary} /> : <Ionicons name="ellipsis-horizontal-circle-outline" size={25} color={colors.textSecondary} />}
          </TouchableOpacity>
        ) : <View style={styles.iconButton} />}
      </View>
      {profile ? (
        <View style={[styles.profileCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.profileTopRow}>
            <View style={styles.profileIdentity}>
              <Avatar name={profile.full_name || profile.username} imageUrl={profile.avatar_url || undefined} size={50} />
              <View style={styles.profileCopy}>
                <Text numberOfLines={1} style={[styles.name, { color: colors.text }]}>{profile.full_name || profile.username}</Text>
                <Text numberOfLines={1} style={[styles.username, { color: colors.textSecondary }]}>@{profile.username}</Text>
                {profile.is_private ? <View style={styles.privateBadge}><Feather name="lock" size={11} color={colors.textSecondary} /><Text style={[styles.privateText, { color: colors.textSecondary }]}>Private account</Text></View> : null}
              </View>
            </View>
            <View style={styles.countRow}>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${profile.followers_count} followers`} style={styles.countButton} onPress={() => void selectTab("followers")}>
                <Text style={[styles.countValue, { color: colors.text }]}>{profile.followers_count}</Text>
                <Text style={[styles.countLabel, { color: colors.textSecondary }]}>Followers</Text>
              </TouchableOpacity>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${profile.following_count} following`} style={styles.countButton} onPress={() => void selectTab("following")}>
                <Text style={[styles.countValue, { color: colors.text }]}>{profile.following_count}</Text>
                <Text style={[styles.countLabel, { color: colors.textSecondary }]}>Following</Text>
              </TouchableOpacity>
            </View>
          </View>
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
        {!isOwnProfile ? <TouchableOpacity accessibilityRole="button" accessibilityLabel="Report workout" onPress={() => openReport({ target_type: "POST", target_id: post.id, label: "workout" })} style={styles.iconButton}>
          <Ionicons name="ellipsis-horizontal-circle-outline" size={22} color={colors.textSecondary} />
        </TouchableOpacity> : null}
      </View>
      <View style={styles.metricsRow}>
        <Feather name="clock" size={13} color={colors.textTertiary} />
        <Text style={[styles.metricText, { color: colors.textSecondary }]}>{durationText(post.activity.moving_time)}</Text>
        <Feather name="compass" size={13} color={colors.textTertiary} />
        <Text style={[styles.metricText, { color: colors.textSecondary }]}>{paceText(post.activity.avg_pace)}</Text>
        <Text style={[styles.metricDate, { color: colors.textTertiary }]}>{new Date(post.activity.start_time).toLocaleDateString()}</Text>
      </View>
      {!post.hide_map && post.activity.encoded_polyline ? (
        <View style={[styles.map, { borderColor: colors.border }]}>
          <ActivityRouteMap encodedPolyline={post.activity.encoded_polyline} variant="preview" compactPreview compactPreviewHeight={126} googleMapPreview />
        </View>
      ) : null}
      {post.caption ? <Text style={[styles.caption, { color: colors.text }]}>{post.caption}</Text> : null}
      <TouchableOpacity accessibilityRole="button" onPress={() => void openPostDetails(post)} style={[styles.detailsButton, { borderTopColor: colors.border }]}>
        <Text style={[styles.detailsButtonText, { color: colors.primary }]}>Details</Text>
        <Feather name="chevron-right" size={15} color={colors.primary} />
      </TouchableOpacity>
    </View>
  );

  const peopleView = tab !== "posts";
  const list = peopleView ? people : posts;
  const hasMore = peopleView ? peopleHasMore : postsHasMore;
  const canShowContent = !profile || profile.can_view_details;
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
      <Modal visible={detailsPost !== null} animationType="slide" onRequestClose={closePostDetails}>
        <SafeAreaView edges={["top", "left", "right", "bottom"]} style={[styles.detailScreen, { backgroundColor: colors.background }]}>
          <View style={[styles.detailHeader, { borderBottomColor: colors.border }]}>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close workout details" onPress={closePostDetails} style={styles.iconButton}>
              <Feather name="chevron-left" size={24} color={colors.text} />
            </TouchableOpacity>
            <Text style={[styles.detailHeaderTitle, { color: colors.text }]}>Workout details</Text>
            {detailSegments.length > 0 ? (
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Open split details" onPress={() => setSplitsVisible(true)} style={styles.iconButton}>
                <Feather name="list" size={20} color={colors.primary} />
              </TouchableOpacity>
            ) : <View style={styles.iconButton} />}
          </View>
          {detailsPost ? (
            <ScrollView contentContainerStyle={styles.detailContent} showsVerticalScrollIndicator={false}>
              <View style={[styles.detailHero, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={styles.detailHeroTop}>
                  <View style={[styles.detailActivityIcon, { backgroundColor: colors.background }]}><Feather name="activity" size={19} color={colors.primary} /></View>
                  <View style={styles.detailHeroCopy}>
                    <Text style={[styles.detailWorkoutName, { color: colors.text }]}>{detailsPost.activity.activity_type || "Workout"}</Text>
                    <Text style={[styles.detailByline, { color: colors.textSecondary }]}>{detailsPost.author.full_name || detailsPost.author.username} · {new Date(detailsPost.activity.start_time).toLocaleDateString()}</Text>
                  </View>
                </View>
                <Text style={[styles.detailDistance, { color: colors.text }]}>{distanceText(detailsPost.activity.distance_km)}</Text>
                <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Total distance</Text>
              </View>
              <Text style={[styles.detailSectionTitle, { color: colors.textSecondary }]}>WORKOUT SUMMARY</Text>
              <View style={styles.detailStatsGrid}>
                <View style={[styles.detailStat, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Feather name="clock" size={16} color={colors.primary} />
                  <Text style={[styles.detailStatValue, { color: colors.text }]}>{formatDurationHhMmSs(detailsPost.activity.moving_time)}</Text>
                  <Text style={[styles.detailStatLabel, { color: colors.textSecondary }]}>Moving time</Text>
                </View>
                <View style={[styles.detailStat, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Feather name="compass" size={16} color={colors.primary} />
                  <Text style={[styles.detailStatValue, { color: colors.text }]}>{paceText(detailsPost.activity.avg_pace)}</Text>
                  <Text style={[styles.detailStatLabel, { color: colors.textSecondary }]}>Average pace</Text>
                </View>
                <View style={[styles.detailStat, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Feather name="trending-up" size={16} color={colors.primary} />
                  <Text style={[styles.detailStatValue, { color: colors.text }]}>{Math.round(detailsPost.activity.elevation_gain || 0)} m</Text>
                  <Text style={[styles.detailStatLabel, { color: colors.textSecondary }]}>Elevation gain</Text>
                </View>
                <View style={[styles.detailStat, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Feather name="zap" size={16} color={colors.primary} />
                  <Text style={[styles.detailStatValue, { color: colors.text }]}>{Math.round(detailsPost.activity.calories || 0)}</Text>
                  <Text style={[styles.detailStatLabel, { color: colors.textSecondary }]}>Calories</Text>
                </View>
                {detailsPost.activity.elapsed_time !== undefined ? <View style={[styles.detailStat, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Feather name="clock" size={16} color={colors.primary} />
                  <Text style={[styles.detailStatValue, { color: colors.text }]}>{formatDurationHhMmSs(detailsPost.activity.elapsed_time)}</Text>
                  <Text style={[styles.detailStatLabel, { color: colors.textSecondary }]}>Elapsed time</Text>
                </View> : null}
                {detailsPost.activity.total_steps != null ? <View style={[styles.detailStat, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Feather name="activity" size={16} color={colors.primary} />
                  <Text style={[styles.detailStatValue, { color: colors.text }]}>{detailsPost.activity.total_steps.toLocaleString()}</Text>
                  <Text style={[styles.detailStatLabel, { color: colors.textSecondary }]}>Steps</Text>
                </View> : null}
              </View>
              {detailsLoading ? <ActivityIndicator color={colors.primary} /> : null}
              {detailsError ? <Text style={[styles.detailError, { color: colors.textSecondary }]}>{detailsError}</Text> : null}
              {detailsPost.caption ? <View style={[styles.detailCaptionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.detailSectionTitle, { color: colors.textSecondary, marginTop: 0 }]}>NOTE</Text>
                <Text style={[styles.detailCaption, { color: colors.text }]}>{detailsPost.caption}</Text>
              </View> : null}
            </ScrollView>
          ) : null}
        </SafeAreaView>
      </Modal>
      <ActivitySplitsModal
        visible={splitsVisible}
        loading={false}
        error={null}
        segments={detailSegments}
        laps={[]}
        extraSplits={[]}
        distanceUnit={user?.profile?.distance_unit}
        onClose={() => setSplitsVisible(false)}
        onRetry={() => {}}
      />
      <OriginZoomModal
        visible={runnerOptionsVisible}
        transparent
        launchOrigin={runnerOptionsOrigin}
        onRequestClose={() => setRunnerOptionsVisible(false)}
        onExitComplete={() => {
          setRunnerOptionsOrigin(undefined);
          runnerOptionsExitActionRef.current?.();
          runnerOptionsExitActionRef.current = null;
        }}
      >
        <View style={styles.actionOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setRunnerOptionsVisible(false)} accessibilityLabel="Close runner options" />
          <View style={[styles.actionPopover, {
            width: Math.min(windowWidth - 24, 276),
            top: Math.max(8, Math.min((runnerOptionsOrigin?.y ?? 60) + (runnerOptionsOrigin?.height ?? 36) + 6, windowHeight - 178)),
            right: Math.max(12, windowWidth - (runnerOptionsOrigin?.x ?? windowWidth - 50) - (runnerOptionsOrigin?.width ?? 38)),
            backgroundColor: colors.surface,
            borderColor: colors.border,
          }]}>
            <View style={styles.actionHeading}>
              <Avatar name={profile?.full_name || profile?.username || "Runner"} imageUrl={profile?.avatar_url || undefined} size={38} />
              <View style={styles.actionHeadingCopy}>
                <Text style={[styles.actionTitle, { color: colors.text }]} numberOfLines={1}>{profile?.full_name || profile?.username}</Text>
                <Text style={[styles.actionSubtitle, { color: colors.textSecondary }]}>Runner options</Text>
              </View>
            </View>
            <TouchableOpacity
              accessibilityRole="button"
              onPress={() => {
                if (profile) {
                  runnerOptionsExitActionRef.current = () => openReport({ target_type: "USER", target_id: profile.id, label: "runner" });
                  setRunnerOptionsVisible(false);
                }
              }}
              style={[styles.actionRow, { borderColor: colors.border }]}
            >
              <Feather name="flag" size={17} color={colors.text} />
              <Text style={[styles.actionRowText, { color: colors.text }]}>Report runner</Text>
              <Feather name="chevron-right" size={17} color={colors.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              disabled={actionBusy}
              onPress={confirmBlock}
              style={[styles.actionRow, { borderColor: colors.border }]}
            >
              <Feather name={profile?.is_blocked_by_me ? "user-check" : "user-x"} size={17} color={profile?.is_blocked_by_me ? colors.primary : "#E5484D"} />
              <Text style={[styles.actionRowText, { color: profile?.is_blocked_by_me ? colors.primary : "#E5484D" }]}>{profile?.is_blocked_by_me ? "Unblock runner" : "Block runner"}</Text>
              <Feather name="chevron-right" size={17} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>
      </OriginZoomModal>
      <Modal visible={blockConfirmVisible} transparent animationType="fade" onRequestClose={() => !actionBusy && setBlockConfirmVisible(false)}>
        <View style={styles.actionOverlay}>
          <Pressable style={StyleSheet.absoluteFill} disabled={actionBusy} onPress={() => setBlockConfirmVisible(false)} accessibilityLabel="Close block confirmation" />
          <View style={[styles.actionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.actionTitle, { color: colors.text }]}>{profile?.is_blocked_by_me ? "Unblock runner?" : "Block runner?"}</Text>
            <Text style={[styles.actionDescription, { color: colors.textSecondary }]}>
              {profile?.is_blocked_by_me
                ? `${profile.full_name || profile.username} will be able to find and interact with you again.`
                : `${profile?.full_name || profile?.username} will no longer be able to find or interact with you.`}
            </Text>
            <TouchableOpacity disabled={actionBusy} onPress={() => void performBlockAction()} style={[styles.actionPrimary, { backgroundColor: colors.primary, opacity: actionBusy ? 0.65 : 1 }]}>
              {actionBusy ? <ActivityIndicator size="small" color={colors.primaryText} /> : <Text style={[styles.actionPrimaryText, { color: colors.primaryText }]}>{profile?.is_blocked_by_me ? "Unblock" : "Block runner"}</Text>}
            </TouchableOpacity>
            <TouchableOpacity disabled={actionBusy} onPress={() => setBlockConfirmVisible(false)} style={styles.actionCancel}>
              <Text style={[styles.actionCancelText, { color: colors.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      <Modal visible={reportTarget !== null} transparent animationType="fade" onRequestClose={() => setReportTarget(null)}>
        <KeyboardAvoidingView
          style={styles.reportKeyboardAvoiding}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={0}
        >
        <View style={styles.reportOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setReportTarget(null)} accessibilityLabel="Close report" />
          <ScrollView
            style={styles.reportFormScroll}
            contentContainerStyle={styles.reportFormScrollContent}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
            automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
            showsVerticalScrollIndicator={false}
          >
          <View style={[styles.reportCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {reportSuccessMessage ? (
              <>
                <Text style={[styles.reportTitle, { color: colors.text }]}>Report sent</Text>
                <Text style={[styles.reportHint, { color: colors.textSecondary }]}>{reportSuccessMessage}</Text>
                <TouchableOpacity onPress={() => setReportTarget(null)} style={[styles.submitReport, { backgroundColor: colors.primary }]}>
                  <Text style={[styles.submitReportText, { color: colors.primaryText }]}>Done</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={[styles.reportTitle, { color: colors.text }]}>Report {reportTarget?.label}</Text>
                <Text style={[styles.reportHint, { color: colors.textSecondary }]}>Choose a reason to send this {reportTarget?.label} to moderation.</Text>
                <ScrollView style={styles.reasonList} nestedScrollEnabled keyboardShouldPersistTaps="handled">
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
                  maxLength={1000}
                  multiline
                  style={[styles.reportInput, { color: colors.text, borderColor: colors.border }]}
                />
                {reportError ? <Text style={[styles.errorText, { color: "#E5484D" }]}>{reportError}</Text> : null}
                <TouchableOpacity disabled={!reportReason || reportBusy} onPress={() => void submitReport()} style={[styles.submitReport, { backgroundColor: colors.primary, opacity: !reportReason || reportBusy ? 0.55 : 1 }]}>
                  {reportBusy ? <ActivityIndicator size="small" color={colors.primaryText} /> : <Text style={[styles.submitReportText, { color: colors.primaryText }]}>Send report</Text>}
                </TouchableOpacity>
              </>
            )}
          </View>
          </ScrollView>
        </View>
        </KeyboardAvoidingView>
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
  profileCard: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 15, padding: 12, marginTop: 6 },
  profileTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  profileIdentity: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 9 },
  profileCopy: { flex: 1, minWidth: 0 },
  name: { fontSize: 15, fontWeight: "800" },
  username: { fontSize: 12, marginTop: 2 },
  privateBadge: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 5 },
  privateText: { fontSize: 11 },
  countRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  countButton: { minWidth: 54, alignItems: "center", paddingVertical: 4, paddingHorizontal: 2 },
  countValue: { fontSize: 15, fontWeight: "800" },
  countLabel: { fontSize: 10, marginTop: 2 },
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
  postCard: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 13, padding: 9, marginTop: 9 },
  postTitleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  postSummary: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8 },
  postType: { fontSize: 14, fontWeight: "700" },
  postDistance: { marginLeft: "auto", fontSize: 13, fontWeight: "800" },
  metricsRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 5 },
  metricText: { fontSize: 11 },
  metricDate: { fontSize: 10, marginLeft: "auto" },
  map: { marginTop: 9, overflow: "hidden", borderRadius: 12, borderWidth: StyleSheet.hairlineWidth },
  caption: { fontSize: 13, lineHeight: 18, marginTop: 9 },
  detailsButton: { minHeight: 32, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderTopWidth: StyleSheet.hairlineWidth, marginTop: 8, paddingTop: 6 },
  detailsButtonText: { fontSize: 11, fontWeight: "700" },
  detailScreen: { flex: 1 },
  detailHeader: { height: 52, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: 8 },
  detailHeaderTitle: { fontSize: 16, fontWeight: "800" },
  detailContent: { padding: 12, paddingBottom: 24, gap: 10 },
  detailHero: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, padding: 10 },
  detailHeroTop: { flexDirection: "row", alignItems: "center", gap: 9 },
  detailActivityIcon: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  detailHeroCopy: { flex: 1, minWidth: 0 },
  detailWorkoutName: { fontSize: 15, fontWeight: "800" },
  detailByline: { fontSize: 10, marginTop: 3 },
  detailDistance: { fontSize: 24, fontWeight: "800", marginTop: 9 },
  detailLabel: { fontSize: 10, marginTop: 2 },
  detailSectionTitle: { fontSize: 10, fontWeight: "800", letterSpacing: 0.8, marginTop: 3 },
  detailStatsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  detailStat: { width: "48%", minHeight: 76, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 8, justifyContent: "center" },
  detailStatValue: { fontSize: 14, fontWeight: "800", marginTop: 5 },
  detailStatLabel: { fontSize: 10, marginTop: 1 },
  detailError: { fontSize: 12, lineHeight: 17 },
  detailCaptionCard: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 10, gap: 6 },
  detailCaption: { fontSize: 13, lineHeight: 19 },
  loadMore: { minHeight: 42, alignItems: "center", justifyContent: "center", borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, marginTop: 14 },
  loadMoreText: { fontSize: 13, fontWeight: "700" },
  moreSpinner: { margin: 12 },
  actionOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.42)" },
  actionCard: { width: "100%", maxWidth: 420, alignSelf: "center", borderWidth: StyleSheet.hairlineWidth, borderRadius: 18, padding: 15 },
  actionPopover: { position: "absolute", borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, padding: 12, shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 18 },
  actionHeading: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
  actionHeadingCopy: { flex: 1, minWidth: 0 },
  actionTitle: { fontSize: 16, fontWeight: "800" },
  actionSubtitle: { fontSize: 11, marginTop: 3 },
  actionRow: { minHeight: 48, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, paddingHorizontal: 11, flexDirection: "row", alignItems: "center", gap: 10, marginTop: 7 },
  actionRowText: { flex: 1, fontSize: 13, fontWeight: "700" },
  actionCancel: { minHeight: 38, alignItems: "center", justifyContent: "center", marginTop: 7 },
  actionCancelText: { fontSize: 13, fontWeight: "700" },
  actionDescription: { fontSize: 12, lineHeight: 18, marginTop: 8 },
  actionPrimary: { minHeight: 44, borderRadius: 12, alignItems: "center", justifyContent: "center", marginTop: 16 },
  actionPrimaryText: { fontSize: 13, fontWeight: "800" },
  reportOverlay: { flex: 1, justifyContent: "center", padding: 18, backgroundColor: "rgba(0,0,0,0.55)" },
  reportKeyboardAvoiding: { flex: 1 },
  reportFormScroll: { width: "100%", maxHeight: "88%" },
  reportFormScrollContent: { flexGrow: 0, alignItems: "center", justifyContent: "center" },
  reportCard: { width: "100%", maxHeight: "100%", borderWidth: StyleSheet.hairlineWidth, borderRadius: 18, padding: 13 },
  reportTitle: { fontSize: 16, fontWeight: "800" },
  reportHint: { fontSize: 12, lineHeight: 17, marginTop: 5, marginBottom: 8 },
  reasonList: { maxHeight: 190 },
  reasonRow: { minHeight: 36, flexDirection: "row", alignItems: "center", borderBottomWidth: StyleSheet.hairlineWidth },
  reportInput: { minHeight: 50, maxHeight: 76, borderWidth: StyleSheet.hairlineWidth, borderRadius: 10, padding: 9, textAlignVertical: "top", marginTop: 8 },
  submitReport: { minHeight: 40, borderRadius: 11, alignItems: "center", justifyContent: "center", marginTop: 9 },
  submitReportText: { fontSize: 13, fontWeight: "700" },
});
