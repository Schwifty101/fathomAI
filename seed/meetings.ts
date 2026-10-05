import { memberBySlug, TEAM } from './team'

export type External = { name: string; role: string }
export type MeetingDef = {
  slug: string
  title: string
  kind: 'sales' | 'standup' | 'one_on_one' | 'interview' | 'postmortem' | 'design_review' | 'planning'
  platform: 'zoom' | 'meet' | 'teams'
  daysAgo: number
  hourUtc: number
  host: string
  internal: string[]
  externals: External[]
  targetMin: number
  topic: string
  showcase?: boolean
}

export const SEED_ANCHOR = Date.UTC(2026, 9, 5) // 2026-10-05

export const startedAt = (d: MeetingDef) =>
  new Date(SEED_ANCHOR - d.daysAgo * 86_400_000 + d.hourUtc * 3_600_000)

export type CastMember = { name: string; role: string; is_internal: boolean; member?: string }

export function castOf(d: MeetingDef): CastMember[] {
  const inside = d.internal.map((slug) => {
    const m = memberBySlug.get(slug)
    if (!m) throw new Error(`unknown member "${slug}" in ${d.slug}`)
    return { name: m.name, role: m.role, is_internal: true, member: slug }
  })
  return [...inside, ...d.externals.map((e) => ({ ...e, is_internal: false }))]
}

export const MEETINGS: MeetingDef[] = [
  {
    slug: 'q4-planning', title: 'Q4 Product Planning', kind: 'planning', platform: 'zoom',
    daysAgo: 4, hourUtc: 15, host: 'priya',
    internal: ['priya', 'daniel', 'mei', 'jonas', 'amara', 'lucas', 'hannah', 'omar'],
    externals: [], targetMin: 62, showcase: true,
    topic: 'Q4 planning for Kestrel Dispatch. Review Q3 results (churn 4.1%, ETA accuracy 82%, new customers take 19 days to onboard), choose the three Q4 bets (driver mobile app v2, an ETA-accuracy model, self-serve onboarding), size engineering capacity, agree budget and two hires, align launch marketing, and name risks and owners. The team disagrees about whether to cut self-serve onboarding to protect the mobile app.',
  },
  {
    slug: 'acme-discovery', title: 'Discovery Call // Acme Freight', kind: 'sales', platform: 'meet',
    daysAgo: 7, hourUtc: 16, host: 'daniel', internal: ['daniel', 'priya'],
    externals: [
      { name: 'Elena Voss', role: 'VP Operations, Acme Freight' },
      { name: 'Tom Brandt', role: 'Dispatch Manager, Acme Freight' },
    ],
    targetMin: 20,
    topic: 'Discovery call with Acme Freight, a 140-truck regional carrier that dispatches with spreadsheets and phone calls. Pain: late deliveries, idle drivers, no live ETAs for their customers. They are evaluating two competitors. Budget of roughly $60k a year is approved, decision due by end of next month, a security review is required, and Tom objects that migrating their data will be painful.',
  },
  {
    slug: 'eng-standup', title: 'Engineering Standup', kind: 'standup', platform: 'zoom',
    daysAgo: 3, hourUtc: 9, host: 'mei', internal: ['mei', 'lucas', 'jonas', 'amara'],
    externals: [], targetMin: 15,
    topic: 'Daily engineering standup. Each person says what they did yesterday, what they will do today and what blocks them. Topics: the ETA model retraining pipeline, a driver-app crash on Android 14, a design handoff waiting on review, and a customer escalation from support.',
  },
  {
    slug: 'priya-mei-1on1', title: 'Priya / Mei 1:1', kind: 'one_on_one', platform: 'meet',
    daysAgo: 5, hourUtc: 14, host: 'priya', internal: ['priya', 'mei'],
    externals: [], targetMin: 15,
    topic: 'A 1:1 between Priya (Product Lead) and Mei (Engineering Manager): workload and burnout on the platform team, worry about Q4 scope, hiring two backend engineers, Mei growing toward a director role, and feedback on how product and engineering plan together.',
  },
  {
    slug: 'harbor-interview', title: 'Customer Interview // Harbor Logistics', kind: 'interview', platform: 'zoom',
    daysAgo: 10, hourUtc: 17, host: 'amara', internal: ['amara'],
    externals: [{ name: 'Rafael Mendes', role: 'Operations Manager, Harbor Logistics' }],
    targetMin: 20,
    topic: 'Customer interview with Harbor Logistics about how they use Kestrel Dispatch: their daily workflow, what they love (the live map, auto-assign), frustrations (clunky bulk import, slow reports), what they would pay more for (proactive delay alerts), competitor mentions, and a request for an API.',
  },
  {
    slug: 'optimizer-outage-postmortem', title: 'Route Optimizer Outage Postmortem', kind: 'postmortem', platform: 'teams',
    daysAgo: 11, hourUtc: 13, host: 'mei', internal: ['mei', 'lucas', 'jonas', 'amara', 'omar'],
    externals: [], targetMin: 25,
    topic: 'Blameless postmortem of a 52-minute outage of the route optimizer last Tuesday: a deploy changed a database index, a nightly job locked tables, and dispatchers saw empty routes. Cover the timeline, the detection gap (alerts fired late), customer impact (31 customers), what went well, the root cause, and action items on alert thresholds, deploy checklists and status-page communication.',
  },
  {
    slug: 'mobile-design-review', title: 'Mobile App Design Review', kind: 'design_review', platform: 'meet',
    daysAgo: 14, hourUtc: 18, host: 'priya', internal: ['priya', 'jonas', 'mei', 'hannah'],
    externals: [], targetMin: 25,
    topic: 'Design review of the Kestrel driver mobile app v2: the onboarding flow, the new stop-list screen, offline-mode behavior, accessibility contrast issues, push notification copy, and an argument about swipe-to-complete versus a confirm button.',
  },
  {
    slug: 'weekly-product-sync', title: 'Weekly Product Sync', kind: 'planning', platform: 'zoom',
    daysAgo: 6, hourUtc: 10, host: 'priya', internal: ['priya', 'daniel', 'amara', 'lucas'],
    externals: [], targetMin: 15,
    topic: 'Weekly product sync: top feature requests from customers, pipeline feedback from sales, support ticket trends, and what to prioritize before the next planning cycle.',
  },
]

export function validateDefs(defs: readonly MeetingDef[] = MEETINGS): string[] {
  const errs: string[] = []
  const slugs = new Set<string>()
  if (TEAM.filter((m) => m.demo).length !== 1) errs.push('team must have exactly one demo persona')
  for (const d of defs) {
    if (slugs.has(d.slug)) errs.push(`duplicate slug ${d.slug}`)
    slugs.add(d.slug)
    if (!d.internal.includes(d.host)) errs.push(`${d.slug}: host must be in internal`)
    const unknown = d.internal.filter((s) => !memberBySlug.has(s))
    for (const s of unknown) errs.push(`${d.slug}: unknown member ${s}`)
    const t = startedAt(d).getTime()
    if (t >= SEED_ANCHOR) errs.push(`${d.slug}: must start before the anchor`)
    if (SEED_ANCHOR - t >= 21 * 86_400_000) errs.push(`${d.slug}: must start within the three weeks before the anchor`)
    if ([0, 6].includes(new Date(t).getUTCDay())) errs.push(`${d.slug}: must start on a weekday`)
    if (unknown.length) continue
    const names = castOf(d).map((c) => c.name)
    if (new Set(names).size !== names.length) errs.push(`${d.slug}: duplicate cast names`)
  }
  const showcase = defs.filter((d) => d.showcase)
  if (showcase.length !== 1 || showcase[0].internal.length + showcase[0].externals.length !== 8) {
    errs.push('need exactly one showcase meeting with 8 participants')
  } else if (showcase[0].targetMin < 60 || showcase[0].targetMin > 64) {
    errs.push('showcase must target 60 to 64 minutes')
  }
  return errs
}
