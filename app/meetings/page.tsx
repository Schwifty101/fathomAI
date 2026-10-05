import { AskPanel } from '@/components/AskPanel'
import { MeetingCard } from '@/components/MeetingCard'
import { UpcomingEvents } from '@/components/UpcomingEvents'
import { groupByMonth } from '@/lib/group'
import { getDemoPersona, listAskAnswers, listMeetings, listUpcoming } from '@/lib/queries'
import { createClient } from '@/lib/supabase/server'

export default async function MeetingsPage() {
  const db = await createClient()
  const persona = await getDemoPersona(db)
  const [meetings, events, answers] = await Promise.all([
    listMeetings(db, { hostId: persona?.id }),
    listUpcoming(db),
    listAskAnswers(db),
  ])
  const groups = groupByMonth(meetings)
  return (
    <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[minmax(0,1fr)_auto]">
      <div className="min-w-0">
        <UpcomingEvents events={events} />
        {groups.map((group) => (
          <section key={group.label} className="mb-10">
            <h2 className="mb-4 text-xl font-semibold">{group.label}</h2>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {group.items.map((meeting) => <MeetingCard key={meeting.id} m={meeting} />)}
            </div>
          </section>
        ))}
        {meetings.length === 0 && <p className="text-muted">No calls yet.</p>}
      </div>
      <AskPanel
        scopes={[{ value: 'my_calls', label: 'My Calls' }, { value: 'team_calls', label: 'Team Calls' }]}
        defaultScope="my_calls"
        prompts={answers.filter((answer) => answer.scope === 'my_calls').map((answer) => answer.prompt)}
      />
    </div>
  )
}
