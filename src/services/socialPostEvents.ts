import type { SocialPost } from "./socialApi";

type SocialPostChange =
  | { postId: number; patch: Partial<SocialPost> }
  | { postId: number; deleted: true };

type SocialPostListener = (change: SocialPostChange) => void;

const listeners = new Set<SocialPostListener>();

export const subscribeToSocialPostChanges = (listener: SocialPostListener) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const publishSocialPostPatch = (postId: number, patch: Partial<SocialPost>) => {
  const change: SocialPostChange = { postId, patch };
  listeners.forEach((listener) => listener(change));
};

export const publishSocialPostDeleted = (postId: number) => {
  const change: SocialPostChange = { postId, deleted: true };
  listeners.forEach((listener) => listener(change));
};
