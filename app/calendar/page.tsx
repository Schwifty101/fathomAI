import { CalendarConnect } from '@/components/CalendarConnect'
import { listUpcoming } from '@/lib/queries'
import { createClient } from '@/lib/supabase/server'

export default async function CalendarPage() {
  const events = await listUpcoming(await createClient())
  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-6">
      <h1 className="text-2xl font-semibold">Calendar</h1>
      <CalendarConnect events={events} />
    </div>
  )
}
