import { formatMs } from '@/lib/format'
import type { TeamStatRow } from '@/lib/types'

export function TeamTable({ rows }: { rows: TeamStatRow[] }) {
  return (
    <div className="overflow-x-auto rounded-card border border-border">
      <table className="w-full min-w-[32rem] text-left text-sm">
        <thead className="bg-surface text-muted">
          <tr>
            <th scope="col" className="px-4 py-2 font-medium">Member</th>
            <th scope="col" className="px-4 py-2 font-medium">Calls</th>
            <th scope="col" className="px-4 py-2 font-medium">Talk share</th>
            <th scope="col" className="px-4 py-2 font-medium">Questions</th>
            <th scope="col" className="px-4 py-2 font-medium">Longest monologue</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.member_id} className="border-t border-border">
              <td className="px-4 py-2">
                <p className="font-medium">{row.name}</p>
                <p className="text-xs text-muted">{row.role}</p>
              </td>
              <td className="px-4 py-2">{row.calls}</td>
              <td className="px-4 py-2">{row.talk_pct}%</td>
              <td className="px-4 py-2">{row.questions}</td>
              <td className="px-4 py-2">{formatMs(row.longest_monologue_sec * 1000)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
