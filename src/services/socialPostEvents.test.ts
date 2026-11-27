import { describe, expect, it } from "vitest";
import {
  publishSocialPostDeleted,
  publishSocialPostPatch,
  subscribeToSocialPostChanges,
} from "./socialPostEvents";

describe("social post change notifications", () => {
  it("broadcasts updates and deletions only to active subscribers", () => {
    const changes: unknown[] = [];
    const unsubscribe = subscribeToSocialPostChanges((change) => changes.push(change));

    publishSocialPostPatch(42, { liked_by_me: true, like_count: 7 });
    publishSocialPostDeleted(42);
    unsubscribe();
    publishSocialPostPatch(42, { comment_count: 3 });

    expect(changes).toEqual([
      { postId: 42, patch: { liked_by_me: true, like_count: 7 } },
      { postId: 42, deleted: true },
    ]);
  });
});
