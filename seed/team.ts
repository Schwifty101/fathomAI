export type Member = { slug: string; name: string; role: string; demo?: boolean }

export const TEAM: Member[] = [
  { slug: 'priya', name: 'Priya Raman', role: 'Product Lead', demo: true },
  { slug: 'daniel', name: 'Daniel Ortiz', role: 'Sales' },
  { slug: 'mei', name: 'Mei Tanaka', role: 'Engineering Manager' },
  { slug: 'jonas', name: 'Jonas Weber', role: 'Design Lead' },
  { slug: 'amara', name: 'Amara Nwosu', role: 'Customer Success' },
  { slug: 'lucas', name: 'Lucas Ferreira', role: 'Data & Analytics' },
  { slug: 'hannah', name: 'Hannah Cole', role: 'Marketing' },
  { slug: 'omar', name: 'Omar Haddad', role: 'Finance' },
]

export const memberBySlug = new Map(TEAM.map((m) => [m.slug, m]))
