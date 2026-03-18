'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type VoiceState = 'idle' | 'recording' | 'processing' | 'playing'
type Language = 'en' | 'zh'

interface MedSchedule {
  times: string[]
  frequency: string
}

interface Medication {
  id: string
  name: string
  dosage: string
  schedule: MedSchedule
  notes?: string
  active: boolean
}

interface PendingMed extends Medication {
  overdue: boolean
}

interface MedsData {
  medications: Medication[]
  taken_today: Medication[]
  pending_today: PendingMed[]
}

function formatTime(timeStr: string): string {
  const [h, m] = timeStr.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hour = h % 12 || 12
  return `${hour}:${String(m).padStart(2, '0')} ${ampm}`
}

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good Morning'
  if (hour < 18) return 'Good Afternoon'
  return 'Good Evening'
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
const WS_BASE = API_BASE.replace(/^http/, 'ws')

export default function PatientHome() {
  const router = useRouter()
  const supabase = createClient()

  const [language] = useState<Language>('en')
  const [voiceState, setVoiceState] = useState<VoiceState>('idle')
  const [speed] = useState<'normal' | 'slow'>('normal')
  const [patientId, setPatientId] = useState<string>('')
  const [accessToken, setAccessToken] = useState<string>('')
  const [wsReconnects, setWsReconnects] = useState(0)
  const [patientName, setPatientName] = useState<string>('')
  const [medsData, setMedsData] = useState<MedsData | null>(null)

  const wsRef = useRef<WebSocket | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const audioCtxRef = useRef<AudioContext | null>(null)
  const pendingAudioRef = useRef<ArrayBuffer[]>([])

  const healthTip = language === 'zh'
    ? '提示：豆腐和鱼是管理血糖的好选择。'
    : 'Tip: Fish soup is a great low-GI option — a good choice for managing blood sugar today!'

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        router.push('/patient/login')
        return
      }
      setAccessToken(session.access_token)
      try {
        const payload = JSON.parse(atob(session.access_token.split('.')[1]))
        const pid = payload.app_user_id || ''
        setPatientId(pid)

        if (pid) {
          const { data } = await supabase.from('patients').select('name').eq('id', pid).single()
          if (data?.name) setPatientName(data.name.split(' ')[0])
        }
      } catch {
        setPatientId('')
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!patientId || !accessToken) return
    fetch(`${API_BASE}/api/medications/today?patient_id=${patientId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return
        setMedsData(data)
      })
      .catch(() => {})
  }, [patientId, accessToken])

  const playAudio = useCallback(async (audioData: ArrayBuffer) => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext()
    }
    const ctx = audioCtxRef.current
    if (ctx.state === 'suspended') await ctx.resume()
    try {
      const buffer = await ctx.decodeAudioData(audioData.slice(0))
      const source = ctx.createBufferSource()
      source.buffer = buffer
      source.connect(ctx.destination)
      source.start()
      source.onended = () => setVoiceState('idle')
      setVoiceState('playing')
    } catch {
      setVoiceState('idle')
    }
  }, [])

  const connectWebSocket = useCallback(() => {
    if (!accessToken) return
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    const ws = new WebSocket(`${WS_BASE}/api/voice?token=${accessToken}`)
    ws.binaryType = 'arraybuffer'

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'config', speed, language }))
    }

    ws.onmessage = (event) => {
      if (typeof event.data === 'string') {
        const msg = JSON.parse(event.data)
        if (msg.type === 'error') {
          setVoiceState('idle')
        }
      } else if (event.data instanceof ArrayBuffer) {
        pendingAudioRef.current.push(event.data)
        clearTimeout((playAudio as unknown as { _timer?: ReturnType<typeof setTimeout> })._timer)
        const timer = setTimeout(() => {
          const totalLength = pendingAudioRef.current.reduce((a, b) => a + b.byteLength, 0)
          const combined = new Uint8Array(totalLength)
          let offset = 0
          pendingAudioRef.current.forEach(chunk => {
            combined.set(new Uint8Array(chunk), offset)
            offset += chunk.byteLength
          })
          pendingAudioRef.current = []
          playAudio(combined.buffer)
        }, 200)
        ;(playAudio as unknown as { _timer?: ReturnType<typeof setTimeout> })._timer = timer
      }
    }

    ws.onclose = () => {
      if (wsReconnects < 3) {
        setTimeout(() => setWsReconnects(r => r + 1), 2000)
      }
    }

    wsRef.current = ws
  }, [accessToken, speed, language, wsReconnects, playAudio])

  useEffect(() => {
    if (accessToken && wsReconnects > 0) connectWebSocket()
  }, [wsReconnects, connectWebSocket, accessToken])

  const startRecording = async () => {
    if (voiceState !== 'idle') return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      audioChunksRef.current = []

      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        connectWebSocket()
        await new Promise(resolve => setTimeout(resolve, 500))
      }

      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'config', speed, language }))
      }

      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' })
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data)
      }
      mediaRecorder.start(250)
      mediaRecorderRef.current = mediaRecorder
      setVoiceState('recording')
    } catch {
      setVoiceState('idle')
    }
  }

  const stopRecording = async () => {
    if (voiceState !== 'recording' || !mediaRecorderRef.current) return
    mediaRecorderRef.current.stop()
    setVoiceState('processing')

    await new Promise(resolve => setTimeout(resolve, 400))

    const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
    const buffer = await blob.arrayBuffer()

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(buffer)
      wsRef.current.send('END')
    }
  }

  const voiceLabel = {
    idle: language === 'zh' ? '按住说话' : 'Hold to speak',
    recording: language === 'zh' ? '聆听中…' : 'Listening...',
    processing: language === 'zh' ? '处理中…' : 'Processing...',
    playing: language === 'zh' ? 'Baymax 在说话…' : 'Baymax is speaking...',
  }[voiceState]

  const pendingMeds = medsData?.pending_today ?? []
  const takenMeds = medsData?.taken_today ?? []
  const allMeds = [...pendingMeds, ...takenMeds]

  return (
    <main className="bg-white min-h-screen">
      <style>{`
        @keyframes wave {
          0%, 100% { transform: scaleY(1); }
          50% { transform: scaleY(1.5); }
        }
      `}</style>

      {/* Header */}
      <div className="flex items-center justify-between px-8 md:px-12 pt-12 md:pt-16 pb-4">
        <div>
          <p className="text-[#8f8f8f] text-lg font-medium">{getGreeting()}</p>
          <p className="text-black text-2xl font-bold">{patientName ? `${patientName}!` : 'Hello!'}</p>
        </div>
        <div className="w-[60px] h-[60px] rounded-full bg-[#4894fe] flex items-center justify-center flex-shrink-0">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="white">
            <path fillRule="evenodd" d="M7.5 6a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM3.751 20.105a8.25 8.25 0 0116.498 0 .75.75 0 01-.437.695A18.683 18.683 0 0112 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 01-.437-.695z" clipRule="evenodd" />
          </svg>
        </div>
      </div>

      <div className="flex flex-col gap-6 px-8 md:px-12 pb-8">
        {/* Baymax Card */}
        <div className="bg-white rounded-[20px] shadow-[0px_0px_100px_0px_rgba(0,0,0,0.05)] flex flex-col items-center gap-5 p-8">
          {/* Title */}
          <div className="flex items-center gap-4 w-full">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="#4894fe">
              <path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423L16.5 15.75l.394 1.183a2.25 2.25 0 001.423 1.423L19.5 18.75l-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
            </svg>
            <p className="text-black text-2xl font-bold">Baymax</p>
          </div>

          {/* Health tip bubble */}
          <div className="w-full bg-[rgba(142,142,142,0.2)] rounded-tl-[20px] rounded-tr-[20px] rounded-br-[20px] px-5 py-3">
            <p className="text-black text-base font-medium">{healthTip}</p>
          </div>

          {/* Voice label */}
          <p className="text-[#b4b4b4] text-lg font-medium">{voiceLabel}</p>

          {/* Waveform voice button */}
          <div className="relative flex items-center justify-center">
            {voiceState === 'recording' && (
              <div className="absolute w-36 h-36 rounded-full border-2 border-[#4894fe] opacity-40 animate-ping" />
            )}
            <button
              onPointerDown={startRecording}
              onPointerUp={stopRecording}
              onPointerLeave={voiceState === 'recording' ? stopRecording : undefined}
              disabled={voiceState === 'processing' || !accessToken}
              className="relative"
              style={{ minHeight: '0', minWidth: '0' }}
              aria-label="Push to talk"
            >
              <div className="flex items-center gap-1.5 h-24 w-24">
                {[0.4, 0.7, 1, 0.8, 1, 0.7, 0.4].map((h, i) => (
                  <div
                    key={i}
                    className="rounded-full"
                    style={{
                      width: '8px',
                      height: `${h * 80}px`,
                      background: voiceState === 'recording' ? '#E63946' : '#4894fe',
                      opacity: voiceState === 'processing' ? 0.5 : 1,
                      animation: voiceState === 'recording' || voiceState === 'playing'
                        ? `wave 0.8s ease-in-out infinite ${i * 0.1}s`
                        : 'none',
                    }}
                  />
                ))}
              </div>
            </button>
          </div>

          {/* Ask Baymax input — clicking goes to chat */}
          <Link
            href="/patient/chat"
            className="w-full bg-[#f2f2f2] rounded-full flex items-center gap-3 px-5 py-3 cursor-pointer"
            style={{ minHeight: '0', minWidth: '0' }}
          >
            <p className="flex-1 text-[#838080] text-base font-medium">Ask Baymax</p>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="#4894fe">
              <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
            </svg>
          </Link>
        </div>

        {/* Medication Cards */}
        {allMeds.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {pendingMeds.map((med, i) => {
              const isOverdue = med.overdue
              const bgColor = i === 0 ? '#4894fe' : '#464646'
              const timeColor = isOverdue ? '#ff7878' : 'white'
              const timeStr = med.schedule?.times?.[0] ? formatTime(med.schedule.times[0]) : ''
              return (
                <div
                  key={med.id}
                  className="rounded-[20px] flex items-center justify-between px-10 py-5"
                  style={{ background: bgColor }}
                >
                  <div className="flex items-center gap-5">
                    <div className="w-12 h-12 rounded-full border-2 border-[rgba(255,255,255,0.3)] flex items-center justify-center flex-shrink-0">
                      <div className="w-8 h-8 rounded-full border-2 border-[rgba(255,255,255,0.5)]" />
                    </div>
                    <div>
                      <p className="text-white text-lg font-bold">{med.name}</p>
                      <p className="text-white text-base font-normal">{med.dosage}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill={timeColor} opacity="0.9">
                      <path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25zM12.75 6a.75.75 0 00-1.5 0v6c0 .414.336.75.75.75h4.5a.75.75 0 000-1.5h-3.75V6z" clipRule="evenodd" />
                    </svg>
                    <p className="text-base font-normal" style={{ color: timeColor }}>{timeStr}</p>
                  </div>
                </div>
              )
            })}
            {takenMeds.map((med, i) => {
              const bgColor = pendingMeds.length === 0 && i === 0 ? '#4894fe' : '#464646'
              return (
                <div
                  key={med.id}
                  className="rounded-[20px] flex items-center justify-between px-10 py-5 opacity-60"
                  style={{ background: bgColor }}
                >
                  <div className="flex items-center gap-5">
                    <div className="w-12 h-12 rounded-full border-2 border-[rgba(255,255,255,0.3)] flex items-center justify-center flex-shrink-0">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                        <path fillRule="evenodd" d="M19.916 4.626a.75.75 0 01.208 1.04l-9 13.5a.75.75 0 01-1.154.114l-6-6a.75.75 0 011.06-1.06l5.353 5.353 8.493-12.74a.75.75 0 011.04-.207z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-white text-lg font-bold">{med.name}</p>
                      <p className="text-white text-base font-normal">{med.dosage}</p>
                    </div>
                  </div>
                  <p className="text-white text-base font-normal opacity-70">Taken</p>
                </div>
              )
            })}
          </div>
        )}

        {/* Doctor Card */}
        <div className="bg-white rounded-[20px] shadow-[0px_0px_100px_0px_rgba(0,0,0,0.05)] flex flex-col px-10 py-5 gap-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-[#e0e0e0] flex-shrink-0" />
              <div>
                <p className="text-black text-2xl font-bold">Dr. Imran Syahir</p>
                <p className="text-[#b4b4b4] text-lg font-medium">General Doctor</p>
              </div>
            </div>
            <svg width="11" height="22" viewBox="0 0 11 22" fill="none">
              <path d="M1 1l9 10L1 21" stroke="#b4b4b4" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div className="h-px bg-[#e5e5e5] w-full" />
          <div className="flex items-center justify-between">
            <p className="text-black text-base font-medium">Sunday, 12 June</p>
            <p className="text-[#4894fe] text-base font-medium">11:00 - 12:00 AM</p>
          </div>
        </div>
      </div>
    </main>
  )
}
