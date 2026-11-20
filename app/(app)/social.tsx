import { Feather } from "@expo/vector-icons";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
  type StyleProp,
  type ViewStyle,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../../contexts/ThemeContext";
import { getBackendErrorMessage } from "../../service/api";
import { Avatar } from "../../components/Avatar";
import ActivityRouteMap from "../../components/ActivityRouteMap";
import {
  connectionsAPI,
  extractApiResults,
  socialAPI,
  type ConnectionUser,
  type ContentReportReason,
  type ContentReportTargetType,
  type SocialComment,
  type SocialPost,
} from "../../src/services/socialApi";

const formatDistance = (distanceKm: number) => `${Number(distanceKm || 0).toFixed(2)} km`;
const REPORT_REASONS: { value: ContentReportReason; label: string }[] = [
  { value: "SPAM", label: "Spam or scam" },
  { value: "HARASSMENT", label: "Harassment or bullying" },
  { value: "HATE", label: "Hateful content" },
  { value: "INAPPROPRIATE", label: "Inappropriate content" },
  { value: "DANGEROUS", label: "Dangerous activity" },
  { value: "IMPERSONATION", label: "Impersonation" },
  { value: "OTHER", label: "Other" },
];

const formatDuration = (seconds: number) => {
  const total = Math.max(0, Math.floor(seconds || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remainder = total % 60;
  return hours > 0
    ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
};

const formatPace = (pace: number) => {
  if (!Number.isFinite(pace) || pace <= 0) return "--";
  const seconds = Math.round(pace);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}/km`;
};

const formatRelativeTime = (value: string) => {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "";
  const elapsedHours = Math.max(0, Math.floor((Date.now() - timestamp) / 3_600_000));
  if (elapsedHours < 1) return "just now";
  if (elapsedHours < 24) return `${elapsedHours} ${elapsedHours === 1 ? "hour" : "hours"} ago`;
  const elapsedDays = Math.floor(elapsedHours / 24);
  if (elapsedDays === 1) return "yesterday";
  if (elapsedDays < 7) return `${elapsedDays} days ago`;
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(timestamp);
};

function AnchoredMoreButton({
  label,
  color,
  size = 18,
  style,
  onPress,
}: {
  label: string;
  color: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
  onPress: (anchor: { x: number; y: number; width: number; height: number }) => void;
}) {
  const buttonRef = useRef<View>(null);
  return (
    <View ref={buttonRef} collapsable={false}>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={() => buttonRef.current?.measureInWindow((x, y, width, height) => onPress({ x, y, width, height }))}
        style={style}
      >
        <Feather name="more-horizontal" size={size} color={color} />
      </TouchableOpacity>
    </View>
  );
}

function ConnectionCard({
  post,
  colors,
  isLiking,
  onLike,
  onComments,
  onDetails,
  onShare,
  onMore,
}: {
  post: SocialPost;
  colors: ReturnType<typeof useTheme>["colors"];
  isLiking: boolean;
  onLike: () => void;
  onComments: () => void;
  onDetails: () => void;
  onShare: () => void;
  onMore: (anchor: { x: number; y: number; width: number; height: number }) => void;
}) {
  const name = post.author.full_name || post.author.username;
  const distance = Number(post.activity?.distance_km);
  return (
    <View style={[styles.postCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.postHeader}>
        <Avatar name={name} imageUrl={post.author.avatar_url || undefined} size={34} />
        <View style={styles.authorInfo}>
          <Text style={[styles.authorName, { color: colors.text }]} numberOfLines={1}>{name}</Text>
          <Text style={[styles.username, { color: colors.textSecondary }]} numberOfLines={1}>@{post.author.username}</Text>
        </View>
        <Text style={[styles.postTime, { color: colors.textTertiary }]}>{formatRelativeTime(post.created_at)}</Text>
        {!post.is_mine ? (
          <AnchoredMoreButton label="Workout options" color={colors.textSecondary} style={styles.moreButton} onPress={onMore} />
        ) : null}
      </View>

      <View style={[styles.workoutCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
        <View style={styles.workoutHeading}>
          <Feather name="activity" size={16} color={colors.text} />
          <Text style={[styles.workoutType, { color: colors.text }]}>
            {post.activity?.activity_type
              ? `${post.activity.activity_type.charAt(0).toUpperCase()}${post.activity.activity_type.slice(1).toLowerCase()}`
              : "Run"}
          </Text>
          <Text style={[styles.distance, { color: colors.text }]}>{formatDistance(distance)}</Text>
        </View>
        <View style={styles.metrics}>
          <View style={styles.metric}>
            <Feather name="clock" size={12} color={colors.textTertiary} />
            <Text style={[styles.metricText, { color: colors.textSecondary }]}>{formatDuration(post.activity?.moving_time)}</Text>
          </View>
          <View style={styles.metric}>
            <Feather name="navigation" size={12} color={colors.textTertiary} />
            <Text style={[styles.metricText, { color: colors.textSecondary }]}>{formatPace(post.activity?.avg_pace)}</Text>
          </View>
        </View>
      </View>

      {!post.hide_map && post.activity?.encoded_polyline ? (
        <View style={styles.workoutMap}>
          <ActivityRouteMap
            encodedPolyline={post.activity.encoded_polyline}
            variant="preview"
            compactPreview
            googleMapPreview
          />
        </View>
      ) : null}

      {post.caption ? <Text style={[styles.caption, { color: colors.text }]}>{post.caption}</Text> : null}

      <View style={[styles.postActions, { borderTopColor: colors.border }]}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={post.liked_by_me ? "Unlike workout" : "Like workout"}
          accessibilityState={{ disabled: isLiking }}
          disabled={isLiking}
          onPress={onLike}
          style={styles.actionButton}
        >
          <Feather name="heart" size={15} color={post.liked_by_me ? "#E5484D" : colors.text} />
          <Text style={[styles.actionCount, { color: colors.text }]}>{post.like_count}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="View comments"
          onPress={onComments}
          style={styles.actionButton}
        >
          <Feather name="message-square" size={15} color={colors.primary} />
          <Text style={[styles.actionCount, { color: colors.primary }]}>{post.comment_count}</Text>
        </TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" onPress={onComments} style={styles.actionLink}>
          <Text style={[styles.actionLinkText, { color: colors.primary }]}>Comments</Text>
        </TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" onPress={onDetails} style={styles.actionLink}>
          <Text style={[styles.actionLinkText, { color: colors.primary }]}>Details</Text>
        </TouchableOpacity>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Share workout"
          onPress={onShare}
          style={styles.shareButton}
        >
          <Feather name="share" size={15} color={colors.text} />
          <Text style={[styles.actionCount, { color: colors.text }]}>{post.share_count}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function SocialScreen() {
  const { colors } = useTheme();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const { findRunners, returnToPrivacy } = useLocalSearchParams<{ findRunners?: string; returnToPrivacy?: string }>();
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [myPosts, setMyPosts] = useState<SocialPost[]>([]);
  const [myPostsVisible, setMyPostsVisible] = useState(false);
  const [myPostsLoading, setMyPostsLoading] = useState(false);
  const [myPostsError, setMyPostsError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [likingPostIds, setLikingPostIds] = useState<Set<number>>(() => new Set());
  const [findRunnersVisible, setFindRunnersVisible] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [suggestions, setSuggestions] = useState<ConnectionUser[]>([]);
  const [searchResults, setSearchResults] = useState<ConnectionUser[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [followingIds, setFollowingIds] = useState<Set<number>>(() => new Set());
  const [blockedIds, setBlockedIds] = useState<Set<number>>(() => new Set());
  const [commentPost, setCommentPost] = useState<SocialPost | null>(null);
  const [detailsPost, setDetailsPost] = useState<SocialPost | null>(null);
  const [comments, setComments] = useState<SocialComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [sendingComment, setSendingComment] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [moderationTarget, setModerationTarget] = useState<{
    user: ConnectionUser;
    kind: "runner" | "workout" | "comment";
    targetType: ContentReportTargetType;
    targetId: number;
    anchor: { x: number; y: number; width: number; height: number };
    step: "actions" | "block" | "report" | "reported";
  } | null>(null);
  const [moderationBusy, setModerationBusy] = useState(false);
  const [moderationError, setModerationError] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState<ContentReportReason | null>(null);
  const [reportDetails, setReportDetails] = useState("");

  const hideBlockedUserLocally = useCallback((userId: number) => {
    setBlockedIds((current) => new Set(current).add(userId));
    setPosts((current) => current.filter((post) => post.author.id !== userId));
    setComments((current) => current.filter((comment) => comment.author.id !== userId));
    setSuggestions((current) => current.filter((user) => user.id !== userId));
    setSearchResults((current) => current.filter((user) => user.id !== userId));
    setCommentPost((current) => current?.author.id === userId ? null : current);
  }, []);

  const openModeration = useCallback((
    user: ConnectionUser,
    kind: "runner" | "workout" | "comment",
    targetType: ContentReportTargetType,
    targetId: number,
    anchor: { x: number; y: number; width: number; height: number },
  ) => {
    setModerationError(null);
    setReportReason(null);
    setReportDetails("");
    setModerationTarget({ user, kind, targetType, targetId, anchor, step: "actions" });
  }, []);

  const submitContentReport = useCallback(async () => {
    if (!moderationTarget || !reportReason) return;
    setModerationBusy(true);
    setModerationError(null);
    try {
      await socialAPI.reportContent({
        target_type: moderationTarget.targetType,
        target_id: moderationTarget.targetId,
        reason: reportReason,
        ...(reportDetails.trim() ? { details: reportDetails.trim() } : {}),
      });
      setModerationTarget((current) => current ? { ...current, step: "reported" } : null);
    } catch (error) {
      setModerationError(getBackendErrorMessage(error));
    } finally {
      setModerationBusy(false);
    }
  }, [moderationTarget, reportDetails, reportReason]);

  const confirmBlock = useCallback(async () => {
    if (!moderationTarget) return;
    setModerationBusy(true);
    setModerationError(null);
    try {
      await connectionsAPI.blockAccount(moderationTarget.user.id);
      hideBlockedUserLocally(moderationTarget.user.id);
      setModerationTarget(null);
    } catch (error) {
      setModerationError(getBackendErrorMessage(error));
    } finally {
      setModerationBusy(false);
    }
  }, [hideBlockedUserLocally, moderationTarget]);

  const openRunnerActions = useCallback((runner: ConnectionUser, anchor: { x: number; y: number; width: number; height: number }) => openModeration(runner, "runner", "USER", runner.id, anchor), [openModeration]);
  const openPostActions = useCallback((post: SocialPost, anchor: { x: number; y: number; width: number; height: number }) => openModeration(post.author, "workout", "POST", post.id, anchor), [openModeration]);

  const closeRunnerSearch = useCallback(() => {
    if (returnToPrivacy === "1") {
      router.back();
      return;
    }
    setFindRunnersVisible(false);
    setSearchText("");
    setSearchResults([]);
  }, [returnToPrivacy]);

  useEffect(() => {
    if (findRunners !== "1") return;
    setSearchLoading(true);
    setFindRunnersVisible(true);
    router.setParams({ findRunners: undefined });
  }, [findRunners]);

  const loadFeed = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setLoadError(null);
    try {
      const response = await socialAPI.getFeed();
      setPosts(extractApiResults<SocialPost>(response.data).filter((post) => !blockedIds.has(post.author.id)));
    } catch (error) {
      const message = getBackendErrorMessage(error, "Unable to load the Connections feed.");
      setLoadError(message);
      if (isRefresh) Alert.alert("Feed unavailable", message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [blockedIds]);

  const loadMyPosts = useCallback(async () => {
    setMyPostsLoading(true);
    setMyPostsError(null);
    try {
      const response = await socialAPI.getMyPosts();
      const ownPosts = extractApiResults<SocialPost>(response.data)
        .filter((post) => !blockedIds.has(post.author.id))
        .map((post) => ({ ...post, is_mine: true }));
      setMyPosts(ownPosts);
    } catch (error) {
      setMyPostsError(getBackendErrorMessage(error, "Unable to load your posts."));
    } finally {
      setMyPostsLoading(false);
    }
  }, [blockedIds]);

  useEffect(() => {
    if (myPostsVisible) void loadMyPosts();
  }, [loadMyPosts, myPostsVisible]);

  useFocusEffect(
    useCallback(() => {
      void loadFeed();
    }, [loadFeed]),
  );

  useEffect(() => {
    if (!findRunnersVisible) return;
    let active = true;
    const query = searchText.trim();
    const request = query.length >= 2
      ? connectionsAPI.search(query)
      : suggestions.length > 0
        ? Promise.resolve(null)
        : connectionsAPI.getSuggestions();

    request
      .then((response) => {
        if (!active || !response) return;
        const results = extractApiResults<ConnectionUser>(response.data).filter((user) => !blockedIds.has(user.id));
        if (query.length >= 2) setSearchResults(results);
        else setSuggestions(results);
      })
      .catch((error) => {
        if (active) Alert.alert("Unable to find runners", getBackendErrorMessage(error));
      })
      .finally(() => {
        if (active) setSearchLoading(false);
      });

    return () => {
      active = false;
    };
  }, [blockedIds, findRunnersVisible, searchText, suggestions.length]);

  const visibleRunners = useMemo(
    () => searchText.trim().length >= 2 ? searchResults : suggestions,
    [searchResults, searchText, suggestions],
  );

  const handleLike = useCallback(async (post: SocialPost) => {
    if (likingPostIds.has(post.id)) return;
    setLikingPostIds((current) => new Set(current).add(post.id));
    const updateLike = (items: SocialPost[]) => items.map((item) => item.id === post.id
      ? { ...item, liked_by_me: !post.liked_by_me, like_count: Math.max(0, item.like_count + (post.liked_by_me ? -1 : 1)) }
      : item);
    setPosts(updateLike);
    setMyPosts(updateLike);
    try {
      if (post.liked_by_me) await socialAPI.unlikePost(post.id);
      else await socialAPI.likePost(post.id);
    } catch (error) {
      const revertLike = (items: SocialPost[]) => items.map((item) => item.id === post.id
        ? { ...item, liked_by_me: post.liked_by_me, like_count: post.like_count }
        : item);
      setPosts(revertLike);
      setMyPosts(revertLike);
      Alert.alert("Unable to update like", getBackendErrorMessage(error));
    } finally {
      setLikingPostIds((current) => {
        const next = new Set(current);
        next.delete(post.id);
        return next;
      });
    }
  }, [likingPostIds]);

  const openComments = useCallback(async (post: SocialPost) => {
    setCommentPost(post);
    setComments([]);
    setCommentText("");
    setCommentsLoading(true);
    try {
      const response = await socialAPI.getComments(post.id);
      setComments(extractApiResults<SocialComment>(response.data).filter((comment) => !blockedIds.has(comment.author.id)));
    } catch (error) {
      Alert.alert("Unable to load comments", getBackendErrorMessage(error));
    } finally {
      setCommentsLoading(false);
    }
  }, [blockedIds]);

  const sendComment = useCallback(async () => {
    if (!commentPost || !commentText.trim() || sendingComment) return;
    setSendingComment(true);
    try {
      const response = await socialAPI.addComment(commentPost.id, commentText.trim());
      const createdComment = response.data.data;
      setComments((current) => [createdComment, ...current]);
      setPosts((current) => current.map((post) => post.id === commentPost.id
        ? { ...post, comment_count: createdComment.comment_count ?? post.comment_count + 1 }
        : post));
      setMyPosts((current) => current.map((post) => post.id === commentPost.id
        ? { ...post, comment_count: createdComment.comment_count ?? post.comment_count + 1 }
        : post));
      setCommentText("");
    } catch (error) {
      Alert.alert("Unable to add comment", getBackendErrorMessage(error));
    } finally {
      setSendingComment(false);
    }
  }, [commentPost, commentText, sendingComment]);

  const toggleRunnerFollow = useCallback(async (runner: ConnectionUser) => {
    const shouldUnfollow = runner.relationship === "FOLLOWING" || runner.relationship === "REQUESTED";
    setFollowingIds((current) => new Set(current).add(runner.id));
    try {
      const response = shouldUnfollow
        ? await connectionsAPI.unfollow(runner.id)
        : await connectionsAPI.follow(runner.id);
      const relationship = response.data.data.relationship || (shouldUnfollow ? "NONE" : "FOLLOWING");
      const update = (items: ConnectionUser[]) => items.map((item) => (
        item.id === runner.id ? { ...item, relationship } : item
      ));
      setSuggestions(update);
      setSearchResults(update);
    } catch (error) {
      Alert.alert(shouldUnfollow ? "Unable to unfollow runner" : "Unable to follow runner", getBackendErrorMessage(error));
    } finally {
      setFollowingIds((current) => {
        const next = new Set(current);
        next.delete(runner.id);
        return next;
      });
    }
  }, []);

  const reportComment = useCallback((comment: SocialComment, anchor: { x: number; y: number; width: number; height: number }) => openModeration(comment.author, "comment", "COMMENT", comment.id, anchor), [openModeration]);

  const renderRunner = useCallback(({ item }: { item: ConnectionUser }) => {
    const isFollowing = item.relationship === "FOLLOWING";
    const isRequested = item.relationship === "REQUESTED";
    const isBusy = followingIds.has(item.id);
    return (
      <View style={[styles.runnerRow, { borderBottomColor: colors.border }]}>
        <Avatar name={item.full_name || item.username} imageUrl={item.avatar_url || undefined} size={42} />
        <View style={styles.runnerInfo}>
          <Text style={[styles.authorName, { color: colors.text }]} numberOfLines={1}>{item.full_name || item.username}</Text>
          <Text style={[styles.username, { color: colors.textSecondary }]} numberOfLines={1}>@{item.username}</Text>
          {item.mutual_count ? <Text style={[styles.mutualText, { color: colors.textTertiary }]}>{item.mutual_count} mutual connections</Text> : null}
        </View>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={isFollowing ? `Unfollow ${item.username}` : isRequested ? `Cancel follow request to ${item.username}` : `Follow ${item.username}`}
          accessibilityState={{ disabled: isBusy, busy: isBusy }}
          disabled={isBusy}
          onPress={() => void toggleRunnerFollow(item)}
          style={[styles.followButton, { backgroundColor: isFollowing || isRequested ? colors.background : colors.primary }]}
        >
          {isBusy ? <ActivityIndicator size="small" color={colors.primaryText} /> : (
            <Text style={[styles.followButtonText, { color: isFollowing || isRequested ? colors.textSecondary : colors.primaryText }]}>
              {isFollowing ? "Following" : isRequested ? "Requested" : "Follow"}
            </Text>
          )}
        </TouchableOpacity>
        <AnchoredMoreButton label={`More options for ${item.username}`} size={20} color={colors.textSecondary} style={styles.moreButton} onPress={(anchor) => openRunnerActions(item, anchor)} />
      </View>
    );
  }, [colors, followingIds, openRunnerActions, toggleRunnerFollow]);

  const renderPost = useCallback(({ item }: { item: SocialPost }) => (
    <ConnectionCard
      post={item}
      colors={colors}
      isLiking={likingPostIds.has(item.id)}
      onLike={() => void handleLike(item)}
      onComments={() => void openComments(item)}
      onDetails={() => setDetailsPost(item)}
      onShare={() => {
        const description = `${item.author.full_name || item.author.username}'s ${formatDistance(item.activity.distance_km)} workout`;
        void Share.share({ message: item.share_url ? `${description}\n${item.share_url}` : description });
      }}
      onMore={(anchor) => openPostActions(item, anchor)}
    />
  ), [colors, handleLike, likingPostIds, openComments, openPostActions]);

  return (
    <SafeAreaView edges={["top", "left", "right"]} style={[styles.screen, { backgroundColor: colors.background }]}>
      <FlatList
        data={posts}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderPost}
        contentContainerStyle={styles.feedContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void loadFeed(true)}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        ListHeaderComponent={
          <View style={styles.feedHeader}>
            <Text style={[styles.feedTitle, { color: colors.text }]}>Connections</Text>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="My posts"
              onPress={() => setMyPostsVisible(true)}
              style={[styles.findButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              <Feather name="file-text" size={20} color={colors.primary} />
            </TouchableOpacity>
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <View style={styles.emptyState}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={[styles.emptyCopy, { color: colors.textSecondary }]}>Loading your connections...</Text>
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Feather name={loadError ? "wifi-off" : "users"} size={34} color={colors.textTertiary} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>
                {loadError ? "Feed unavailable" : "Your feed starts here"}
              </Text>
              <Text style={[styles.emptyCopy, { color: colors.textSecondary }]}>
                {loadError || "Follow runners to see their workouts and updates."}
              </Text>
              <TouchableOpacity onPress={() => setFindRunnersVisible(true)} style={[styles.primaryButton, { backgroundColor: colors.primary }]}>
                <Text style={[styles.primaryButtonText, { color: colors.primaryText }]}>Find runners</Text>
              </TouchableOpacity>
              {loadError ? (
                <TouchableOpacity onPress={() => void loadFeed()} style={styles.retryButton}>
                  <Text style={[styles.actionLinkText, { color: colors.primary }]}>Try again</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          )
        }
        ListFooterComponent={<View style={styles.feedFooter} />}
      />

      <Modal
        visible={myPostsVisible}
        animationType="slide"
        onRequestClose={() => setMyPostsVisible(false)}
      >
        <SafeAreaView edges={["top", "left", "right"]} style={[styles.modalScreen, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Back to Connections" onPress={() => setMyPostsVisible(false)} style={styles.modalBack}>
              <Feather name="chevron-left" size={25} color={colors.text} />
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.text }]}>My posts</Text>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Refresh my posts" onPress={() => void loadMyPosts()} style={styles.modalBack}>
              <Feather name="refresh-cw" size={17} color={colors.primary} />
            </TouchableOpacity>
          </View>
          <FlatList
            data={myPosts}
            keyExtractor={(item) => String(item.id)}
            renderItem={renderPost}
            contentContainerStyle={styles.feedContent}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={myPostsLoading}
                onRefresh={() => void loadMyPosts()}
                tintColor={colors.primary}
                colors={[colors.primary]}
              />
            }
            ListEmptyComponent={myPostsLoading ? (
              <View style={styles.emptyState}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={[styles.emptyCopy, { color: colors.textSecondary }]}>Loading your posts...</Text>
              </View>
            ) : (
              <View style={styles.emptyState}>
                <Feather name={myPostsError ? "wifi-off" : "file-text"} size={32} color={colors.textTertiary} />
                <Text style={[styles.emptyTitle, { color: colors.text }]}>{myPostsError ? "Posts unavailable" : "No posts yet"}</Text>
                <Text style={[styles.emptyCopy, { color: colors.textSecondary }]}>
                  {myPostsError || "Your shared workouts will appear here."}
                </Text>
                {myPostsError ? (
                  <TouchableOpacity onPress={() => void loadMyPosts()} style={styles.retryButton}>
                    <Text style={[styles.actionLinkText, { color: colors.primary }]}>Try again</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            )}
            ListFooterComponent={<View style={styles.feedFooter} />}
          />
        </SafeAreaView>
      </Modal>

      <Modal
        visible={findRunnersVisible}
        animationType="slide"
        onRequestClose={closeRunnerSearch}
      >
        <SafeAreaView edges={["top", "left", "right"]} style={[styles.modalScreen, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Back to Connections" onPress={closeRunnerSearch} style={styles.modalBack}>
              <Feather name="chevron-left" size={25} color={colors.text} />
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Find runners</Text>
            <View style={styles.modalBack} />
          </View>
          <View style={[styles.searchBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Feather name="search" size={18} color={colors.textTertiary} />
            <TextInput
              value={searchText}
              onChangeText={(value) => {
                setSearchLoading(true);
                setSearchText(value);
              }}
              placeholder="Search by username"
              placeholderTextColor={colors.textTertiary}
              autoCapitalize="none"
              autoCorrect={false}
              style={[styles.searchInput, { color: colors.text }]}
              returnKeyType="search"
            />
            {searchText ? (
              <Pressable onPress={() => setSearchText("")} accessibilityRole="button" accessibilityLabel="Clear search">
                <Feather name="x-circle" size={18} color={colors.textTertiary} />
              </Pressable>
            ) : null}
          </View>
          <Text style={[styles.searchSectionTitle, { color: colors.textSecondary }]}>
            {searchText.trim().length >= 2 ? "SEARCH RESULTS" : "SUGGESTED RUNNERS"}
          </Text>
          {searchLoading ? <ActivityIndicator style={styles.searchLoader} color={colors.primary} /> : null}
          <FlatList
            data={visibleRunners}
            keyExtractor={(item) => String(item.id)}
            renderItem={renderRunner}
            contentContainerStyle={styles.runnerList}
            ListEmptyComponent={!searchLoading ? (
              <Text style={[styles.emptyCopy, { color: colors.textSecondary }]}>
                {searchText.trim().length < 2 ? "No suggestions right now." : "No runners found."}
              </Text>
            ) : null}
          />
        </SafeAreaView>
      </Modal>

      <Modal
        visible={detailsPost !== null}
        animationType="slide"
        onRequestClose={() => setDetailsPost(null)}
      >
        <SafeAreaView edges={["top", "left", "right", "bottom"]} style={[styles.modalScreen, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close workout details" onPress={() => setDetailsPost(null)} style={styles.modalBack}>
              <Feather name="chevron-left" size={25} color={colors.text} />
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Workout details</Text>
            <View style={styles.modalBack} />
          </View>
          {detailsPost ? (
            <ScrollView contentContainerStyle={styles.detailsContent} showsVerticalScrollIndicator={false}>
              <View style={[styles.detailsHero, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={styles.detailsHeroTop}>
                  <View style={[styles.detailsActivityIcon, { backgroundColor: colors.background }]}>
                    <Feather name="activity" size={20} color={colors.primary} />
                  </View>
                  <View style={styles.detailsHeroCopy}>
                    <Text style={[styles.detailsActivityName, { color: colors.text }]}>
                      {detailsPost.activity.activity_type
                        ? `${detailsPost.activity.activity_type.charAt(0).toUpperCase()}${detailsPost.activity.activity_type.slice(1).toLowerCase()}`
                        : "Workout"}
                    </Text>
                    <Text style={[styles.detailsByline, { color: colors.textSecondary }]}>
                      {detailsPost.author.full_name || detailsPost.author.username} · {formatRelativeTime(detailsPost.created_at)}
                    </Text>
                  </View>
                </View>
                <Text style={[styles.detailsDistance, { color: colors.text }]}>{formatDistance(detailsPost.activity.distance_km)}</Text>
                <Text style={[styles.detailsDistanceLabel, { color: colors.textSecondary }]}>Total distance</Text>
              </View>

              {!detailsPost.hide_map && detailsPost.activity.encoded_polyline ? (
                <View style={[styles.detailsMap, { borderColor: colors.border }]}>
                  <ActivityRouteMap
                    encodedPolyline={detailsPost.activity.encoded_polyline}
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
                  <Text style={[styles.detailsStatValue, { color: colors.text }]}>{formatDuration(detailsPost.activity.moving_time)}</Text>
                  <Text style={[styles.detailsStatLabel, { color: colors.textSecondary }]}>Moving time</Text>
                </View>
                <View style={[styles.detailsStatCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Feather name="navigation" size={17} color={colors.primary} />
                  <Text style={[styles.detailsStatValue, { color: colors.text }]}>{formatPace(detailsPost.activity.avg_pace)}</Text>
                  <Text style={[styles.detailsStatLabel, { color: colors.textSecondary }]}>Average pace</Text>
                </View>
                <View style={[styles.detailsStatCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Feather name="trending-up" size={17} color={colors.primary} />
                  <Text style={[styles.detailsStatValue, { color: colors.text }]}>{Math.round(detailsPost.activity.elevation_gain || 0)} m</Text>
                  <Text style={[styles.detailsStatLabel, { color: colors.textSecondary }]}>Elevation gain</Text>
                </View>
                <View style={[styles.detailsStatCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Feather name="zap" size={17} color={colors.primary} />
                  <Text style={[styles.detailsStatValue, { color: colors.text }]}>{Math.round(detailsPost.activity.calories || 0)}</Text>
                  <Text style={[styles.detailsStatLabel, { color: colors.textSecondary }]}>Calories</Text>
                </View>
              </View>

              {detailsPost.caption ? (
                <View style={[styles.detailsCaptionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Text style={[styles.detailsSectionTitle, { color: colors.textSecondary, marginTop: 0 }]}>NOTE</Text>
                  <Text style={[styles.detailsCaption, { color: colors.text }]}>{detailsPost.caption}</Text>
                </View>
              ) : null}
            </ScrollView>
          ) : null}
        </SafeAreaView>
      </Modal>

      <Modal
        visible={commentPost !== null}
        animationType="slide"
        onRequestClose={() => setCommentPost(null)}
      >
        <SafeAreaView edges={["top", "left", "right", "bottom"]} style={[styles.modalScreen, { backgroundColor: colors.background }]}>
          <KeyboardAvoidingView
            style={styles.keyboardAvoiding}
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            keyboardVerticalOffset={0}
          >
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close comments" onPress={() => setCommentPost(null)} style={styles.modalBack}>
              <Feather name="chevron-left" size={25} color={colors.text} />
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Comments</Text>
            <View style={styles.modalBack} />
          </View>
          {commentsLoading ? <ActivityIndicator style={styles.searchLoader} color={colors.primary} /> : null}
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
                    <AnchoredMoreButton label="Comment options" size={16} color={colors.textTertiary} onPress={(anchor) => reportComment(item, anchor)} />
                  </View>
                  <Text style={[styles.commentBody, { color: colors.textSecondary }]}>{item.body}</Text>
                </View>
              </View>
            )}
            ListEmptyComponent={!commentsLoading ? (
              <Text style={[styles.emptyCopy, { color: colors.textSecondary }]}>No comments yet. Start the conversation.</Text>
            ) : null}
          />
          <View style={[styles.commentComposer, { borderTopColor: colors.border, paddingBottom: 8 }]}>
            <TextInput
              value={commentText}
              onChangeText={setCommentText}
              placeholder="Write a comment..."
              placeholderTextColor={colors.textTertiary}
              style={[styles.commentInput, { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border }]}
              maxLength={2000}
              multiline
            />
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Send comment"
              disabled={!commentText.trim() || sendingComment}
              onPress={() => void sendComment()}
              style={[styles.sendButton, { backgroundColor: colors.primary, opacity: !commentText.trim() || sendingComment ? 0.55 : 1 }]}
            >
              {sendingComment ? <ActivityIndicator size="small" color={colors.primaryText} /> : <Feather name="send" size={17} color={colors.primaryText} />}
            </TouchableOpacity>
          </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      <Modal
        visible={moderationTarget !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setModerationTarget(null)}
      >
        <View style={styles.moderationOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setModerationTarget(null)} accessibilityLabel="Close options" />
          {moderationTarget ? (
            <View
              style={[
                styles.moderationPopover,
                {
                  width: Math.min(windowWidth - 24, 276),
                  top: Math.max(8, Math.min(moderationTarget.anchor.y + moderationTarget.anchor.height + 6, windowHeight - (moderationTarget.step === "report" ? 450 : 236))),
                  right: Math.max(12, windowWidth - moderationTarget.anchor.x - moderationTarget.anchor.width),
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                },
              ]}
            >
              <View style={styles.moderationHeading}>
                <View style={[styles.moderationIcon, { backgroundColor: colors.background }]}>
                  <Feather name={moderationTarget.step === "block" ? "user-x" : moderationTarget.step === "report" ? "flag" : "shield"} size={17} color={moderationTarget.step === "block" ? "#E5484D" : colors.primary} />
                </View>
                <View style={styles.moderationHeadingText}>
                  <Text style={[styles.moderationTitle, { color: colors.text }]}>
                    {moderationTarget.step === "block" ? "Block runner?" : moderationTarget.step === "report" ? `Report ${moderationTarget.kind}` : moderationTarget.step === "reported" ? "Report sent" : "Runner options"}
                  </Text>
                  <Text style={[styles.moderationSubtitle, { color: colors.textSecondary }]} numberOfLines={1}>
                    {moderationTarget.user.full_name || moderationTarget.user.username}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setModerationTarget(null)} accessibilityRole="button" accessibilityLabel="Close" style={styles.moderationClose}>
                  <Feather name="x" size={18} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>

              {moderationTarget.step === "actions" ? (
                <>
                  <TouchableOpacity style={[styles.moderationAction, { borderColor: colors.border }]} onPress={() => { setModerationError(null); setModerationTarget((current) => current ? { ...current, step: "report" } : null); }}>
                    <Feather name="flag" size={16} color={colors.textSecondary} />
                    <Text style={[styles.moderationActionText, { color: colors.text }]}>Report {moderationTarget.kind === "runner" ? "runner" : moderationTarget.kind}</Text>
                    <Feather name="chevron-right" size={16} color={colors.textTertiary} />
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.moderationAction, { borderColor: colors.border }]} onPress={() => { setModerationError(null); setModerationTarget((current) => current ? { ...current, step: "block" } : null); }}>
                    <Feather name="user-x" size={16} color="#E5484D" />
                    <Text style={[styles.moderationActionText, { color: "#E5484D" }]}>Block runner</Text>
                    <Feather name="chevron-right" size={16} color={colors.textTertiary} />
                  </TouchableOpacity>
                </>
              ) : moderationTarget.step === "report" ? (
                <>
                  <Text style={[styles.moderationSectionLabel, { color: colors.textSecondary }]}>Choose a reason</Text>
                  <ScrollView style={styles.moderationReasonList} nestedScrollEnabled showsVerticalScrollIndicator={false}>
                    {REPORT_REASONS.map((reason) => {
                      const selected = reportReason === reason.value;
                      return (
                        <TouchableOpacity key={reason.value} onPress={() => setReportReason(reason.value)} style={[styles.moderationReasonRow, { borderBottomColor: colors.border }]}>
                          <Text style={[styles.moderationReasonText, { color: colors.text }]}>{reason.label}</Text>
                          <Feather name={selected ? "check-circle" : "circle"} size={17} color={selected ? colors.primary : colors.textTertiary} />
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                  <TextInput
                    value={reportDetails}
                    onChangeText={setReportDetails}
                    placeholder="Add details (optional)"
                    placeholderTextColor={colors.textTertiary}
                    maxLength={1000}
                    multiline
                    style={[styles.moderationDetails, { color: colors.text, backgroundColor: colors.background, borderColor: colors.border }]}
                  />
                  {moderationError ? <Text style={[styles.moderationError, { color: "#E5484D" }]}>{moderationError}</Text> : null}
                  <TouchableOpacity disabled={!reportReason || moderationBusy} onPress={() => void submitContentReport()} style={[styles.moderationPrimary, { backgroundColor: colors.primary, opacity: !reportReason || moderationBusy ? 0.55 : 1 }]}>
                    {moderationBusy ? <ActivityIndicator size="small" color={colors.primaryText} /> : <Text style={[styles.moderationPrimaryText, { color: colors.primaryText }]}>Send report</Text>}
                  </TouchableOpacity>
                </>
              ) : moderationTarget.step === "block" ? (
                <>
                  <Text style={[styles.moderationBody, { color: colors.textSecondary }]}>You and this runner will no longer see each other in Connections.</Text>
                  {moderationError ? <Text style={[styles.moderationError, { color: "#E5484D" }]}>{moderationError}</Text> : null}
                  <TouchableOpacity disabled={moderationBusy} onPress={() => void confirmBlock()} style={[styles.moderationPrimary, { backgroundColor: "#E5484D", opacity: moderationBusy ? 0.7 : 1 }]}>
                    {moderationBusy ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={styles.moderationPrimaryText}>Block runner</Text>}
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setModerationTarget((current) => current ? { ...current, step: "actions" } : null)} style={styles.moderationCancel}>
                    <Text style={[styles.moderationCancelText, { color: colors.textSecondary }]}>Back</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <Text style={[styles.moderationBody, { color: colors.textSecondary }]}>{moderationTarget.step === "reported" ? "Thanks. Your report was sent privately to the moderation team." : "Your report could not be sent."}</Text>
                  <TouchableOpacity onPress={() => setModerationTarget(null)} style={[styles.moderationPrimary, { backgroundColor: colors.primary }]}>
                    <Text style={[styles.moderationPrimaryText, { color: colors.primaryText }]}>Done</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          ) : null}
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  feedContent: { paddingHorizontal: 16, paddingBottom: 12, flexGrow: 1 },
  feedHeader: { minHeight: 66, flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  feedTitle: { fontSize: 28, lineHeight: 34, fontWeight: "800" },
  findButton: { width: 44, height: 44, borderRadius: 22, borderWidth: StyleSheet.hairlineWidth, alignItems: "center", justifyContent: "center" },
  postCard: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, padding: 10, marginBottom: 10 },
  postHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  authorInfo: { flex: 1, minWidth: 0 },
  authorName: { fontSize: 13, fontWeight: "700" },
  username: { fontSize: 10, marginTop: 1 },
  postTime: { fontSize: 10 },
  workoutCard: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 9 },
  workoutMap: { marginTop: 8 },
  workoutHeading: { flexDirection: "row", alignItems: "center", gap: 7 },
  workoutType: { fontSize: 14, fontWeight: "700", flex: 1 },
  distance: { fontSize: 14, fontWeight: "800" },
  metrics: { flexDirection: "row", gap: 12, marginTop: 6 },
  metric: { flexDirection: "row", alignItems: "center", gap: 5 },
  metricText: { fontSize: 10 },
  caption: { fontSize: 12, lineHeight: 16, marginTop: 8 },
  postActions: { minHeight: 34, flexDirection: "row", alignItems: "center", gap: 9, borderTopWidth: StyleSheet.hairlineWidth, marginTop: 8, paddingTop: 6 },
  actionButton: { minHeight: 26, flexDirection: "row", alignItems: "center", gap: 4 },
  actionCount: { fontSize: 11 },
  actionLink: { minHeight: 26, justifyContent: "center" },
  actionLinkText: { fontSize: 10, fontWeight: "500" },
  shareButton: { flexDirection: "row", alignItems: "center", gap: 5, marginLeft: "auto" },
  emptyState: { flex: 1, minHeight: 310, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 },
  emptyTitle: { fontSize: 17, fontWeight: "700", marginTop: 14, textAlign: "center" },
  emptyCopy: { fontSize: 13, lineHeight: 19, textAlign: "center", marginTop: 8, paddingHorizontal: 12 },
  primaryButton: { minHeight: 42, borderRadius: 22, paddingHorizontal: 20, alignItems: "center", justifyContent: "center", marginTop: 18 },
  primaryButtonText: { fontSize: 14, fontWeight: "700" },
  retryButton: { padding: 12 },
  feedFooter: { height: 92 },
  modalScreen: { flex: 1 },
  keyboardAvoiding: { flex: 1 },
  modalHeader: { height: 54, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12 },
  modalBack: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  modalTitle: { fontSize: 17, fontWeight: "700" },
  searchBox: { minHeight: 44, marginHorizontal: 16, marginTop: 14, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 8 },
  searchInput: { flex: 1, minHeight: 42, fontSize: 14 },
  searchSectionTitle: { fontSize: 10, fontWeight: "700", letterSpacing: 0.8, marginHorizontal: 18, marginTop: 20, marginBottom: 4 },
  searchLoader: { margin: 18 },
  runnerList: { paddingHorizontal: 16, paddingBottom: 24 },
  runnerRow: { minHeight: 70, flexDirection: "row", alignItems: "center", gap: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  moreButton: { minWidth: 28, minHeight: 30, alignItems: "center", justifyContent: "center" },
  runnerInfo: { flex: 1, minWidth: 0 },
  mutualText: { fontSize: 10, marginTop: 3 },
  followButton: { minWidth: 78, minHeight: 34, borderRadius: 17, paddingHorizontal: 12, alignItems: "center", justifyContent: "center" },
  followButtonText: { fontSize: 12, fontWeight: "700" },
  commentList: { padding: 16, flexGrow: 1 },
  commentsList: { flex: 1 },
  commentRow: { flexDirection: "row", alignItems: "flex-start", gap: 9, marginBottom: 12 },
  commentBubble: { flex: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 9 },
  commentHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  commentAuthor: { fontSize: 12, fontWeight: "700" },
  commentBody: { fontSize: 13, lineHeight: 18, marginTop: 3 },
  commentComposer: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, paddingTop: 10, flexDirection: "row", alignItems: "flex-end", gap: 8 },
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
  moderationOverlay: { flex: 1, backgroundColor: "transparent" },
  moderationPopover: { position: "absolute", borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, padding: 12, shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 18 },
  moderationHeading: { flexDirection: "row", alignItems: "center", marginBottom: 10, gap: 9 },
  moderationIcon: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  moderationHeadingText: { flex: 1 },
  moderationTitle: { fontSize: 14, fontWeight: "800" },
  moderationSubtitle: { fontSize: 11, marginTop: 2 },
  moderationClose: { width: 28, height: 28, alignItems: "center", justifyContent: "center" },
  moderationAction: { minHeight: 42, borderWidth: StyleSheet.hairlineWidth, borderRadius: 11, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", gap: 9, marginTop: 7 },
  moderationActionText: { flex: 1, fontSize: 12, fontWeight: "600" },
  moderationSectionLabel: { fontSize: 11, fontWeight: "600", marginBottom: 4 },
  moderationReasonList: { maxHeight: 206 },
  moderationReasonRow: { minHeight: 34, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  moderationReasonText: { flex: 1, fontSize: 11 },
  moderationDetails: { minHeight: 44, maxHeight: 72, borderWidth: StyleSheet.hairlineWidth, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 7, fontSize: 11, marginTop: 8, textAlignVertical: "top" },
  moderationBody: { fontSize: 12, lineHeight: 17, marginBottom: 12 },
  moderationError: { fontSize: 11, lineHeight: 15, marginTop: -4, marginBottom: 8 },
  moderationPrimary: { minHeight: 40, borderRadius: 11, alignItems: "center", justifyContent: "center", marginTop: 9 },
  moderationPrimaryText: { color: "#FFFFFF", fontSize: 12, fontWeight: "700" },
  moderationCancel: { minHeight: 32, alignItems: "center", justifyContent: "center" },
  moderationCancelText: { fontSize: 12, fontWeight: "600" },
  commentInput: { flex: 1, minHeight: 40, maxHeight: 100, borderWidth: StyleSheet.hairlineWidth, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 9, fontSize: 14 },
  sendButton: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
});
