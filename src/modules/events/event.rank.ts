import type { PostType } from '@prisma/client';

export type EventViewer = {
  id: string;
  isSuperAdmin?: boolean | null;
  stateId?: string | null;
  districtId?: string | null;
  assemblyId?: string | null;
};

export const EVENT_POST_RANK: Record<string, number> = {
  SUPER_ADMIN: 1000,
  NATIONAL_PRESIDENT: 100,
  NATIONAL_GENERAL_SECRETARY: 95,
  STATE_PRESIDENT: 90,
  STATE_GENERAL_SECRETARY: 85,
  REGIONAL_PRESIDENT: 80,
  DISTRICT_PRESIDENT: 70,
  DISTRICT_GENERAL_SECRETARY: 65,
  DISTRICT_SECRETARY: 60,
  ASSEMBLY_IN_CHARGE: 50,
  MANDAL_PRESIDENT: 40,
  BOOTH_ADHYAKSH: 30,
  PANNA_PRAMUKH: 20,
  MEMBER: 10,
};

export function eventRankOf(post?: string | null): number {
  if (!post) return 10;
  return EVENT_POST_RANK[post] ?? 10;
}

export function actorEventRank(member: Pick<EventViewer, 'isSuperAdmin'>, post?: PostType | string | null): number {
  if (member.isSuperAdmin) return 1000;
  return eventRankOf(post);
}

export function canCreateOrgEvent(member: Pick<EventViewer, 'isSuperAdmin'>, post?: PostType | string | null) {
  return actorEventRank(member, post) > 10;
}

export function sameRegion(event: { stateId?: string | null; districtId?: string | null; assemblyId?: string | null }, viewer: Pick<EventViewer, 'stateId' | 'districtId' | 'assemblyId'>) {
  if (event.stateId && event.stateId !== viewer.stateId) return false;
  if (event.districtId && event.districtId !== viewer.districtId) return false;
  if (event.assemblyId && event.assemblyId !== viewer.assemblyId) return false;
  return true;
}

export function canSeeOrgEvent(
  event: { hostId: string; hostRank: number; stateId?: string | null; districtId?: string | null; assemblyId?: string | null },
  viewer: EventViewer,
  viewerRank: number,
) {
  if (viewer.isSuperAdmin) return true;
  if (event.hostId === viewer.id) return true;
  return event.hostRank > viewerRank && sameRegion(event, viewer);
}
