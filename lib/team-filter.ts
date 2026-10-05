type Param = string | string[] | undefined

export type TeamFilter = { host: string; role: string; unknownHost: boolean; unknownRole: boolean }

// A repeated query param (?host=a&host=b) arrives as an array at runtime even though the page types it as a string.
const first = (value: Param) => (Array.isArray(value) ? value[0] : value) ?? ''

/** Reads the host and role filters and flags values that match no team member (a stale or mistyped link). */
export function resolveTeamFilter(
  params: { host?: Param; role?: Param },
  stats: readonly { member_id: string; role: string }[],
): TeamFilter {
  const host = first(params.host)
  const role = first(params.role)
  return {
    host,
    role,
    unknownHost: host !== '' && !stats.some((member) => member.member_id === host),
    unknownRole: role !== '' && !stats.some((member) => member.role === role),
  }
}

export function filterMeetings<M extends { host_id: string; host: { role: string } | null }>(
  meetings: readonly M[],
  filter: Pick<TeamFilter, 'host' | 'role'>,
): M[] {
  return meetings.filter((meeting) =>
    (!filter.host || meeting.host_id === filter.host) && (!filter.role || meeting.host?.role === filter.role))
}

export function unknownFilterMessage({ unknownHost, unknownRole }: TeamFilter): string | null {
  if (unknownHost && unknownRole) return 'No team member matches that host or role.'
  if (unknownHost) return 'No team member matches that host.'
  if (unknownRole) return 'No team member has that role.'
  return null
}
