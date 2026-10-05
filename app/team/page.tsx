import { AskPanel } from '@/components/AskPanel'
import { MeetingCard } from '@/components/MeetingCard'
import { TeamTable } from '@/components/TeamTable'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { groupByMonth } from '@/lib/group'
import { getTeamStats, listAskAnswers, listMeetings } from '@/lib/queries'
import { createClient } from '@/lib/supabase/server'

export default async function TeamPage({ searchParams }: { searchParams: Promise<{ host?: string; role?: string }> }) {
  const { host = '', role = '' } = await searchParams
  const db = await createClient()
  const [all, stats, answers] = await Promise.all([listMeetings(db), getTeamStats(db), listAskAnswers(db)])
  const meetings = all.filter((meeting) => (!host || meeting.host_id === host) && (!role || meeting.host?.role === role))
  const withCalls = stats.filter((member) => member.calls > 0)
  const avgTalk = withCalls.length
    ? Math.round(withCalls.reduce((sum, member) => sum + member.talk_pct, 0) / withCalls.length)
    : 0
  const roles = [...new Set(stats.map((member) => member.role))].sort()
  const selectClass = 'h-10 rounded-lg border border-border bg-surface px-3 text-sm text-fg'

  return (
    <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[minmax(0,1fr)_auto]">
      <div className="min-w-0 space-y-8">
        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="p-4"><p className="text-sm text-muted">Calls</p><p className="text-3xl font-semibold">{meetings.length}</p></Card>
          <Card className="p-4"><p className="text-sm text-muted">Avg talk share</p><p className="text-3xl font-semibold">{avgTalk}%</p></Card>
          <Card className="p-4"><p className="text-sm text-muted">Team members</p><p className="text-3xl font-semibold">{stats.length}</p></Card>
        </div>

        <section>
          <h2 className="mb-3 text-xl font-semibold">Team members</h2>
          <TeamTable rows={stats} />
        </section>

        <section>
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <h2 className="text-xl font-semibold">Team calls</h2>
            <form method="get" className="flex flex-wrap items-center gap-2">
              <select name="host" defaultValue={host} aria-label="Host" className={selectClass}>
                <option value="">All hosts</option>
                {stats.map((member) => <option key={member.member_id} value={member.member_id}>{member.name}</option>)}
              </select>
              <select name="role" defaultValue={role} aria-label="Role" className={selectClass}>
                <option value="">All roles</option>
                {roles.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
              <Button type="submit" size="sm">Filter</Button>
            </form>
          </div>
          {groupByMonth(meetings).map((group) => (
            <div key={group.label} className="mb-8">
              <h3 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted">{group.label}</h3>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {group.items.map((meeting) => <MeetingCard key={meeting.id} m={meeting} />)}
              </div>
            </div>
          ))}
          {meetings.length === 0 && <p className="text-muted">No calls match these filters.</p>}
        </section>
      </div>
      <AskPanel
        scopes={[{ value: 'team_calls', label: 'Team Calls' }, { value: 'my_calls', label: 'My Calls' }]}
        defaultScope="team_calls"
        prompts={answers.filter((answer) => answer.scope === 'team_calls').map((answer) => answer.prompt)}
      />
    </div>
  )
}
