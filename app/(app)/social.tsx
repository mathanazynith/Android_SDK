import { Feather } from "@expo/vector-icons";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
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
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { RunningLoader } from "../../components/common/RunningLoader";
import { useTheme } from "../../contexts/ThemeContext";
import { getBackendErrorMessage } from "../../service/api";
import { Avatar } from "../../components/Avatar";
import {
  AnchoredMoreButton,
  FeedPostCard,
  formatDistance,
  sortSocialPosts,
} from "../../components/social/FeedPostCard";
import { PostCommentsModal, PostDetailsModal } from "../../components/social/PostInteractionModals";
import {
  connectionsAPI,
  extractApiResults,
  getOnlyMeDefaultAudience,
  socialAPI,
  type ConnectionUser,
  type ContentReportReason,
  type ContentReportTargetType,
  type SocialComment,
  type SocialPost,
  type SocialPostVisibility,
} from "../../src/services/socialApi";
import {
  publishSocialPostDeleted,
  publishSocialPostPatch,
  subscribeToSocialPostChanges,
} from "../../src/services/socialPostEvents";

const REPORT_REASONS: { value: ContentReportReason; label: string }[] = [
  { value: "SPAM", label: "Spam or scam" },
  { value: "HARASSMENT", label: "Harassment or bullying" },
  { value: "HATE", label: "Hateful content" },
  { value: "INAPPROPRIATE", label: "Inappropriate content" },
  { value: "DANGEROUS", label: "Dangerous activity" },
  { value: "IMPERSONATION", label: "Impersonation" },
  { value: "OTHER", label: "Other" },
];

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
  const [editingPost, setEditingPost] = useState<SocialPost | null>(null);
  const [editCaption, setEditCaption] = useState("");
  const [editVisibility, setEditVisibility] = useState<SocialPostVisibility>("PUBLIC");
  const [editCommentsEnabled, setEditCommentsEnabled] = useState(true);
  const [editHideMap, setEditHideMap] = useState(false);
  const [editPostBusy, setEditPostBusy] = useState(false);
  const [editPostError, setEditPostError] = useState<string | null>(null);
  const [moderationTarget, setModerationTarget] = useState<{
    user: ConnectionUser;
    kind: "runner" | "workout" | "comment";
    targetType: ContentReportTargetType;
    targetId: number;
    anchor: { x: number; y: number; width: number; height: number };
    step: "actions" | "report" | "reported";
    isOwnPost: boolean;
    post: SocialPost | null;
  } | null>(null);
  const [moderationBusy, setModerationBusy] = useState(false);
  const [moderationError, setModerationError] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState<ContentReportReason | null>(null);
  const [reportDetails, setReportDetails] = useState("");
  const [, setRelativeTimeTick] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setRelativeTimeTick((tick) => tick + 1), 60_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => subscribeToSocialPostChanges((change) => {
    if ("deleted" in change) {
      setPosts((current) => current.filter((post) => post.id !== change.postId));
      setMyPosts((current) => current.filter((post) => post.id !== change.postId));
      setDetailsPost((current) => current?.id === change.postId ? null : current);
      setEditingPost((current) => current?.id === change.postId ? null : current);
      return;
    }

    setPosts((current) => current
      .filter((post) => post.id !== change.postId || (change.patch.visibility !== "ONLY_ME" && change.patch.visibility !== "NONE"))
      .map((post) => post.id === change.postId ? { ...post, ...change.patch } : post));
    setMyPosts((current) => current.map((post) => post.id === change.postId ? { ...post, ...change.patch } : post));
    setDetailsPost((current) => current?.id === change.postId ? { ...current, ...change.patch } : current);
    setEditingPost((current) => current?.id === change.postId ? { ...current, ...change.patch } : current);
  }), []);

  const openModeration = useCallback((
    user: ConnectionUser,
    kind: "runner" | "workout" | "comment",
    targetType: ContentReportTargetType,
    targetId: number,
    anchor: { x: number; y: number; width: number; height: number },
    isOwnPost = false,
    post: SocialPost | null = null,
  ) => {
    setModerationError(null);
    setReportReason(null);
    setReportDetails("");
    setModerationTarget({ user, kind, targetType, targetId, anchor, step: "actions", isOwnPost, post });
  }, []);

  const openRunnerActions = useCallback((runner: ConnectionUser, anchor: { x: number; y: number; width: number; height: number }) => openModeration(runner, "runner", "USER", runner.id, anchor), [openModeration]);

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

  const deleteOwnPost = useCallback((postId: number) => {
    setModerationTarget(null);
    Alert.alert(
      "Delete post?",
      "This removes the post from Connections and My Posts. The workout will remain in your history.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            void (async () => {
              try {
                await socialAPI.deletePost(postId);
                  publishSocialPostDeleted(postId);
              } catch (error) {
                Alert.alert("Unable to delete post", getBackendErrorMessage(error));
              }
            })();
          },
        },
      ],
    );
  }, []);

  const openEditPost = useCallback((post: SocialPost) => {
    setModerationTarget(null);
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
      const updatePost = (items: SocialPost[]) => items.map((item) => item.id === updatedPost.id ? updatedPost : item);
      setPosts((current) => editVisibility === "ONLY_ME"
        ? current.filter((item) => item.id !== updatedPost.id)
        : updatePost(current));
      setMyPosts(updatePost);
      setDetailsPost((current) => current?.id === updatedPost.id ? updatedPost : current);
      publishSocialPostPatch(updatedPost.id, updatedPost);
      setEditingPost(null);
    } catch (error) {
      setEditPostError(getBackendErrorMessage(error, "Could not update this post."));
    } finally {
      setEditPostBusy(false);
    }
  }, [editCaption, editCommentsEnabled, editHideMap, editPostBusy, editVisibility, editingPost]);

  const sharePost = useCallback(async (post: SocialPost) => {
    if (post.is_mine) {
      Alert.alert("Sharing unavailable", "You can share your own workout using its audience setting.");
      return;
    }
    // The backend owns the account privacy and audience rules. Ask it to
    // validate posts that do not include an externally shareable URL instead
    // of guessing from the feed's visibility value (which can differ by API).
    if (!post.share_url) {
      try {
        await socialAPI.sharePost(post.id, "EXTERNAL");
        Alert.alert("Sharing unavailable", "This workout does not have an external share link.");
      } catch (error) {
        Alert.alert("Unable to share post", getBackendErrorMessage(error));
      }
      return;
    }
    const description = `${post.author.full_name || post.author.username}'s ${formatDistance(post.activity.distance_km)} workout`;
    try {
      const result = await Share.share({ message: `${description}\n${post.share_url}` });
      if (result.action !== Share.sharedAction) return;
      const response = await socialAPI.sharePost(post.id, "EXTERNAL");
      publishSocialPostPatch(post.id, { share_count: response.data.data.share_count });
    } catch (error) {
      Alert.alert("Unable to share post", getBackendErrorMessage(error));
    }
  }, []);

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
      setPosts(sortSocialPosts(extractApiResults<SocialPost>(response.data).filter((post) => (
        !blockedIds.has(post.author.id)
        && post.visibility !== "ONLY_ME"
        && post.visibility !== "NONE"
      ))));
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

  const updateWorkoutAudience = useCallback(async (post: SocialPost) => {
    setModerationBusy(true);
    setModerationError(null);
    try {
      const settingsResponse = await socialAPI.getSharingSettings();
      const defaultAudience = settingsResponse.data.data.default_audience;
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
        setModerationTarget(null);
        Alert.alert(
          "Sharing is turned off",
          "Your Settings are set to Don't share. Choose Followers, Everyone, or Only me in Settings to share this workout.",
        );
        return;
      }
      const response = await socialAPI.updateWorkoutPost(post.id, { visibility });
      const updatedPost = response.data.data;
      if (visibility === "ONLY_ME") {
        setPosts((current) => current.filter((item) => item.id !== post.id));
      } else {
        setPosts((current) => current.some((item) => item.id === post.id)
          ? current.map((item) => item.id === post.id ? updatedPost : item)
          : [updatedPost, ...current]);
      }
      setMyPosts((current) => current.map((item) => item.id === post.id ? updatedPost : item));
      publishSocialPostPatch(post.id, updatedPost);
      setModerationTarget(null);
    } catch (error) {
      setModerationTarget(null);
      Alert.alert("Unable to share workout", getBackendErrorMessage(error, "Could not update this workout's audience."));
    } finally {
      setModerationBusy(false);
    }
  }, []);

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
    const optimisticLike = {
      liked_by_me: !post.liked_by_me,
      like_count: Math.max(0, post.like_count + (post.liked_by_me ? -1 : 1)),
    };
    publishSocialPostPatch(post.id, optimisticLike);
    try {
      const response = post.liked_by_me
        ? await socialAPI.unlikePost(post.id)
        : await socialAPI.likePost(post.id);
      publishSocialPostPatch(post.id, {
        liked_by_me: response.data.data.liked,
        like_count: response.data.data.like_count,
      });
    } catch (error) {
      const revertLike = (items: SocialPost[]) => items.map((item) => item.id === post.id
        ? { ...item, liked_by_me: post.liked_by_me, like_count: post.like_count }
        : item);
      setPosts(revertLike);
      setMyPosts(revertLike);
      publishSocialPostPatch(post.id, {
        liked_by_me: post.liked_by_me,
        like_count: post.like_count,
      });
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
      publishSocialPostPatch(commentPost.id, {
        comment_count: createdComment.comment_count ?? commentPost.comment_count + 1,
      });
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
  const deleteComment = useCallback((comment: SocialComment) => {
    const previousPost = [...posts, ...myPosts].find((post) => post.id === comment.post_id);
    if (!comment.can_delete || !previousPost) return;
    const nextCount = Math.max(0, previousPost.comment_count - 1);
    const updateCount = (items: SocialPost[], count: number) => items.map((post) => post.id === comment.post_id
      ? { ...post, comment_count: count }
      : post);
    setComments((current) => current.filter((item) => item.id !== comment.id));
    setPosts((current) => updateCount(current, nextCount));
    setMyPosts((current) => updateCount(current, nextCount));
    publishSocialPostPatch(comment.post_id, { comment_count: nextCount });
    void (async () => {
      try {
        const response = await socialAPI.deleteComment(comment.post_id, comment.id);
        const commentCount = response.data?.data?.comment_count;
        if (typeof commentCount === "number" && Number.isFinite(commentCount)) {
          setPosts((current) => updateCount(current, commentCount));
          setMyPosts((current) => updateCount(current, commentCount));
          publishSocialPostPatch(comment.post_id, { comment_count: commentCount });
        }
      } catch (error) {
        setComments((current) => current.some((item) => item.id === comment.id) ? current : [comment, ...current]);
        setPosts((current) => updateCount(current, previousPost.comment_count));
        setMyPosts((current) => updateCount(current, previousPost.comment_count));
        publishSocialPostPatch(comment.post_id, { comment_count: previousPost.comment_count });
        Alert.alert("Unable to delete comment", getBackendErrorMessage(error));
      }
    })();
  }, [myPosts, posts]);
  const openCommentActions = useCallback((
    comment: SocialComment,
    anchor: { x: number; y: number; width: number; height: number },
  ) => {
    if (!comment.can_delete) {
      reportComment(comment, anchor);
      return;
    }
    Alert.alert("Comment options", "Choose an action for this comment.", [
      { text: "Cancel", style: "cancel" },
      { text: "Report comment", onPress: () => reportComment(comment, anchor) },
      { text: "Delete comment", style: "destructive", onPress: () => deleteComment(comment) },
    ]);
  }, [deleteComment, reportComment]);
  const openPostActions = useCallback((post: SocialPost, anchor: { x: number; y: number; width: number; height: number }) => openModeration(post.author, "workout", "POST", post.id, anchor, post.is_mine, post), [openModeration]);

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
    <FeedPostCard
      post={item}
      colors={colors}
      isLiking={likingPostIds.has(item.id)}
      onLike={() => void handleLike(item)}
      onComments={() => void openComments(item)}
      onDetails={() => setDetailsPost(item)}
      onShare={() => void sharePost(item)}
      onMore={(anchor) => openPostActions(item, anchor)}
      onAuthorPress={() => router.push({ pathname: "/(app)/runner/[id]", params: { id: String(item.author.id) } })}
    />
  ), [colors, handleLike, likingPostIds, openComments, openPostActions, sharePost]);

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
              <RunningLoader size={64} label="Loading your connections..." />
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

      <PostDetailsModal post={detailsPost} colors={colors} onClose={() => setDetailsPost(null)} />
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
        onCommentOptions={openCommentActions}
      />

      <Modal
        visible={editingPost !== null}
        animationType="slide"
        onRequestClose={() => setEditingPost(null)}
      >
        <SafeAreaView edges={["top", "left", "right", "bottom"]} style={[styles.modalScreen, { backgroundColor: colors.background }]}>
          <KeyboardAvoidingView
            style={styles.keyboardAvoiding}
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            keyboardVerticalOffset={0}
          >
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Cancel editing" onPress={() => setEditingPost(null)} style={styles.modalBack}>
              <Feather name="x" size={22} color={colors.text} />
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Edit post</Text>
            <View style={styles.modalBack} />
          </View>
          <ScrollView
            style={styles.editPostScroll}
            contentContainerStyle={styles.editPostContent}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
            automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
          >
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
                <TouchableOpacity
                  key={visibility}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  onPress={() => setEditVisibility(visibility)}
                  style={[styles.editPostOption, { borderColor: selected ? colors.primary : colors.border, backgroundColor: colors.surface }]}
                >
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
            <TouchableOpacity
              accessibilityRole="button"
              disabled={editPostBusy}
              onPress={() => void savePostEdits()}
              style={[styles.editPostSave, { backgroundColor: colors.primary, opacity: editPostBusy ? 0.6 : 1 }]}
            >
              {editPostBusy ? <ActivityIndicator size="small" color={colors.primaryText} /> : <Text style={[styles.editPostSaveText, { color: colors.primaryText }]}>Save changes</Text>}
            </TouchableOpacity>
          </ScrollView>
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
                <View style={styles.moderationHeadingText}>
                  {moderationTarget.step !== "actions" ? (
                    <Text style={[styles.moderationTitle, { color: colors.text }]}>
                      {moderationTarget.step === "report" ? `Report ${moderationTarget.kind}` : "Report sent"}
                    </Text>
                  ) : null}
                  <Text style={[styles.moderationSubtitle, { color: colors.textSecondary }]} numberOfLines={1}>
                    {moderationTarget.user.full_name || moderationTarget.user.username}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setModerationTarget(null)} accessibilityRole="button" accessibilityLabel="Close" style={styles.moderationClose}>
                  <Feather name="x" size={18} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>

              {moderationTarget.step === "actions" ? (
                moderationTarget.isOwnPost ? (
                  <>
                    {moderationTarget.post ? (
                      <TouchableOpacity
                        style={[styles.moderationAction, { borderColor: colors.border }]}
                        onPress={() => openEditPost(moderationTarget.post!)}
                      >
                        <Feather name="edit-2" size={16} color={colors.primary} />
                        <Text style={[styles.moderationActionText, { color: colors.text }]}>Edit post</Text>
                        <Feather name="chevron-right" size={16} color={colors.textTertiary} />
                      </TouchableOpacity>
                    ) : null}
                    <TouchableOpacity
                      style={[styles.moderationAction, { borderColor: colors.border }]}
                      onPress={() => {
                        if (moderationTarget.post) void updateWorkoutAudience(moderationTarget.post);
                      }}
                    >
                      <Feather name="share" size={16} color={colors.primary} />
                      <Text style={[styles.moderationActionText, { color: colors.text }]}>Share the workout</Text>
                      <Feather name="chevron-right" size={16} color={colors.textTertiary} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.moderationAction, { borderColor: colors.border }]}
                      onPress={() => deleteOwnPost(moderationTarget.targetId)}
                    >
                      <Feather name="trash-2" size={16} color="#E5484D" />
                      <Text style={[styles.moderationActionText, { color: "#E5484D" }]}>Delete post</Text>
                      <Feather name="chevron-right" size={16} color={colors.textTertiary} />
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    {moderationTarget.kind === "workout"
                      && !moderationTarget.post?.is_mine ? (
                      <TouchableOpacity
                        style={[styles.moderationAction, { borderColor: colors.border }]}
                        onPress={() => {
                          const post = moderationTarget.post;
                          setModerationTarget(null);
                          if (post) void sharePost(post);
                        }}
                      >
                        <Feather name="share" size={16} color={colors.primary} />
                        <Text style={[styles.moderationActionText, { color: colors.text }]}>Share the workout</Text>
                        <Feather name="chevron-right" size={16} color={colors.textTertiary} />
                      </TouchableOpacity>
                    ) : null}
                    <TouchableOpacity style={[styles.moderationAction, { borderColor: colors.border }]} onPress={() => { setModerationError(null); setModerationTarget((current) => current ? { ...current, step: "report" } : null); }}>
                      <Feather name="flag" size={16} color={colors.textSecondary} />
                      <Text style={[styles.moderationActionText, { color: colors.text }]}>Report {moderationTarget.kind === "runner" ? "runner" : moderationTarget.kind}</Text>
                      <Feather name="chevron-right" size={16} color={colors.textTertiary} />
                    </TouchableOpacity>
                  </>
                )
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
  authorName: { fontSize: 13, fontWeight: "700" },
  username: { fontSize: 10, marginTop: 1 },
  actionLinkText: { fontSize: 10, fontWeight: "500" },
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
