'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

interface ConversationEntry {
  id: string
  role: 'user' | 'assistant'
  content: string
  language: string
  created_at: string
}

interface DayGroup {
  date: string
  label: string
  entries: ConversationEntry[]
}

function formatDayLabel(dateStr: string): string {
  const date = new Date(dateStr)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)

  if (date.toDateString() === today.toDateString()) return 'Today'
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return date.toLocaleDateString('en-SG', { weekday: 'long', month: 'short', day: 'numeric' })
}

function formatTime(isoString: string): string {
  return new Date(isoString).toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit' })
}

function groupByDay(entries: ConversationEntry[]): DayGroup[] {
  const map = new Map<string, ConversationEntry[]>()
  for (const entry of entries) {
    const day = new Date(entry.created_at).toDateString()
    if (!map.has(day)) map.set(day, [])
    map.get(day)!.push(entry)
  }
  return Array.from(map.entries())
    .sort((a, b) => new Date(b[0]).getTime() - new Date(a[0]).getTime())
    .map(([dateStr, entries]) => ({
      date: dateStr,
      label: formatDayLabel(dateStr),
      entries: entries.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
    }))
}

export default function HistoryPage() {
  const router = useRouter()
  const supabase = createClient()

  const [groups, setGroups] = useState<DayGroup[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        router.push('/patient/login')
        return
      }

      try {
        const payload = JSON.parse(atob(session.access_token.split('.')[1]))
        const patientId = payload.app_user_id

        if (!patientId) {
          setError('Could not identify patient.')
          setIsLoading(false)
          return
        }

        const { data, error: dbError } = await supabase
          .from('conversations')
          .select('id, role, content, language, created_at')
          .eq('patient_id', patientId)
          .order('created_at', { ascending: false })
          .limit(200)

        if (dbError) throw dbError
        setGroups(groupByDay((data ?? []) as ConversationEntry[]))
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : JSON.stringify(err)
        setError(`Failed to load conversation history: ${msg}`)
      } finally {
        setIsLoading(false)
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (isLoading) {
    return (
      <main className="bg-sky-50 flex flex-col" style={{ height: '100%', overflowY: 'auto' }}>
        <header className="bg-sky-600 text-white px-5 py-4 shrink-0">
          <h1 style={{ fontSize: '26px', fontWeight: 'bold' }}>History</h1>
        </header>
        <div className="p-4 space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-20 bg-white rounded-2xl animate-pulse" />
          ))}
        </div>
      </main>
    )
  }

  if (error) {
    return (
      <main className="bg-sky-50 flex flex-col" style={{ height: '100%' }}>
        <header className="bg-sky-600 text-white px-5 py-4 shrink-0">
          <h1 style={{ fontSize: '26px', fontWeight: 'bold' }}>History</h1>
        </header>
        <div className="p-4">
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-red-700" style={{ fontSize: '18px' }}>
            {error}
          </div>
        </div>
      </main>
    )
  }

  if (groups.length === 0) {
    return (
      <main className="bg-sky-50 flex flex-col items-center justify-center" style={{ height: '100%' }}>
        <div className="text-center px-8">
          <div className="text-6xl mb-6">📋</div>
          <h1 className="font-bold text-gray-700 mb-3" style={{ fontSize: '28px' }}>
            Conversation History
          </h1>
          <p className="text-gray-400" style={{ fontSize: '20px', lineHeight: '1.6' }}>
            Your past conversations will appear here.
          </p>
        </div>
      </main>
    )
  }

  return (
    <main className="bg-sky-50 flex flex-col" style={{ height: '100%', overflowY: 'auto' }}>
      <header className="bg-sky-600 text-white px-5 py-4 shrink-0">
        <h1 style={{ fontSize: '26px', fontWeight: 'bold' }}>History</h1>
      </header>

      <div className="flex-1 p-4 space-y-6 pb-4">
        {groups.map(group => (
          <section key={group.date}>
            <h2
              className="text-gray-400 font-semibold mb-3 px-1"
              style={{ fontSize: '16px', textTransform: 'uppercase', letterSpacing: '0.05em' }}
            >
              {group.label}
            </h2>
            <div className="space-y-2">
              {group.entries.map(entry => (
                <div
                  key={entry.id}
                  className={`flex ${entry.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-xs lg:max-w-md px-4 py-3 rounded-2xl shadow-sm ${
                      entry.role === 'user'
                        ? 'bg-sky-500 text-white'
                        : 'bg-white text-gray-800'
                    }`}
                    style={{ fontSize: '18px', lineHeight: '1.6' }}
                  >
                    <p>{entry.content}</p>
                    <p
                      className={`mt-1 text-right ${entry.role === 'user' ? 'text-sky-100' : 'text-gray-300'}`}
                      style={{ fontSize: '13px' }}
                    >
                      {formatTime(entry.created_at)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  )
}
