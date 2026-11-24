import api from "../../service/api";
import { storage } from "../../service/storage";

const ONLY_ME_DEFAULT_AUDIENCE_KEY = "social_default_audience_only_me";

const getOnlyMePreferenceKey = async () => {
  try {
    const rawUser = await storage.getItem(storage.KEYS.USER);
    const user = rawUser ? JSON.parse(rawUser) as { id?: string | number } : null;
    return `${ONLY_ME_DEFAULT_AUDIENCE_KEY}_${user?.id ?? "anonymous"}`;
  } catch {
    return `${ONLY_ME_DEFAULT_AUDIENCE_KEY}_anonymous`;
  }
};

export const getOnlyMeDefaultAudience = async () => {
  try {
    return (await storage.getItem(await getOnlyMePreferenceKey())) === "true";
  } catch {
    return false;
  }
};

export const setOnlyMeDefaultAudience = async (enabled: boolean) => (
  storage.setItem(await getOnlyMePreferenceKey(), enabled ? "true" : "false")
);

export interface ApiEnvelope<T> {
  success: boolean;
  message?: string;
  data: T;
}

export interface ConnectionUser {
  id: number;
  username: string;
  full_name: string;
  avatar_url: string | null;
  relationship?: "NONE" | "FOLLOWING" | "REQUESTED" | string;
  follows_you?: boolean;
  mutual_count?: number;
}

export interface SocialActivity {
  id: number;
  activity_type: string;
  start_time: string;
  distance_km: number;
  moving_time: number;
  elapsed_time: number;
  avg_pace: number;
  avg_speed: number;
  calories: number;
  elevation_gain: number;
  encoded_polyline: string | null;
}

export interface SocialPost {
  id: number;
  author: ConnectionUser;
  activity: SocialActivity;
  caption: string;
  visibility: "ALL" | "FOLLOWERS" | "NONE" | string;
  like_count: number;
  comment_count: number;
  share_count: number;
  liked_by_me: boolean;
  is_mine: boolean;
  share_url: string | null;
  comments_enabled: boolean;
  hide_map: boolean;
  created_at: string;
}

export interface Page<T> {
  results: T[];
  next?: string | null;
  next_cursor?: string | null;
  has_more?: boolean;
}

export interface PrivacySettings {
  is_private: boolean;
  followers_count?: number;
  following_count?: number;
}

export interface SharingSettings {
  default_audience: "ALL" | "FOLLOWERS" | "ONLY_ME" | "NONE";
  is_private: boolean;
}

export interface RoutePrivacySettings {
  hide_radius_m: number | null;
  effective_hide_radius_m: number;
  hide_map: boolean;
  zones_count: number;
}

export interface PrivacyZone {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  radius_m: number;
  created_at: string;
}

export interface SocialComment {
  id: number;
  post_id: number;
  parent_id: number | null;
  author: ConnectionUser;
  body: string;
  like_count: number;
  reply_count: number;
  liked_by_me: boolean;
  can_delete: boolean;
  created_at: string;
}

export type ContentReportTargetType = "POST" | "COMMENT" | "USER";
export type ContentReportReason = "SPAM" | "HARASSMENT" | "HATE" | "INAPPROPRIATE" | "DANGEROUS" | "IMPERSONATION" | "OTHER";
export type SocialPostVisibility = "PUBLIC" | "FOLLOWERS" | "ONLY_ME";
export type ActivityShareAudience = "ALL" | "FOLLOWERS" | "NONE";

export const extractApiResults = <T,>(payload: unknown): T[] => {
  const isRecord = (value: unknown): value is Record<string, unknown> => (
    typeof value === "object" && value !== null
  );

  let value = payload;
  if (isRecord(value) && "data" in value) value = value.data;
  if (isRecord(value) && "data" in value) value = value.data;
  if (Array.isArray(value)) return value as T[];
  if (isRecord(value) && Array.isArray(value.results)) return value.results as T[];

  throw new Error("The server response did not contain a results list.");
};

export const connectionsAPI = {
  getPrivacy: () =>
    api.get<ApiEnvelope<PrivacySettings>>("/connections/me/privacy/"),
  setPrivacy: (is_private: boolean) =>
    api.patch<ApiEnvelope<PrivacySettings>>("/connections/me/privacy/", { is_private }),
  getFollowRequests: () =>
    api.get<ApiEnvelope<Page<ConnectionUser>>>("/connections/requests/"),
  acceptFollowRequest: (userId: number) =>
    api.post<ApiEnvelope<Record<string, unknown>>>(`/connections/requests/${userId}/accept/`),
  declineFollowRequest: (userId: number) =>
    api.delete<ApiEnvelope<Record<string, unknown>>>(`/connections/requests/${userId}/`),
  getBlockedAccounts: () =>
    api.get<ApiEnvelope<Page<ConnectionUser>>>("/connections/blocked/"),
  blockAccount: (userId: number) =>
    api.post<ApiEnvelope<Record<string, unknown>>>(`/connections/users/${userId}/block/`),
  unblockAccount: (userId: number) =>
    api.delete<ApiEnvelope<Record<string, unknown>>>(`/connections/users/${userId}/block/`),
  getFollowers: () =>
    api.get<ApiEnvelope<Page<ConnectionUser>>>("/connections/me/followers/"),
  getFollowing: () =>
    api.get<ApiEnvelope<Page<ConnectionUser>>>("/connections/me/following/"),
  getSuggestions: () =>
    api.get<ApiEnvelope<{ results: ConnectionUser[] }>>("/connections/suggestions/"),
  search: (query: string) =>
    api.get<ApiEnvelope<{ results: ConnectionUser[] }>>("/connections/search/", {
      params: { q: query },
    }),
  follow: (userId: number) =>
    api.post<ApiEnvelope<{ relationship: ConnectionUser["relationship"] }>>(
      `/connections/users/${userId}/follow/`,
    ),
  unfollow: (userId: number) =>
    api.delete<ApiEnvelope<{ relationship: ConnectionUser["relationship"] }>>(
      `/connections/users/${userId}/follow/`,
    ),
};

export const socialAPI = {
  getFeed: (cursor?: string | null) =>
    api.get<ApiEnvelope<Page<SocialPost>>>("/social/feed/", {
      params: { limit: 20, ...(cursor ? { cursor } : {}) },
    }),
  getMyPosts: () => api.get<ApiEnvelope<Page<SocialPost>>>("/social/me/posts/"),
  deletePost: (postId: number) =>
    api.delete<ApiEnvelope<Record<string, unknown>>>(`/social/posts/${postId}/`),
  sharePost: (postId: number, channel: "USER" | "LINK" | "EXTERNAL", recipient_id?: number) =>
    api.post<ApiEnvelope<{ share_count: number; url: string | null; deep_link: string }>>(
      `/social/posts/${postId}/share/`,
      { channel, ...(recipient_id ? { recipient_id } : {}) },
    ),
  createWorkoutPost: (payload: { activity_id: number; visibility: SocialPostVisibility; caption?: string }) =>
    api.post<ApiEnvelope<SocialPost>>("/social/posts/", payload),
  updateWorkoutPost: (postId: number, payload: { visibility: SocialPostVisibility }) =>
    api.patch<ApiEnvelope<SocialPost>>(`/social/posts/${postId}/`, payload),
  setWorkoutPostAudience: (activityId: number, audience: ActivityShareAudience) =>
    api.put<ApiEnvelope<{ audience: ActivityShareAudience; post: SocialPost | null }>>(
      `/social/activities/${activityId}/share/`,
      { audience },
    ),
  reportContent: (payload: {
    target_type: ContentReportTargetType;
    target_id: number;
    reason: ContentReportReason;
    details?: string;
  }) => api.post<ApiEnvelope<Record<string, unknown>>>("/social/reports/", payload),
  likePost: (postId: number) =>
    api.post<ApiEnvelope<{ liked: boolean; like_count: number }>>(`/social/posts/${postId}/like/`),
  unlikePost: (postId: number) =>
    api.delete<ApiEnvelope<{ liked: boolean; like_count: number }>>(`/social/posts/${postId}/like/`),
  getComments: (postId: number) =>
    api.get<ApiEnvelope<Page<SocialComment>>>(`/social/posts/${postId}/comments/`),
  addComment: (postId: number, body: string) =>
    api.post<ApiEnvelope<SocialComment & { comment_count: number }>>(
      `/social/posts/${postId}/comments/`,
      { body },
    ),
  getSharingSettings: () =>
    api.get<ApiEnvelope<SharingSettings>>("/social/me/sharing/"),
  setDefaultAudience: (default_audience: Exclude<SharingSettings["default_audience"], "ONLY_ME">) =>
    api.patch<ApiEnvelope<SharingSettings>>("/social/me/sharing/", { default_audience }),
  getRoutePrivacy: () =>
    api.get<ApiEnvelope<RoutePrivacySettings>>("/social/me/route-privacy/"),
  setRoutePrivacy: (settings: Partial<Pick<RoutePrivacySettings, "hide_radius_m" | "hide_map">>) =>
    api.patch<ApiEnvelope<RoutePrivacySettings>>("/social/me/route-privacy/", settings),
  getPrivacyZones: () =>
    api.get<ApiEnvelope<{ results: PrivacyZone[] }>>("/social/me/privacy-zones/"),
  addPrivacyZone: (zone: Pick<PrivacyZone, "name" | "latitude" | "longitude" | "radius_m">) =>
    api.post<ApiEnvelope<PrivacyZone>>("/social/me/privacy-zones/", zone),
  deletePrivacyZone: (zoneId: number) =>
    api.delete<ApiEnvelope<Record<string, unknown>>>(`/social/me/privacy-zones/${zoneId}/`),
};

export const healthAPI = {
  live: () => api.get<{ status: string }>("/health/live/"),
  ready: () =>
    api.get<{ status: string; checks?: Record<string, string> }>("/health/ready/"),
};
