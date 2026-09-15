import type { Member, MemberPost, PostIssue, PostType, RegionPost } from '@prisma/client';
import { mediaPublicUrl, streamThumbnailUrl, streamVideoId } from '../../lib/storage.js';
import { actorRank, labelOf, primaryPost, rankOf } from '../admin/admin.posts.js';

const postSelect = {
  post: true,
  isPrimary: true,
  endedAt: true,
} as const;

export const authorSelect = {
  id: true,
  fullName: true,
  mobileE164: true,
  isSuperAdmin: true,
  posts: { where: { endedAt: null }, select: postSelect },
} as const;

export const assigneeSelect = {
  id: true,
  fullName: true,
  isSuperAdmin: true,
  posts: { where: { endedAt: null }, select: postSelect },
} as const;

export const postInclude = {
  author: { select: authorSelect },
  assignedTo: { select: assigneeSelect },
  assignedBy: { select: { id: true, fullName: true } },
  resolvedBy: { select: { id: true, fullName: true } },
  issue: true,
  subIssue: true,
} as const;

type AuthorRow = Pick<Member, 'id' | 'fullName' | 'mobileE164' | 'isSuperAdmin'> & {
  posts: Pick<MemberPost, 'post' | 'isPrimary' | 'endedAt'>[];
};

type AssigneeRow = Pick<Member, 'id' | 'fullName' | 'isSuperAdmin'> & {
  posts: Pick<MemberPost, 'post' | 'isPrimary' | 'endedAt'>[];
};

export type RegionPostRow = RegionPost & {
  author: AuthorRow;
  issue: PostIssue;
  subIssue?: PostIssue | null;
  assignedTo?: AssigneeRow | null;
  assignedBy?: Pick<Member, 'id' | 'fullName'> | null;
  resolvedBy?: Pick<Member, 'id' | 'fullName'> | null;
};

export function viewerRankOf(member: Pick<Member, 'isSuperAdmin'>, post?: PostType | string | null) {
  if (member.isSuperAdmin) return 1000;
  return rankOf(post);
}

export function canSeePostAuthor(viewer: Pick<Member, 'id' | 'isSuperAdmin'>, viewerRank: number, author: AuthorRow) {
  if (viewer.id === author.id) return true;
  return viewerRank > actorRank(author, author.posts);
}

export function canAssignPostIssue(viewer: Pick<Member, 'id' | 'isSuperAdmin'>, viewerRank: number, author: AuthorRow) {
  if (viewer.id === author.id) return false;
  return viewerRank > actorRank(author, author.posts);
}

export function isMemberAuthor(author: AuthorRow) {
  return actorRank(author, author.posts) <= rankOf('MEMBER');
}

export function canResolvePostIssue(viewer: Pick<Member, 'id' | 'isSuperAdmin'>, viewerRank: number, author: AuthorRow) {
  if (viewer.id === author.id) return false;
  if (!isMemberAuthor(author)) return false;
  return viewerRank > actorRank(author, author.posts);
}

export function canSummariseGrievancePost(
  viewer: Pick<Member, 'id' | 'isSuperAdmin'>,
  viewerRank: number,
  post: Pick<RegionPost, 'status'> & { author: AuthorRow },
) {
  if (post.status !== 'OPEN') return false;
  if (!isMemberAuthor(post.author)) return false;
  return canAssignPostIssue(viewer, viewerRank, post.author);
}

export function canSeeResolveSection(viewer: Pick<Member, 'id' | 'isSuperAdmin'>, viewerRank: number, author: AuthorRow) {
  if (!isMemberAuthor(author)) return false;
  return viewer.id === author.id || canResolvePostIssue(viewer, viewerRank, author);
}

function serializeIssue(issue: PostIssue) {
  return {
    id: issue.id,
    code: issue.code,
    name: issue.name,
    nameHi: issue.nameHi,
    nameBho: issue.nameBho,
    priority: issue.priority,
    band: issue.band,
    reason: issue.reason,
  };
}

export function serializePost(
  post: RegionPostRow,
  viewer: Pick<Member, 'id' | 'isSuperAdmin'>,
  viewerPost?: PostType | string | null,
) {
  const type = post.mediaType.toLowerCase();
  const hasMedia = Boolean(post.mediaKey);
  const mediaUrl = hasMedia ? mediaPublicUrl(post.mediaKey) : null;
  const videoId = streamVideoId(post.mediaKey);
  const thumbnailUrl = post.thumbnailKey
    ? mediaPublicUrl(post.thumbnailKey)
    : videoId
      ? streamThumbnailUrl(videoId)
      : null;
  const issue = serializeIssue(post.issue);
  const subIssue = post.subIssue ? serializeIssue(post.subIssue) : null;
  const viewerRank = viewerRankOf(viewer, viewerPost);
  const seeAuthor = canSeePostAuthor(viewer, viewerRank, post.author);
  const isAuthor = viewer.id === post.author.id;
  const isAssignee = post.assignedToId === viewer.id;
  const seeAssignee = Boolean(post.assignedTo) && (isAuthor || isAssignee || seeAuthor);
  const assigneePost = post.assigneePost || (post.assignedTo ? primaryPost(post.assignedTo, post.assignedTo.posts) : null);
  return {
    id: post.clientUuid,
    serverId: post.id,
    clientUuid: post.clientUuid,
    description: post.description,
    mediaType: type,
    mediaKey: hasMedia ? post.mediaKey : null,
    videoId,
    mediaUrl,
    mediaPath: mediaUrl,
    thumbnailKey: post.thumbnailKey,
    thumbnailUrl,
    thumbnailPath: thumbnailUrl,
    pending: false,
    createdAt: post.createdAt.toISOString(),
    latitude: post.latitude == null ? null : Number(post.latitude),
    longitude: post.longitude == null ? null : Number(post.longitude),
    authorId: post.authorId,
    authorName: seeAuthor ? post.author.fullName : null,
    authorMobile: seeAuthor ? post.author.mobileE164 : null,
    authorPost: seeAuthor ? primaryPost(post.author, post.author.posts) : null,
    canSeeAuthor: seeAuthor,
    canAssign: canAssignPostIssue(viewer, viewerRank, post.author),
    canResolve: canResolvePostIssue(viewer, viewerRank, post.author),
    canSummarise: canSummariseGrievancePost(viewer, viewerRank, post),
    showResolve: canSeeResolveSection(viewer, viewerRank, post.author),
    status: post.status,
    resolvedAt: post.resolvedAt ? post.resolvedAt.toISOString() : null,
    resolvedById: post.resolvedById,
    resolvedByName: post.resolvedBy?.fullName ?? null,
    assignedToId: seeAssignee ? post.assignedToId : null,
    assigneeName: seeAssignee ? post.assignedTo?.fullName ?? null : null,
    assigneePost: seeAssignee ? assigneePost : null,
    assigneePostLabel: seeAssignee ? labelOf(assigneePost) : null,
    assignedAt: seeAssignee && post.assignedAt ? post.assignedAt.toISOString() : null,
    districtId: post.districtId,
    assemblyId: post.assemblyId,
    boothId: post.boothId,
    regionLabel: post.regionLabel,
    issueId: issue.id,
    issueCode: issue.code,
    issueName: issue.name,
    issueNameHi: issue.nameHi,
    issueNameBho: issue.nameBho,
    issuePriority: issue.priority,
    issueBand: issue.band,
    issue,
    subIssueId: subIssue?.id ?? null,
    subIssueCode: subIssue?.code ?? null,
    subIssueName: subIssue?.name ?? null,
    subIssueNameHi: subIssue?.nameHi ?? null,
    subIssueNameBho: subIssue?.nameBho ?? null,
    subIssue,
  };
}
