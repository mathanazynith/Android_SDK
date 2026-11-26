import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
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
  type AlertButton,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Avatar } from "../../../components/Avatar";
import { RunningLoader } from "../../../components/common/RunningLoader";
import { FeedPostCard, formatDistance, sortSocialPosts } from "../../../components/social/FeedPostCard";
import { PostCommentsModal, PostDetailsModal } from "../../../components/social/PostInteractionModals";
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
} from "../../../src/services/socialApi";
import { publishSocialPostDeleted, publishSocialPostPatch, subscribeToSocialPostChanges } from "../../../src/services/socialPostEvents";

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

export default function RunnerProfileScreen() {
  const { colors } = useTheme();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const { user } = useAuth();
  const { id, selfProfile } = useLocalSearchParams<{ id: string; selfProfile?: string }>();
  const userId = Number(id);
  const profileLoadRequestId = useRef(0);
  const [profile, setProfile] = useState<ConnectionProfile | null>(null);
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
  const [reportTarget, setReportTarget] = useState<{ type: ContentReportTargetType; id: number } | null>(null);
  const [reportReason, setReportReason] = useState<ContentReportReason | null>(null);
  const [reportDetails, setReportDetails] = useState("");
  const [reportBusy, setReportBusy] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [postActionBusy, setPostActionBusy] = useState(false);
  const [, setRelativeTimeTick] = useState(0);
  const isOwnProfile = profile !== null && user?.id != null && String(profile.id) === String(user.id);
  const isSelfProfileTabView = isOwnProfile && selfProfile === '1';

  useEffect(() => {
    const timer = setInterval(() => setRelativeTimeTick((tick) => tick + 1), 60_000);
    return () => clearInterval(timer);
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
      setProfile(profileResponse.data.data);
      const page = postsResponse.data.data;
      setPosts(appendUniquePosts([], postsForUser(extractApiResults<SocialPost>(postsResponse.data), userId)
        .map((post) => ({ ...post, is_mine: String(user?.id ?? "") === String(post.author.id) }))));
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
    if (post.is_mine) {
      Alert.alert("Sharing unavailable", "You can share your own workout using its audience setting.");
      return;
    }
    if (!post.share_url) {
      try {
        await socialAPI.sharePost(post.id, "EXTERNAL");
        Alert.alert("Sharing unavailable", "This workout does not have an external share link.");
      } catch (shareError) {
        Alert.alert("Unable to share post", getBackendErrorMessage(shareError));
      }
      return;
    }
    const description = `${post.author.full_name || post.author.username}'s ${formatDistance(post.activity.distance_km)} workout`;
    try {
      const result = await Share.share({ message: `${description}\n${post.share_url}` });
      if (result.action !== Share.sharedAction) return;
      const response = await socialAPI.sharePost(post.id, "EXTERNAL");
      patchPost(post.id, { share_count: response.data.data.share_count });
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
    setReportTarget({ type, id });
    setReportReason(null);
    setReportDetails("");
    setReportError(null);
  }, []);

  const submitReport = useCallback(async () => {
    if (!reportTarget || !reportReason || reportBusy) return;
    setReportBusy(true);
    setReportError(null);
    try {
      await socialAPI.reportContent({
        target_type: reportTarget.type,
        target_id: reportTarget.id,
        reason: reportReason,
        ...(reportDetails.trim() ? { details: reportDetails.trim() } : {}),
      });
      setReportTarget(null);
      Alert.alert("Report sent", "Thanks. Your report was sent privately to the moderation team.");
    } catch (submitError) {
      setReportError(getBackendErrorMessage(submitError, "Unable to send this report."));
    } finally {
      setReportBusy(false);
    }
  }, [reportBusy, reportDetails, reportReason, reportTarget]);

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
        <Text style={[styles.pageTitle, { color: colors.text }]}>{isSelfProfileTabView ? 'Profile' : 'Runner'}</Text>
        {isSelfProfileTabView ? (
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Info" onPress={() => router.push('/(app)/profile/info')} style={styles.infoButton}>
            <MaterialCommunityIcons name="account-circle-outline" size={21} color={colors.primary} />
            <Text style={[styles.infoButtonText, { color: colors.primary }]}>Info</Text>
          </TouchableOpacity>
        ) : <View style={[styles.iconButton, styles.topBarTrailing]} />}
      </View>
      {profile ? (
        <View style={[styles.profileCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.profileSummaryTopRow}>
            <Avatar name={profile.full_name || profile.username} imageUrl={profile.avatar_url || undefined} size={72} />
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
          <View style={styles.profileIdentityText}>
            <Text numberOfLines={2} style={[styles.name, { color: colors.text }]}>{profile.full_name || profile.username}</Text>
            <Text numberOfLines={1} style={[styles.username, { color: colors.textSecondary }]}>@{profile.username}</Text>
            {profile.is_private ? <View style={styles.privateBadge}><Feather name="lock" size={12} color={colors.textSecondary} /><Text style={[styles.privateText, { color: colors.textSecondary }]}>Private account</Text></View> : null}
          </View>
          {user?.id != null && String(profile.id) !== String(user.id) ? (
            <TouchableOpacity accessibilityRole="button" disabled={actionBusy} onPress={confirmBlock} style={[styles.blockButton, { borderColor: colors.border }]}>
              {actionBusy ? <ActivityIndicator size="small" color={colors.primary} /> : <Feather name={profile.is_blocked_by_me ? "user-check" : "user-x"} size={15} color={profile.is_blocked_by_me ? colors.primary : "#E5484D"} />}
              <Text style={[styles.blockButtonText, { color: profile.is_blocked_by_me ? colors.primary : "#E5484D" }]}>{profile.is_blocked_by_me ? "Unblock runner" : "Block runner"}</Text>
            </TouchableOpacity>
          ) : null}
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
      {profile && !profile.can_view_details ? (
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
      onDetails={() => setDetailsPost(item)}
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
  ), [colors, handleLike, isSelfProfileTabView, likingPostIds, openComments, openPostOptions, sharePost]);

  const canShowContent = !profile || profile.can_view_details;
  return (
    <SafeAreaView edges={["top", "left", "right"]} style={[styles.screen, { backgroundColor: colors.background }]}>
      {loading ? <View style={styles.center}><RunningLoader size={64} label="Loading profile..." /></View> : (
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
      )}
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
      <Modal visible={reportTarget !== null} transparent animationType="fade" onRequestClose={() => setReportTarget(null)}>
        <View style={styles.reportOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setReportTarget(null)} accessibilityLabel="Close report" />
          <View style={[styles.reportCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.reportTitle, { color: colors.text }]}>Report {reportTarget?.type === "COMMENT" ? "comment" : "workout"}</Text>
            <Text style={[styles.reportHint, { color: colors.textSecondary }]}>Choose a reason to send this content to moderation.</Text>
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
  topBar: { minHeight: 52, flexDirection: "row", alignItems: "center", justifyContent: "flex-start" },
  pageTitle: { fontSize: 18, fontWeight: "800" },
  iconButton: { width: 38, height: 38, alignItems: "center", justifyContent: "center" },
  topBarTrailing: { marginLeft: "auto" },
  infoButton: { minWidth: 58, height: 38, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 4, marginLeft: "auto" },
  infoButtonText: { fontSize: 13, fontWeight: "700" },
  profileCard: { alignItems: "center", borderWidth: StyleSheet.hairlineWidth, borderRadius: 18, padding: 14, marginTop: 6 },
  profileSummaryTopRow: { width: "100%", flexDirection: "row", alignItems: "flex-start", gap: 10 },
  profileIdentityText: { width: "100%" },
  name: { fontSize: 16, fontWeight: "800", marginTop: 14 },
  username: { fontSize: 12, marginTop: 2 },
  privateBadge: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 8 },
  privateText: { fontSize: 11 },
  countRow: { flex: 1, flexDirection: "row", alignItems: "flex-start" },
  countButton: { flex: 1, minWidth: 0, alignItems: "center", paddingVertical: 2 },
  countValue: { fontSize: 16, fontWeight: "800" },
  countLabel: { fontSize: 11, marginTop: 2 },
  blockButton: { minHeight: 36, flexDirection: "row", alignItems: "center", gap: 7, borderWidth: StyleSheet.hairlineWidth, borderRadius: 18, paddingHorizontal: 13, marginTop: 15 },
  blockButtonText: { fontSize: 12, fontWeight: "700" },
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
