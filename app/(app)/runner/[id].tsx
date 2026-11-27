import { Feather, Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  Platform,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type AlertButton,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Avatar } from "../../../components/Avatar";
import { RunningLoader } from "../../../components/common/RunningLoader";
import { FeedPostCard, formatDistance, sortSocialPosts } from "../../../components/social/FeedPostCard";
import { PostCommentsModal } from "../../../components/social/PostInteractionModals";
import ActivitySplitsModal from "../../../components/ActivitySplitsModal";
import OriginZoomModal from "../../../components/navigation/OriginZoomModal";
import { useTheme } from "../../../contexts/ThemeContext";
import { getBackendErrorMessage } from "../../../service/api";
import { useAuth } from "../../../service/auth";
import {
  connectionsAPI,
  extractApiResults,
  getOnlyMeDefaultAudience,
  socialAPI,
  type ConnectionProfile,
  type ContentReportReason,
  type ContentReportTargetType,
  type SocialPost,
  type SocialComment,
  type SocialPostVisibility,
  type ConnectionUser,
} from "../../../src/services/socialApi";
import { publishSocialPostDeleted, publishSocialPostPatch, subscribeToSocialPostChanges } from "../../../src/services/socialPostEvents";
import type { ActivitySegmentSplits } from "../../../src/types/activity";
import { formatDurationHhMmSs } from "../../../src/utils/splitFormatters";
import type { DashboardLaunchOrigin } from "../../../components/navigation/dashboardLaunchTransition";

const reportReasons: { value: ContentReportReason; label: string }[] = [
  { value: "SPAM", label: "Spam or scam" },
  { value: "HARASSMENT", label: "Harassment or bullying" },
  { value: "HATE", label: "Hateful content" },
  { value: "INAPPROPRIATE", label: "Inappropriate content" },
  { value: "DANGEROUS", label: "Dangerous activity" },
  { value: "IMPERSONATION", label: "Impersonation" },
  { value: "OTHER", label: "Other" },
];

const postsForUser = (posts: SocialPost[], userId: number) =>
  posts.filter((post) => Number(post.author?.id) === userId);
const appendUniquePosts = (current: SocialPost[], next: SocialPost[]) => {
  const ids = new Set(current.map((post) => post.id));
  return sortSocialPosts([...current, ...next.filter((post) => {
    if (ids.has(post.id)) return false;
    ids.add(post.id);
    return true;
  })]);
};
const distanceText = (distance: number) => `${Number(distance || 0).toFixed(2)} km`;
const paceText = (pace: number) => {
  if (!Number.isFinite(pace) || pace <= 0) return "--:--/km";
  const total = Math.round(pace);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}/km`;
};

type ProfileTab = "posts" | "followers" | "following";

export default function RunnerProfileScreen() {
  const { colors } = useTheme();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const { user } = useAuth();
  const { id, selfProfile } = useLocalSearchParams<{ id: string; selfProfile?: string }>();
  const userId = Number(id);
  const profileLoadRequestId = useRef(0);
  const [profile, setProfile] = useState<ConnectionProfile | null>(null);
  const [canViewProfilePosts, setCanViewProfilePosts] = useState<boolean | null>(null);
  const [activeTab, setActiveTab] = useState<ProfileTab>("posts");
  const [profileConnections, setProfileConnections] = useState<ConnectionUser[]>([]);
  const [profileConnectionsLoading, setProfileConnectionsLoading] = useState(false);
  const [profileConnectionsLoadingMore, setProfileConnectionsLoadingMore] = useState(false);
  const [profileConnectionsError, setProfileConnectionsError] = useState<string | null>(null);
  const [profileConnectionsCursor, setProfileConnectionsCursor] = useState<string | null>(null);
  const [profileConnectionsHasMore, setProfileConnectionsHasMore] = useState(false);
  const profileConnectionsRequestId = useRef(0);
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [postCursor, setPostCursor] = useState<string | null>(null);
  const [postsHasMore, setPostsHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [likingPostIds, setLikingPostIds] = useState<Set<number>>(() => new Set());
  const [detailsPost, setDetailsPost] = useState<SocialPost | null>(null);
  const [commentPost, setCommentPost] = useState<SocialPost | null>(null);
  const [comments, setComments] = useState<SocialComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [sendingComment, setSendingComment] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [editingPost, setEditingPost] = useState<SocialPost | null>(null);
  const [editCaption, setEditCaption] = useState("");
  const [editVisibility, setEditVisibility] = useState<SocialPostVisibility>("PUBLIC");
  const [editCommentsEnabled, setEditCommentsEnabled] = useState(true);
  const [editHideMap, setEditHideMap] = useState(false);
  const [editPostBusy, setEditPostBusy] = useState(false);
  const [editPostError, setEditPostError] = useState<string | null>(null);
  const [postActionMenu, setPostActionMenu] = useState<{
    post: SocialPost;
    anchor: { x: number; y: number; width: number; height: number };
  } | null>(null);
  const [reportTarget, setReportTarget] = useState<{
    type: ContentReportTargetType;
    id: number;
    label: "runner" | "workout" | "comment";
  } | null>(null);
  const [reportReason, setReportReason] = useState<ContentReportReason | null>(null);
  const [reportDetails, setReportDetails] = useState("");
  const [reportBusy, setReportBusy] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [reportSuccessMessage, setReportSuccessMessage] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [postActionBusy, setPostActionBusy] = useState(false);
  const [, setRelativeTimeTick] = useState(0);
  const isOwnProfile = profile !== null && user?.id != null && String(profile.id) === String(user.id);
  const isSelfProfileTabView = isOwnProfile && selfProfile === '1';
  const [runnerOptionsVisible, setRunnerOptionsVisible] = useState(false);
  const [runnerOptionsOrigin, setRunnerOptionsOrigin] = useState<DashboardLaunchOrigin | undefined>();
  const runnerOptionsButtonRef = useRef<View>(null);
  const runnerOptionsExitActionRef = useRef<(() => void) | null>(null);
  const [blockConfirmVisible, setBlockConfirmVisible] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [splitsVisible, setSplitsVisible] = useState(false);
  const detailsRequestId = useRef(0);
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

  useEffect(() => {
    const timer = setInterval(() => setRelativeTimeTick((tick) => tick + 1), 60_000);
    return () => clearInterval(timer);
  }, []);

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
    const requestId = ++profileLoadRequestId.current;
    if (!Number.isInteger(userId) || userId <= 0) {
      setError("This profile could not be opened.");
      setLoading(false);
      return;
    }
    setLoadingMore(false);
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const [profileResponse, postsResponse] = await Promise.all([
        connectionsAPI.getUserProfile(userId),
        socialAPI.getUserPosts(userId),
      ]);
      if (requestId !== profileLoadRequestId.current) return;
      const loadedProfile = profileResponse.data.data;
      const page = postsResponse.data.data;
      const canViewPosts = page.locked === undefined
        ? loadedProfile.can_view_details
        : !page.locked;
      setProfile(loadedProfile);
      setCanViewProfilePosts(canViewPosts);
      setPosts(canViewPosts
        ? appendUniquePosts([], postsForUser(extractApiResults<SocialPost>(postsResponse.data), userId)
          .map((post) => ({ ...post, is_mine: String(user?.id ?? "") === String(post.author.id) })))
        : []);
      const nextPostCursor = page.next_cursor || null;
      setPostCursor(nextPostCursor);
      setPostsHasMore(Boolean(nextPostCursor) && page.has_more !== false);
    } catch (loadError) {
      if (requestId !== profileLoadRequestId.current) return;
      setError(getBackendErrorMessage(loadError, "Unable to load this profile."));
    } finally {
      if (requestId === profileLoadRequestId.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [user?.id, userId]);

  useEffect(() => {
    void loadProfile();
    return () => { profileLoadRequestId.current += 1; };
  }, [loadProfile]);

  useEffect(() => subscribeToSocialPostChanges((change) => {
    if ("deleted" in change) {
      setPosts((current) => current.filter((post) => post.id !== change.postId));
      setDetailsPost((current) => current?.id === change.postId ? null : current);
      setCommentPost((current) => current?.id === change.postId ? null : current);
      setEditingPost((current) => current?.id === change.postId ? null : current);
      return;
    }

    setPosts((current) => current.map((post) => post.id === change.postId ? { ...post, ...change.patch } : post));
    setDetailsPost((current) => current?.id === change.postId ? { ...current, ...change.patch } : current);
    setCommentPost((current) => current?.id === change.postId ? { ...current, ...change.patch } : current);
    setEditingPost((current) => current?.id === change.postId ? { ...current, ...change.patch } : current);
  }), []);

  const loadMore = useCallback(async () => {
    if (loadingMore) return;
    const requestId = profileLoadRequestId.current;
    setLoadingMore(true);
    setError(null);
    try {
      if (postsHasMore && postCursor) {
        const response = await socialAPI.getUserPosts(userId, postCursor);
        if (requestId !== profileLoadRequestId.current) return;
        const page = response.data.data;
        if (page.locked === true) {
          setCanViewProfilePosts(false);
          setPosts([]);
          setPostCursor(null);
          setPostsHasMore(false);
          return;
        }
        if (page.locked === false) setCanViewProfilePosts(true);
        setPosts((current) => appendUniquePosts(
          current,
          postsForUser(extractApiResults<SocialPost>(response.data), userId)
            .map((post) => ({ ...post, is_mine: String(user?.id ?? "") === String(post.author.id) })),
        ));
        const nextPostCursor = page.next_cursor || null;
        setPostCursor(nextPostCursor);
        setPostsHasMore(Boolean(nextPostCursor) && page.has_more !== false);
      }
    } catch (loadError) {
      if (requestId !== profileLoadRequestId.current) return;
      setError(getBackendErrorMessage(loadError, "Unable to load more items."));
    } finally {
      if (requestId === profileLoadRequestId.current) setLoadingMore(false);
    }
  }, [loadingMore, postCursor, postsHasMore, user?.id, userId]);

  const loadProfileConnections = useCallback(async (
    tab: "followers" | "following",
    cursor?: string | null,
  ) => {
    const requestId = profileConnectionsRequestId.current + 1;
    profileConnectionsRequestId.current = requestId;
    if (cursor) setProfileConnectionsLoadingMore(true);
    else setProfileConnectionsLoading(true);
    setProfileConnectionsError(null);
    try {
      const response = tab === "followers"
        ? await connectionsAPI.getUserFollowers(userId, cursor)
        : await connectionsAPI.getUserFollowing(userId, cursor);
      if (profileConnectionsRequestId.current !== requestId) return;
      const page = response.data.data;
      const runners = extractApiResults<ConnectionUser>(response.data);
      setProfileConnections((current) => {
        if (!cursor) return runners;
        const existingIds = new Set(current.map((runner) => runner.id));
        return [...current, ...runners.filter((runner) => {
          if (existingIds.has(runner.id)) return false;
          existingIds.add(runner.id);
          return true;
        })];
      });
      const nextCursor = page.next_cursor || null;
      setProfileConnectionsCursor(nextCursor);
      setProfileConnectionsHasMore(Boolean(nextCursor) && page.has_more !== false);
    } catch (connectionsError) {
      if (profileConnectionsRequestId.current === requestId) {
        setProfileConnectionsError(getBackendErrorMessage(
          connectionsError,
          `Unable to load ${tab}.`,
        ));
      }
    } finally {
      if (profileConnectionsRequestId.current === requestId) {
        setProfileConnectionsLoading(false);
        setProfileConnectionsLoadingMore(false);
      }
    }
  }, [userId]);

  const selectProfileTab = useCallback((tab: ProfileTab) => {
    setActiveTab(tab);
    if (tab === "posts") {
      profileConnectionsRequestId.current += 1;
      setProfileConnectionsLoading(false);
      setProfileConnectionsLoadingMore(false);
      return;
    }
    setProfileConnections([]);
    setProfileConnectionsCursor(null);
    setProfileConnectionsHasMore(false);
    void loadProfileConnections(tab);
  }, [loadProfileConnections]);

  const loadMoreProfileConnections = useCallback(() => {
    if (
      activeTab !== "posts"
      && profileConnectionsHasMore
      && profileConnectionsCursor
      && !profileConnectionsLoadingMore
    ) {
      void loadProfileConnections(activeTab, profileConnectionsCursor);
    }
  }, [
    activeTab,
    loadProfileConnections,
    profileConnectionsCursor,
    profileConnectionsHasMore,
    profileConnectionsLoadingMore,
  ]);

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

  const patchPost = useCallback((postId: number, patch: Partial<SocialPost>) => {
    setPosts((current) => current.map((post) => post.id === postId ? { ...post, ...patch } : post));
    publishSocialPostPatch(postId, patch);
  }, []);

  const handleLike = useCallback(async (post: SocialPost) => {
    if (likingPostIds.has(post.id)) return;
    setLikingPostIds((current) => new Set(current).add(post.id));
    const optimisticLike = {
      liked_by_me: !post.liked_by_me,
      like_count: Math.max(0, post.like_count + (post.liked_by_me ? -1 : 1)),
    };
    patchPost(post.id, optimisticLike);
    try {
      const response = post.liked_by_me
        ? await socialAPI.unlikePost(post.id)
        : await socialAPI.likePost(post.id);
      patchPost(post.id, {
        liked_by_me: response.data.data.liked,
        like_count: response.data.data.like_count,
      });
    } catch (likeError) {
      patchPost(post.id, { liked_by_me: post.liked_by_me, like_count: post.like_count });
      Alert.alert("Unable to update like", getBackendErrorMessage(likeError));
    } finally {
      setLikingPostIds((current) => {
        const next = new Set(current);
        next.delete(post.id);
        return next;
      });
    }
  }, [likingPostIds, patchPost]);

  const openComments = useCallback(async (post: SocialPost) => {
    setCommentPost(post);
    setComments([]);
    setCommentText("");
    setCommentsLoading(true);
    try {
      const response = await socialAPI.getComments(post.id);
      setComments(extractApiResults<SocialComment>(response.data));
    } catch (commentsError) {
      Alert.alert("Unable to load comments", getBackendErrorMessage(commentsError));
    } finally {
      setCommentsLoading(false);
    }
  }, []);

  const sendComment = useCallback(async () => {
    if (!commentPost || !commentText.trim() || sendingComment) return;
    setSendingComment(true);
    try {
      const response = await socialAPI.addComment(commentPost.id, commentText.trim());
      const createdComment = response.data.data;
      setComments((current) => [createdComment, ...current]);
      patchPost(commentPost.id, {
        comment_count: createdComment.comment_count ?? commentPost.comment_count + 1,
      });
      setCommentText("");
    } catch (commentError) {
      Alert.alert("Unable to add comment", getBackendErrorMessage(commentError));
    } finally {
      setSendingComment(false);
    }
  }, [commentPost, commentText, patchPost, sendingComment]);

  const deleteComment = useCallback((comment: SocialComment) => {
    if (!comment.can_delete || !commentPost) return;
    Alert.alert("Delete comment?", "This comment will be removed.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          void (async () => {
            const previousCount = commentPost.comment_count;
            setComments((current) => current.filter((item) => item.id !== comment.id));
            patchPost(commentPost.id, { comment_count: Math.max(0, previousCount - 1) });
            try {
              const response = await socialAPI.deleteComment(commentPost.id, comment.id);
              const authoritativeCount = response.data?.data?.comment_count;
              if (Number.isFinite(authoritativeCount)) {
                patchPost(commentPost.id, { comment_count: authoritativeCount });
              }
            } catch (deleteError) {
              setComments((current) => current.some((item) => item.id === comment.id) ? current : [comment, ...current]);
              patchPost(commentPost.id, { comment_count: previousCount });
              Alert.alert("Unable to delete comment", getBackendErrorMessage(deleteError));
            }
          })();
        },
      },
    ]);
  }, [commentPost, patchPost]);

  const sharePost = useCallback(async (post: SocialPost) => {
    if (post.visibility !== "PUBLIC" && post.visibility !== "ALL") {
      Alert.alert("Sharing unavailable", "Only workouts shared with Everyone can be shared externally.");
      return;
    }

    let shareUrl = post.share_url;
    let shareCountRecorded = false;
    if (!shareUrl) {
      try {
        const response = await socialAPI.sharePost(post.id, "EXTERNAL");
        shareUrl = response.data.data.url || response.data.data.deep_link || null;
        patchPost(post.id, { share_count: response.data.data.share_count });
        shareCountRecorded = true;
      } catch (shareError) {
        Alert.alert("Unable to share post", getBackendErrorMessage(shareError));
        return;
      }
      if (!shareUrl) {
        Alert.alert("Sharing unavailable", "This workout does not have an external share link.");
        return;
      }
    }
    const description = `${post.author.full_name || post.author.username}'s ${formatDistance(post.activity.distance_km)} workout`;
    try {
      const result = await Share.share({ message: `${description}\n${shareUrl}` });
      if (result.action !== Share.sharedAction) return;
      if (!shareCountRecorded) {
        const response = await socialAPI.sharePost(post.id, "EXTERNAL");
        patchPost(post.id, { share_count: response.data.data.share_count });
      }
    } catch (shareError) {
      Alert.alert("Unable to share post", getBackendErrorMessage(shareError));
    }
  }, [patchPost]);

  const openPostOptions = useCallback((
    post: SocialPost,
    anchor: { x: number; y: number; width: number; height: number },
  ) => setPostActionMenu({ post, anchor }), []);

  const openEditPost = useCallback((post: SocialPost) => {
    setPostActionMenu(null);
    setEditCaption(post.caption || "");
    setEditVisibility(post.visibility === "FOLLOWERS" ? "FOLLOWERS"
      : post.visibility === "ONLY_ME" || post.visibility === "NONE" ? "ONLY_ME" : "PUBLIC");
    setEditCommentsEnabled(post.comments_enabled !== false);
    setEditHideMap(post.hide_map === true);
    setEditPostError(null);
    setEditingPost(post);
  }, []);

  const savePostEdits = useCallback(async () => {
    if (!editingPost || editPostBusy) return;
    setEditPostBusy(true);
    setEditPostError(null);
    try {
      const response = await socialAPI.updateWorkoutPost(editingPost.id, {
        caption: editCaption,
        visibility: editVisibility,
        comments_enabled: editCommentsEnabled,
        hide_map: editHideMap,
      });
      const updatedPost = { ...response.data.data, is_mine: true };
      patchPost(updatedPost.id, updatedPost);
      setEditingPost(null);
    } catch (editError) {
      setEditPostError(getBackendErrorMessage(editError, "Could not update this post."));
    } finally {
      setEditPostBusy(false);
    }
  }, [editCaption, editCommentsEnabled, editHideMap, editPostBusy, editVisibility, editingPost, patchPost]);

  const updatePostAudience = useCallback(async (post: SocialPost) => {
    setPostActionMenu(null);
    setPostActionBusy(true);
    try {
      const settings = await socialAPI.getSharingSettings();
      const defaultAudience = settings.data.data.default_audience;
      const onlyMeSelected = defaultAudience === "ONLY_ME"
        || (defaultAudience === "NONE" && await getOnlyMeDefaultAudience());
      const visibility: SocialPostVisibility | null = onlyMeSelected
        ? "ONLY_ME"
        : defaultAudience === "ALL"
          ? "PUBLIC"
          : defaultAudience === "FOLLOWERS"
            ? "FOLLOWERS"
            : null;
      if (!visibility) {
        Alert.alert(
          "Sharing is turned off",
          "Your Settings are set to Don't share. Choose Followers, Everyone, or Only me in Settings to share this workout.",
        );
        return;
      }
      const response = await socialAPI.updateWorkoutPost(post.id, { visibility });
      patchPost(post.id, response.data.data);
    } catch (audienceError) {
      Alert.alert("Unable to share workout", getBackendErrorMessage(audienceError, "Could not update this workout's audience."));
    } finally {
      setPostActionBusy(false);
    }
  }, [patchPost]);

  const deletePost = useCallback((post: SocialPost) => {
    setPostActionMenu(null);
    Alert.alert("Delete post?", "This removes the post from Connections and your profile. The workout will remain in your history.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          void (async () => {
            try {
              await socialAPI.deletePost(post.id);
              publishSocialPostDeleted(post.id);
            } catch (deleteError) {
              Alert.alert("Unable to delete post", getBackendErrorMessage(deleteError));
            }
          })();
        },
      },
    ]);
  }, []);

  const beginReport = useCallback((type: ContentReportTargetType, id: number) => {
    setPostActionMenu(null);
    setReportTarget({ type, id, label: type === "COMMENT" ? "comment" : "workout" });
    setReportReason(null);
    setReportDetails("");
    setReportError(null);
    setReportSuccessMessage(null);
  }, []);

  const submitReport = useCallback(async () => {
    if (!reportTarget || !reportReason || reportBusy) return;
    setReportBusy(true);
    setReportError(null);
    try {
      const response = await socialAPI.reportContent({
        target_type: reportTarget.type,
        target_id: reportTarget.id,
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

  const openReport = useCallback((type: "USER" | "POST", id: number, label: "runner" | "workout") => {
    setReportTarget({ type, id, label });
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
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={() => {
            if (isSelfProfileTabView || !router.canGoBack()) router.replace('/(app)/dashboard');
            else router.back();
          }}
          style={styles.iconButton}
        >
          <Feather name="arrow-left" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.pageTitle, { color: colors.text }]}>{isSelfProfileTabView ? "Profile" : "Runner"}</Text>
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
              <View style={styles.countButton}>
                <Text style={[styles.countValue, { color: colors.text }]}>{profile.followers_count}</Text>
                <Text style={[styles.countLabel, { color: colors.textSecondary }]}>Followers</Text>
              </View>
              <View style={styles.countButton}>
                <Text style={[styles.countValue, { color: colors.text }]}>{profile.following_count}</Text>
                <Text style={[styles.countLabel, { color: colors.textSecondary }]}>Following</Text>
              </View>
            </View>
          </View>
        </View>
      ) : null}
      {profile && canViewProfilePosts ? (
        <View style={[styles.profileTabs, { borderBottomColor: colors.border }]}>
          {([
            { key: "posts", label: "Posts" },
            { key: "followers", label: "Followers" },
            { key: "following", label: "Following" },
          ] as const).map((tab) => {
            const selected = activeTab === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => selectProfileTab(tab.key)}
                style={styles.profileTab}
              >
                <Text style={[styles.profileTabText, { color: selected ? colors.primary : colors.textSecondary }]}>
                  {tab.label}
                </Text>
                {selected ? <View style={[styles.profileTabIndicator, { backgroundColor: colors.primary }]} /> : null}
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}
      {isSelfProfileTabView ? (
        <TouchableOpacity
          accessibilityRole="button"
          onPress={() => router.push("/(app)/profile/info")}
          style={[styles.viewProfileButton, { backgroundColor: colors.primary }]}
        >
          <Text style={[styles.viewProfileButtonText, { color: colors.primaryText }]}>View Profile</Text>
          <Feather name="arrow-up-right" size={16} color={colors.primaryText} />
        </TouchableOpacity>
      ) : null}
      {error ? <Text style={[styles.errorText, { color: "#E5484D" }]}>{error}</Text> : null}
      {profile && canViewProfilePosts === false ? (
        <View style={styles.lockedBox}>
          <Feather name="lock" size={25} color={colors.textSecondary} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>This account is private</Text>
          <Text style={[styles.emptyCopy, { color: colors.textSecondary }]}>Posts are available only to approved followers.</Text>
        </View>
      ) : null}
    </View>
  );

  const renderPost = useCallback(({ item }: { item: SocialPost }) => (
    <FeedPostCard
      post={item}
      colors={colors}
      isLiking={likingPostIds.has(item.id)}
      onLike={() => void handleLike(item)}
      onComments={() => void openComments(item)}
      onDetails={() => void openPostDetails(item)}
      onShare={() => void sharePost(item)}
      onMore={(anchor) => openPostOptions(item, anchor)}
      onAuthorPress={() => router.push({
        pathname: "/(app)/runner/[id]",
        params: {
          id: String(item.author.id),
          ...(isSelfProfileTabView ? { selfProfile: "1" } : {}),
        },
      })}
    />
  ), [colors, handleLike, isSelfProfileTabView, likingPostIds, openComments, openPostDetails, openPostOptions, sharePost]);

  const renderProfileConnection = useCallback(({ item }: { item: ConnectionUser }) => (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={`Open ${item.full_name || item.username}'s profile`}
      onPress={() => router.push({
        pathname: "/(app)/runner/[id]",
        params: {
          id: String(item.id),
          ...(isSelfProfileTabView ? { selfProfile: "1" } : {}),
        },
      })}
      style={[styles.connectionRow, { borderBottomColor: colors.border }]}
    >
      <Avatar name={item.full_name || item.username} imageUrl={item.avatar_url || undefined} size={42} />
      <View style={styles.connectionCopy}>
        <Text numberOfLines={1} style={[styles.connectionName, { color: colors.text }]}>
          {item.full_name || item.username}
        </Text>
        <Text numberOfLines={1} style={[styles.connectionUsername, { color: colors.textSecondary }]}>
          @{item.username}
        </Text>
      </View>
      <Feather name="chevron-right" size={18} color={colors.textTertiary} />
    </TouchableOpacity>
  ), [colors, isSelfProfileTabView]);

  const canShowContent = !profile || canViewProfilePosts !== false;
  return (
    <SafeAreaView edges={["top", "left", "right"]} style={[styles.screen, { backgroundColor: colors.background }]}>
      {loading ? <View style={styles.center}><RunningLoader size={64} label="Loading profile..." /></View> : (
        activeTab === "posts" ? (
          <FlatList
            data={canShowContent ? posts : []}
            keyExtractor={(item) => String(item.id)}
            renderItem={renderPost}
            contentContainerStyle={styles.pageContent}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void loadProfile(true)} tintColor={colors.primary} />}
            ListHeaderComponent={header}
            ListEmptyComponent={canShowContent && !loadingMore ? (
              <View style={styles.emptyBox}>
                <Text style={[styles.emptyTitle, { color: colors.text }]}>No posts yet</Text>
              </View>
            ) : null}
            ListFooterComponent={canShowContent && postsHasMore ? (
              <TouchableOpacity disabled={loadingMore} onPress={() => void loadMore()} style={[styles.loadMore, { borderColor: colors.border }]}>
                {loadingMore ? <ActivityIndicator size="small" color={colors.primary} /> : <Text style={[styles.loadMoreText, { color: colors.primary }]}>Load more</Text>}
              </TouchableOpacity>
            ) : loadingMore ? <ActivityIndicator style={styles.moreSpinner} size="small" color={colors.primary} /> : null}
          />
        ) : (
          <FlatList<ConnectionUser>
            data={profileConnections}
            keyExtractor={(item) => String(item.id)}
            renderItem={renderProfileConnection}
            contentContainerStyle={styles.pageContent}
            ListHeaderComponent={header}
            ListEmptyComponent={profileConnectionsLoading ? (
              <ActivityIndicator style={styles.moreSpinner} size="small" color={colors.primary} />
            ) : (
              <View style={styles.emptyBox}>
                <Text style={[styles.emptyTitle, { color: profileConnectionsError ? "#E5484D" : colors.text }]}>
                  {profileConnectionsError || (activeTab === "followers" ? "No followers yet" : "Not following anyone yet")}
                </Text>
              </View>
            )}
            ListFooterComponent={profileConnectionsHasMore ? (
              <TouchableOpacity
                disabled={profileConnectionsLoadingMore}
                onPress={loadMoreProfileConnections}
                style={[styles.loadMore, { borderColor: colors.border }]}
              >
                {profileConnectionsLoadingMore
                  ? <ActivityIndicator size="small" color={colors.primary} />
                  : <Text style={[styles.loadMoreText, { color: colors.primary }]}>Load more</Text>}
              </TouchableOpacity>
            ) : null}
          />
        )
      )}
      <PostCommentsModal
        post={commentPost}
        comments={comments}
        loading={commentsLoading}
        sending={sendingComment}
        text={commentText}
        colors={colors}
        onTextChange={setCommentText}
        onSend={() => void sendComment()}
        onClose={() => setCommentPost(null)}
        onCommentOptions={(comment) => {
          const buttons: AlertButton[] = [
            { text: "Cancel", style: "cancel" },
            { text: "Report comment", onPress: () => beginReport("COMMENT", comment.id) },
          ];
          if (comment.can_delete) {
            buttons.push({ text: "Delete comment", style: "destructive", onPress: () => deleteComment(comment) });
          }
          Alert.alert("Comment options", "Choose an action for this comment.", buttons);
        }}
      />
      <Modal visible={editingPost !== null} animationType="slide" onRequestClose={() => setEditingPost(null)}>
        <SafeAreaView edges={["top", "left", "right", "bottom"]} style={[styles.modalScreen, { backgroundColor: colors.background }]}>
          <KeyboardAvoidingView style={styles.keyboardAvoiding} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={0}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Cancel editing" onPress={() => setEditingPost(null)} style={styles.modalBack}>
                <Feather name="x" size={22} color={colors.text} />
              </TouchableOpacity>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Edit post</Text>
              <View style={styles.modalBack} />
            </View>
            <ScrollView style={styles.editPostScroll} contentContainerStyle={styles.editPostContent} keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"} automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}>
              <Text style={[styles.editPostLabel, { color: colors.text }]}>Caption</Text>
              <TextInput
                value={editCaption}
                onChangeText={setEditCaption}
                placeholder="Add a caption..."
                placeholderTextColor={colors.textTertiary}
                maxLength={2200}
                multiline
                style={[styles.editPostCaptionInput, { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border }]}
              />
              <Text style={[styles.editPostLabel, { color: colors.text, marginTop: 20 }]}>Who can see this workout?</Text>
              {([
                ["PUBLIC", "Everyone"],
                ["FOLLOWERS", "Followers"],
                ["ONLY_ME", "Only me"],
              ] as const).map(([visibility, label]) => {
                const selected = editVisibility === visibility;
                return (
                  <TouchableOpacity key={visibility} accessibilityRole="radio" accessibilityState={{ selected }} onPress={() => setEditVisibility(visibility)} style={[styles.editPostOption, { borderColor: selected ? colors.primary : colors.border, backgroundColor: colors.surface }]}>
                    <Text style={[styles.editPostOptionText, { color: colors.text }]}>{label}</Text>
                    <Feather name={selected ? "check-circle" : "circle"} size={19} color={selected ? colors.primary : colors.textTertiary} />
                  </TouchableOpacity>
                );
              })}
              <Text style={[styles.editPostLabel, { color: colors.text, marginTop: 20 }]}>Post options</Text>
              <TouchableOpacity onPress={() => setEditCommentsEnabled((value) => !value)} style={[styles.editPostToggle, { borderColor: colors.border }]}>
                <View style={styles.editPostToggleCopy}>
                  <Text style={[styles.editPostOptionText, { color: colors.text }]}>Allow comments</Text>
                  <Text style={[styles.editPostHint, { color: colors.textSecondary }]}>Let people comment on this workout.</Text>
                </View>
                <Feather name={editCommentsEnabled ? "toggle-right" : "toggle-left"} size={25} color={editCommentsEnabled ? colors.primary : colors.textTertiary} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setEditHideMap((value) => !value)} style={[styles.editPostToggle, { borderColor: colors.border }]}>
                <View style={styles.editPostToggleCopy}>
                  <Text style={[styles.editPostOptionText, { color: colors.text }]}>Hide route map</Text>
                  <Text style={[styles.editPostHint, { color: colors.textSecondary }]}>Hide the map on this post.</Text>
                </View>
                <Feather name={editHideMap ? "toggle-right" : "toggle-left"} size={25} color={editHideMap ? colors.primary : colors.textTertiary} />
              </TouchableOpacity>
              {editPostError ? <Text style={[styles.editPostError, { color: "#E5484D" }]}>{editPostError}</Text> : null}
              <TouchableOpacity accessibilityRole="button" disabled={editPostBusy} onPress={() => void savePostEdits()} style={[styles.editPostSave, { backgroundColor: colors.primary, opacity: editPostBusy ? 0.6 : 1 }]}>
                {editPostBusy ? <ActivityIndicator size="small" color={colors.primaryText} /> : <Text style={[styles.editPostSaveText, { color: colors.primaryText }]}>Save changes</Text>}
              </TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
      <Modal visible={postActionMenu !== null} transparent animationType="fade" onRequestClose={() => setPostActionMenu(null)}>
        <View style={styles.postMenuOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setPostActionMenu(null)} accessibilityLabel="Close post options" />
          {postActionMenu ? (
            <View style={[
              styles.postMenu,
              {
                width: Math.min(windowWidth - 24, 276),
                top: Math.max(8, Math.min(postActionMenu.anchor.y + postActionMenu.anchor.height + 6, windowHeight - (postActionMenu.post.is_mine ? 236 : 170))),
                right: Math.max(12, windowWidth - postActionMenu.anchor.x - postActionMenu.anchor.width),
                backgroundColor: colors.surface,
                borderColor: colors.border,
              },
            ]}>
              <View style={styles.postMenuHeading}>
                <Text style={[styles.postMenuName, { color: colors.text }]} numberOfLines={1}>{postActionMenu.post.author.full_name || postActionMenu.post.author.username}</Text>
                <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close" onPress={() => setPostActionMenu(null)} style={styles.postMenuClose}>
                  <Feather name="x" size={18} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
              {postActionMenu.post.is_mine ? (
                <>
                  <TouchableOpacity style={[styles.postMenuAction, { borderColor: colors.border }]} onPress={() => openEditPost(postActionMenu.post)}>
                    <Feather name="edit-2" size={16} color={colors.primary} />
                    <Text style={[styles.postMenuActionText, { color: colors.text }]}>Edit post</Text>
                    <Feather name="chevron-right" size={16} color={colors.textTertiary} />
                  </TouchableOpacity>
                  <TouchableOpacity disabled={postActionBusy} style={[styles.postMenuAction, { borderColor: colors.border }]} onPress={() => void updatePostAudience(postActionMenu.post)}>
                    {postActionBusy ? <ActivityIndicator size="small" color={colors.primary} /> : <Feather name="share" size={16} color={colors.primary} />}
                    <Text style={[styles.postMenuActionText, { color: colors.text }]}>Share the workout</Text>
                    <Feather name="chevron-right" size={16} color={colors.textTertiary} />
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.postMenuAction, { borderColor: colors.border }]} onPress={() => deletePost(postActionMenu.post)}>
                    <Feather name="trash-2" size={16} color="#E5484D" />
                    <Text style={[styles.postMenuActionText, { color: "#E5484D" }]}>Delete post</Text>
                    <Feather name="chevron-right" size={16} color={colors.textTertiary} />
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <TouchableOpacity style={[styles.postMenuAction, { borderColor: colors.border }]} onPress={() => { const { post } = postActionMenu; setPostActionMenu(null); void sharePost(post); }}>
                    <Feather name="share" size={16} color={colors.primary} />
                    <Text style={[styles.postMenuActionText, { color: colors.text }]}>Share the workout</Text>
                    <Feather name="chevron-right" size={16} color={colors.textTertiary} />
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.postMenuAction, { borderColor: colors.border }]} onPress={() => beginReport("POST", postActionMenu.post.id)}>
                    <Feather name="flag" size={16} color={colors.textSecondary} />
                    <Text style={[styles.postMenuActionText, { color: colors.text }]}>Report workout</Text>
                    <Feather name="chevron-right" size={16} color={colors.textTertiary} />
                  </TouchableOpacity>
                </>
              )}
            </View>
          ) : null}
        </View>
      </Modal>
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
                  runnerOptionsExitActionRef.current = () => openReport("USER", profile.id, "runner");
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
  pageContent: { paddingBottom: 36 },
  topBar: { minHeight: 52, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  pageTitle: { flex: 1, fontSize: 18, fontWeight: "800", textAlign: "center" },
  iconButton: { width: 38, height: 38, alignItems: "center", justifyContent: "center" },
  profileCard: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 15, padding: 12, marginHorizontal: 8, marginTop: 6 },
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
  profileTabs: { minHeight: 50, flexDirection: "row", borderBottomWidth: StyleSheet.hairlineWidth, marginTop: 12 },
  profileTab: { flex: 1, minHeight: 50, alignItems: "center", justifyContent: "center" },
  profileTabText: { fontSize: 14, fontWeight: "700" },
  profileTabIndicator: { position: "absolute", bottom: 0, left: 0, right: 0, height: 2 },
  connectionRow: { minHeight: 66, flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14 },
  connectionCopy: { flex: 1, minWidth: 0, gap: 3 },
  connectionName: { fontSize: 14, fontWeight: "700" },
  connectionUsername: { fontSize: 12 },
  viewProfileButton: { width: "100%", minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 22, marginTop: 16 },
  viewProfileButtonText: { fontSize: 14, fontWeight: "700" },
  errorText: { fontSize: 12, lineHeight: 17, marginVertical: 10 },
  lockedBox: { alignItems: "center", paddingHorizontal: 28, paddingVertical: 42 },
  emptyBox: { alignItems: "center", paddingVertical: 28 },
  emptyTitle: { fontSize: 15, fontWeight: "700", marginTop: 8 },
  emptyCopy: { fontSize: 12, lineHeight: 18, textAlign: "center", marginTop: 6 },
  personInfo: { flex: 1, fontSize: 13, fontWeight: "600" },
  loadMore: { minHeight: 42, alignItems: "center", justifyContent: "center", borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, marginTop: 14 },
  loadMoreText: { fontSize: 13, fontWeight: "700" },
  moreSpinner: { margin: 12 },
  modalScreen: { flex: 1 },
  keyboardAvoiding: { flex: 1 },
  modalHeader: { height: 54, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12 },
  modalBack: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  modalTitle: { fontSize: 17, fontWeight: "700" },
  editPostScroll: { flex: 1 },
  editPostContent: { padding: 16, paddingBottom: 30 },
  editPostLabel: { fontSize: 14, fontWeight: "700", marginBottom: 9 },
  editPostCaptionInput: { minHeight: 104, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 12, fontSize: 14, textAlignVertical: "top" },
  editPostOption: { minHeight: 48, borderWidth: StyleSheet.hairlineWidth, borderRadius: 11, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 7 },
  editPostOptionText: { fontSize: 13, fontWeight: "600" },
  editPostToggle: { minHeight: 58, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  editPostToggleCopy: { flex: 1 },
  editPostHint: { fontSize: 11, marginTop: 3 },
  editPostError: { fontSize: 12, lineHeight: 17, marginTop: 12 },
  editPostSave: { minHeight: 46, borderRadius: 12, alignItems: "center", justifyContent: "center", marginTop: 22 },
  editPostSaveText: { fontSize: 14, fontWeight: "700" },
  postMenuOverlay: { flex: 1, backgroundColor: "transparent" },
  postMenu: { position: "absolute", borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, padding: 12, shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 18 },
  postMenuHeading: { flexDirection: "row", alignItems: "center", marginBottom: 10, gap: 9 },
  postMenuName: { flex: 1, fontSize: 14, fontWeight: "800" },
  postMenuClose: { width: 28, height: 28, alignItems: "center", justifyContent: "center" },
  postMenuAction: { minHeight: 42, borderWidth: StyleSheet.hairlineWidth, borderRadius: 11, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", gap: 9, marginTop: 7 },
  postMenuActionText: { flex: 1, fontSize: 12, fontWeight: "600" },
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
