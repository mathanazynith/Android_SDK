import { Feather } from "@expo/vector-icons";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { RunningLoader } from "../../components/common/RunningLoader";
import { useTheme } from "../../contexts/ThemeContext";
import { getBackendErrorMessage } from "../../service/api";
import { Avatar } from "../../components/Avatar";
import {
  connectionsAPI,
  extractApiResults,
  socialAPI,
  type ConnectionUser,
  type SocialComment,
  type SocialPost,
} from "../../src/services/socialApi";

const formatDistance = (distanceKm: number) => `${Number(distanceKm || 0).toFixed(2)} km`;

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

function ConnectionCard({
  post,
  colors,
  isLiking,
  onLike,
  onComments,
  onDetails,
  onShare,
}: {
  post: SocialPost;
  colors: ReturnType<typeof useTheme>["colors"];
  isLiking: boolean;
  onLike: () => void;
  onComments: () => void;
  onDetails: () => void;
  onShare: () => void;
}) {
  const name = post.author.full_name || post.author.username;
  const distance = Number(post.activity?.distance_km);
  return (
    <View style={[styles.postCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.postHeader}>
        <Avatar name={name} imageUrl={post.author.avatar_url || undefined} size={40} />
        <View style={styles.authorInfo}>
          <Text style={[styles.authorName, { color: colors.text }]} numberOfLines={1}>{name}</Text>
          <Text style={[styles.username, { color: colors.textSecondary }]} numberOfLines={1}>@{post.author.username}</Text>
        </View>
        <Text style={[styles.postTime, { color: colors.textTertiary }]}>{formatRelativeTime(post.created_at)}</Text>
      </View>

      <View style={[styles.workoutCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
        <View style={styles.workoutHeading}>
          <Feather name="activity" size={18} color={colors.text} />
          <Text style={[styles.workoutType, { color: colors.text }]}>
            {post.activity?.activity_type
              ? `${post.activity.activity_type.charAt(0).toUpperCase()}${post.activity.activity_type.slice(1).toLowerCase()}`
              : "Run"}
          </Text>
          <Text style={[styles.distance, { color: colors.text }]}>{formatDistance(distance)}</Text>
        </View>
        <View style={styles.metrics}>
          <View style={styles.metric}>
            <Feather name="clock" size={13} color={colors.textTertiary} />
            <Text style={[styles.metricText, { color: colors.textSecondary }]}>{formatDuration(post.activity?.moving_time)}</Text>
          </View>
          <View style={styles.metric}>
            <Feather name="navigation" size={13} color={colors.textTertiary} />
            <Text style={[styles.metricText, { color: colors.textSecondary }]}>{formatPace(post.activity?.avg_pace)}</Text>
          </View>
        </View>
      </View>

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
          <Feather name="heart" size={17} color={post.liked_by_me ? "#E5484D" : colors.text} />
          <Text style={[styles.actionCount, { color: colors.text }]}>{post.like_count}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="View comments"
          onPress={onComments}
          style={styles.actionButton}
        >
          <Feather name="message-square" size={17} color={colors.primary} />
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
          <Feather name="share" size={17} color={colors.text} />
          <Text style={[styles.actionCount, { color: colors.text }]}>{post.share_count}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function SocialScreen() {
  const { colors } = useTheme();
  const { findRunners, returnToPrivacy } = useLocalSearchParams<{ findRunners?: string; returnToPrivacy?: string }>();
  const [posts, setPosts] = useState<SocialPost[]>([]);
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
  const [commentPost, setCommentPost] = useState<SocialPost | null>(null);
  const [comments, setComments] = useState<SocialComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [sendingComment, setSendingComment] = useState(false);
  const [commentText, setCommentText] = useState("");

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
      setPosts(extractApiResults<SocialPost>(response.data));
    } catch (error) {
      const message = getBackendErrorMessage(error, "Unable to load the Connections feed.");
      setLoadError(message);
      if (isRefresh) Alert.alert("Feed unavailable", message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

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
        const results = extractApiResults<ConnectionUser>(response.data);
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
  }, [findRunnersVisible, searchText, suggestions.length]);

  const visibleRunners = useMemo(
    () => searchText.trim().length >= 2 ? searchResults : suggestions,
    [searchResults, searchText, suggestions],
  );

  const handleLike = useCallback(async (post: SocialPost) => {
    if (likingPostIds.has(post.id)) return;
    setLikingPostIds((current) => new Set(current).add(post.id));
    setPosts((current) => current.map((item) => item.id === post.id
      ? { ...item, liked_by_me: !post.liked_by_me, like_count: Math.max(0, item.like_count + (post.liked_by_me ? -1 : 1)) }
      : item));
    try {
      if (post.liked_by_me) await socialAPI.unlikePost(post.id);
      else await socialAPI.likePost(post.id);
    } catch (error) {
      setPosts((current) => current.map((item) => item.id === post.id
        ? { ...item, liked_by_me: post.liked_by_me, like_count: post.like_count }
        : item));
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
      setComments(extractApiResults<SocialComment>(response.data));
    } catch (error) {
      Alert.alert("Unable to load comments", getBackendErrorMessage(error));
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
      setPosts((current) => current.map((post) => post.id === commentPost.id
        ? { ...post, comment_count: createdComment.comment_count ?? post.comment_count + 1 }
        : post));
      setCommentText("");
    } catch (error) {
      Alert.alert("Unable to add comment", getBackendErrorMessage(error));
    } finally {
      setSendingComment(false);
    }
  }, [commentPost, commentText, sendingComment]);

  const followRunner = useCallback(async (runner: ConnectionUser) => {
    if (runner.relationship && runner.relationship !== "NONE") return;
    setFollowingIds((current) => new Set(current).add(runner.id));
    try {
      const response = await connectionsAPI.follow(runner.id);
      const relationship = response.data.data.relationship || "FOLLOWING";
      const update = (items: ConnectionUser[]) => items.map((item) => (
        item.id === runner.id ? { ...item, relationship } : item
      ));
      setSuggestions(update);
      setSearchResults(update);
    } catch (error) {
      Alert.alert("Unable to follow runner", getBackendErrorMessage(error));
    } finally {
      setFollowingIds((current) => {
        const next = new Set(current);
        next.delete(runner.id);
        return next;
      });
    }
  }, []);

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
          accessibilityState={{ disabled: isBusy || isFollowing || isRequested, busy: isBusy }}
          disabled={isBusy || isFollowing || isRequested}
          onPress={() => void followRunner(item)}
          style={[styles.followButton, { backgroundColor: isFollowing || isRequested ? colors.background : colors.primary }]}
        >
          {isBusy ? <ActivityIndicator size="small" color={colors.primaryText} /> : (
            <Text style={[styles.followButtonText, { color: isFollowing || isRequested ? colors.textSecondary : colors.primaryText }]}>
              {isFollowing ? "Following" : isRequested ? "Requested" : "Follow"}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    );
  }, [colors, followRunner, followingIds]);

  const renderPost = useCallback(({ item }: { item: SocialPost }) => (
    <ConnectionCard
      post={item}
      colors={colors}
      isLiking={likingPostIds.has(item.id)}
      onLike={() => void handleLike(item)}
      onComments={() => void openComments(item)}
      onDetails={() => Alert.alert(
        "Workout details",
        `${item.activity.activity_type || "Run"}\n${formatDistance(item.activity.distance_km)} · ${formatDuration(item.activity.moving_time)}\nPace ${formatPace(item.activity.avg_pace)}`,
      )}
      onShare={() => {
        const description = `${item.author.full_name || item.author.username}'s ${formatDistance(item.activity.distance_km)} workout`;
        void Share.share({ message: item.share_url ? `${description}\n${item.share_url}` : description });
      }}
    />
  ), [colors, handleLike, likingPostIds, openComments]);

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
              accessibilityLabel="Find runners"
              onPress={() => {
                setSearchLoading(true);
                setFindRunnersVisible(true);
              }}
              style={[styles.findButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              <Feather name="user-plus" size={21} color={colors.primary} />
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
        visible={commentPost !== null}
        animationType="slide"
        onRequestClose={() => setCommentPost(null)}
      >
        <SafeAreaView edges={["top", "left", "right", "bottom"]} style={[styles.modalScreen, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close comments" onPress={() => setCommentPost(null)} style={styles.modalBack}>
              <Feather name="chevron-left" size={25} color={colors.text} />
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Comments</Text>
            <View style={styles.modalBack} />
          </View>
          {commentsLoading ? <ActivityIndicator style={styles.searchLoader} color={colors.primary} /> : null}
          <FlatList
            data={comments}
            keyExtractor={(item) => String(item.id)}
            contentContainerStyle={styles.commentList}
            renderItem={({ item }) => (
              <View style={styles.commentRow}>
                <Avatar name={item.author.full_name || item.author.username} imageUrl={item.author.avatar_url || undefined} size={34} />
                <View style={[styles.commentBubble, { backgroundColor: colors.surface }]}>
                  <Text style={[styles.commentAuthor, { color: colors.text }]}>{item.author.full_name || item.author.username}</Text>
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
        </SafeAreaView>
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
  postCard: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 18, padding: 12, marginBottom: 14 },
  postHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  authorInfo: { flex: 1, minWidth: 0 },
  authorName: { fontSize: 14, fontWeight: "700" },
  username: { fontSize: 12, marginTop: 2 },
  postTime: { fontSize: 11 },
  workoutCard: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, padding: 12 },
  workoutHeading: { flexDirection: "row", alignItems: "center", gap: 8 },
  workoutType: { fontSize: 15, fontWeight: "700", flex: 1 },
  distance: { fontSize: 15, fontWeight: "800" },
  metrics: { flexDirection: "row", gap: 14, marginTop: 8 },
  metric: { flexDirection: "row", alignItems: "center", gap: 5 },
  metricText: { fontSize: 11 },
  caption: { fontSize: 13, lineHeight: 18, marginTop: 10 },
  postActions: { minHeight: 40, flexDirection: "row", alignItems: "center", gap: 12, borderTopWidth: StyleSheet.hairlineWidth, marginTop: 10, paddingTop: 8 },
  actionButton: { minHeight: 30, flexDirection: "row", alignItems: "center", gap: 5 },
  actionCount: { fontSize: 12 },
  actionLink: { minHeight: 30, justifyContent: "center" },
  actionLinkText: { fontSize: 11, fontWeight: "500" },
  shareButton: { flexDirection: "row", alignItems: "center", gap: 5, marginLeft: "auto" },
  emptyState: { flex: 1, minHeight: 310, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 },
  emptyTitle: { fontSize: 17, fontWeight: "700", marginTop: 14, textAlign: "center" },
  emptyCopy: { fontSize: 13, lineHeight: 19, textAlign: "center", marginTop: 8, paddingHorizontal: 12 },
  primaryButton: { minHeight: 42, borderRadius: 22, paddingHorizontal: 20, alignItems: "center", justifyContent: "center", marginTop: 18 },
  primaryButtonText: { fontSize: 14, fontWeight: "700" },
  retryButton: { padding: 12 },
  feedFooter: { height: 92 },
  modalScreen: { flex: 1 },
  modalHeader: { height: 54, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12 },
  modalBack: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  modalTitle: { fontSize: 17, fontWeight: "700" },
  searchBox: { minHeight: 44, marginHorizontal: 16, marginTop: 14, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 8 },
  searchInput: { flex: 1, minHeight: 42, fontSize: 14 },
  searchSectionTitle: { fontSize: 10, fontWeight: "700", letterSpacing: 0.8, marginHorizontal: 18, marginTop: 20, marginBottom: 4 },
  searchLoader: { margin: 18 },
  runnerList: { paddingHorizontal: 16, paddingBottom: 24 },
  runnerRow: { minHeight: 70, flexDirection: "row", alignItems: "center", gap: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  runnerInfo: { flex: 1, minWidth: 0 },
  mutualText: { fontSize: 10, marginTop: 3 },
  followButton: { minWidth: 78, minHeight: 34, borderRadius: 17, paddingHorizontal: 12, alignItems: "center", justifyContent: "center" },
  followButtonText: { fontSize: 12, fontWeight: "700" },
  commentList: { padding: 16, flexGrow: 1 },
  commentRow: { flexDirection: "row", alignItems: "flex-start", gap: 9, marginBottom: 12 },
  commentBubble: { flex: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 9 },
  commentAuthor: { fontSize: 12, fontWeight: "700" },
  commentBody: { fontSize: 13, lineHeight: 18, marginTop: 3 },
  commentComposer: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, paddingTop: 10, flexDirection: "row", alignItems: "flex-end", gap: 8 },
  commentInput: { flex: 1, minHeight: 40, maxHeight: 100, borderWidth: StyleSheet.hairlineWidth, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 9, fontSize: 14 },
  sendButton: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
});
