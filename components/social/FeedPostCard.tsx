import { Feather, FontAwesome } from "@expo/vector-icons";
import React, { useRef } from "react";
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Avatar } from "../Avatar";
import ActivityRouteMap from "../ActivityRouteMap";
import { useTheme } from "../../contexts/ThemeContext";
import type { SocialPost } from "../../src/services/socialApi";

export const sortSocialPosts = (posts: SocialPost[]) => [...posts].sort((first, second) => {
  const firstTime = new Date(first.created_at).getTime();
  const secondTime = new Date(second.created_at).getTime();
  return (Number.isFinite(secondTime) ? secondTime : 0) - (Number.isFinite(firstTime) ? firstTime : 0);
});

export const formatDistance = (distanceKm: number) => `${Number(distanceKm || 0).toFixed(2)} km`;

export const formatDuration = (seconds: number) => {
  const total = Math.max(0, Math.floor(seconds || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remainder = total % 60;
  return hours > 0
    ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
};

export const formatPace = (pace: number) => {
  if (!Number.isFinite(pace) || pace <= 0) return "--";
  const seconds = Math.round(pace);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}/km`;
};

export const formatRelativeTime = (value: string) => {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "";
  const elapsedMinutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000));
  if (elapsedMinutes < 1) return "just now";
  if (elapsedMinutes < 60) return `${elapsedMinutes} min ago`;
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return `${elapsedHours} ${elapsedHours === 1 ? "hour" : "hours"} ago`;
  const elapsedDays = Math.floor(elapsedHours / 24);
  if (elapsedDays < 7) return `${elapsedDays} ${elapsedDays === 1 ? "day" : "days"} ago`;
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(timestamp);
};

export function AnchoredMoreButton({
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

export function FeedPostCard({
  post,
  colors,
  isLiking,
  onLike,
  onComments,
  onDetails,
  onShare,
  onMore,
  onAuthorPress,
}: {
  post: SocialPost;
  colors: ReturnType<typeof useTheme>["colors"];
  isLiking: boolean;
  onLike: () => void;
  onComments: () => void;
  onDetails: () => void;
  onShare: () => void;
  onMore: (anchor: { x: number; y: number; width: number; height: number }) => void;
  onAuthorPress: () => void;
}) {
  const name = post.author.full_name || post.author.username;
  const distance = Number(post.activity?.distance_km);
  return (
    <View style={[styles.postCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.postHeader}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Open ${name}'s profile`} onPress={onAuthorPress}>
          <Avatar name={name} imageUrl={post.author.avatar_url || undefined} size={34} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.authorInfo} accessibilityRole="button" accessibilityLabel={`Open ${name}'s profile`} onPress={onAuthorPress}>
          <Text style={[styles.authorName, { color: colors.text }]} numberOfLines={1}>{name}</Text>
          <Text style={[styles.username, { color: colors.textSecondary }]} numberOfLines={1}>@{post.author.username}</Text>
        </TouchableOpacity>
        <Text style={[styles.postTime, { color: colors.textTertiary }]}>{formatRelativeTime(post.created_at)}</Text>
        {!post.is_mine && post.visibility === "ALL" && post.share_url ? (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Share workout"
            onPress={onShare}
            style={styles.topShareButton}
          >
            <Feather name="share" size={17} color={colors.primary} />
          </TouchableOpacity>
        ) : null}
        <AnchoredMoreButton
          label={post.is_mine ? "Post options" : "Workout options"}
          color={colors.textSecondary}
          style={styles.moreButton}
          onPress={onMore}
        />
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
            routeOnly
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
          <FontAwesome name={post.liked_by_me ? "heart" : "heart-o"} size={15} color={post.liked_by_me ? "#E5484D" : colors.text} />
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
        <View style={styles.shareCount}>
          <Feather name="share" size={13} color={colors.textTertiary} />
          <Text style={[styles.actionCount, { color: colors.text }]}>{post.share_count}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  postCard: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, padding: 10, marginBottom: 10 },
  postHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  authorInfo: { flex: 1, minWidth: 0 },
  authorName: { fontSize: 13, fontWeight: "700" },
  username: { fontSize: 10, marginTop: 1 },
  postTime: { fontSize: 10 },
  topShareButton: { width: 30, height: 30, alignItems: "center", justifyContent: "center" },
  moreButton: { minWidth: 28, minHeight: 30, alignItems: "center", justifyContent: "center" },
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
  shareCount: { flexDirection: "row", alignItems: "center", gap: 5, marginLeft: "auto" },
});
