/**
 * channelMemberCache.ts
 *
 * In-memory cache: channelId → Set<userId>
 *
 * Purpose: Eliminate prisma.channelMember.findMany() DB call on every
 * message:send. This was causing 200-500ms extra latency per message.
 *
 * Cache is warmed up on channel:join_all (user connect) and kept updated
 * when new DM channels are created.
 */

const cache = new Map<string, Set<string>>();

/** Add a userId to a channel's member set */
export function cacheAddMember(channelId: string, userId: string): void {
  if (!cache.has(channelId)) {
    cache.set(channelId, new Set());
  }
  cache.get(channelId)!.add(userId);
}

/** Set all members for a channel (replaces existing) */
export function cacheSetMembers(channelId: string, userIds: string[]): void {
  cache.set(channelId, new Set(userIds));
}

/** Get cached members for a channel (returns null if not cached) */
export function cacheGetMembers(channelId: string): string[] | null {
  const set = cache.get(channelId);
  if (!set || set.size === 0) return null;
  return Array.from(set);
}

/** Remove a userId from all their channels when they leave */
export function cacheRemoveMember(channelId: string, userId: string): void {
  cache.get(channelId)?.delete(userId);
}

/** Check if a channel is cached */
export function cacheHasChannel(channelId: string): boolean {
  return cache.has(channelId) && (cache.get(channelId)?.size ?? 0) > 0;
}
