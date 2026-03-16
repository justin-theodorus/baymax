'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

type Message = { role: 'user' | 'assistant'; content: string }
type VoiceState = 'idle' | 'recording' | 'processing' | 'playing'
type Language = 'en' | 'zh'

function renderMarkdown(text: string) {
  return text.split('\n').map((line, i) => {
    const parts = line.split(/\*\*(.+?)\*\*/g)
    const rendered = parts.map((part, j) =>
      j % 2 === 1 ? <strong key={j}>{part}</strong> : part
    )
    return (
      <span key={i}>
        {rendered}
        {i < text.split('\n').length - 1 && <br />}
      </span>
    )
  })
}

function getGreeting(language: Language): string {
  const hour = new Date().getHours()
  if (language === 'zh') {
    if (hour < 12) return '早上好'
    if (hour < 18) return '下午好'
    return '晚上好'
  }
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
const WS_BASE = API_BASE.replace(/^http/, 'ws')

function MicIcon({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" x2="12" y1="19" y2="22" />
    </svg>
  )
}

export default function PatientHome() {
  const router = useRouter()
  const supabase = createClient()

  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [language, setLanguage] = useState<Language>('en')
  const [voiceState, setVoiceState] = useState<VoiceState>('idle')
  const [speed, setSpeed] = useState<'normal' | 'slow'>('normal')
  const [patientId, setPatientId] = useState<string>('')
  const [accessToken, setAccessToken] = useState<string>('')
  const [wsReconnects, setWsReconnects] = useState(0)
  const [patientName, setPatientName] = useState<string>('')
  const [medsTaken, setMedsTaken] = useState(0)
  const [medsTotal, setMedsTotal] = useState(0)

  const chatEndRef = useRef<HTMLDivElement>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const audioCtxRef = useRef<AudioContext | null>(null)
  const pendingAudioRef = useRef<ArrayBuffer[]>([])

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

        // Fetch patient name
        if (pid) {
          const { data } = await supabase.from('patients').select('name').eq('id', pid).single()
          if (data?.name) setPatientName(data.name.split(' ')[0])
        }
      } catch {
        setPatientId('')
      }
    })
  }, [])

  // Fetch today's medication summary
  useEffect(() => {
    if (!patientId || !accessToken) return
    fetch(`${API_BASE}/api/medications/today?patient_id=${patientId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return
        setMedsTaken(data.taken_today?.length ?? 0)
        setMedsTotal((data.taken_today?.length ?? 0) + (data.pending_today?.length ?? 0))
      })
      .catch(() => {})
  }, [patientId, accessToken])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  const sendMessage = async () => {
    if (!input.trim() || isLoading || !patientId || !accessToken) return
    const userMsg = input.trim()
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: userMsg }])
    setIsLoading(true)

    try {
      const res = await fetch(`${API_BASE}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ patient_id: patientId, message: userMsg, language }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setMessages(prev => [...prev, { role: 'assistant', content: data.response }])
    } catch {
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: language === 'zh' ? '抱歉，连接失败。请再试一次。' : 'Sorry, I could not connect. Please try again.' },
      ])
    } finally {
      setIsLoading(false)
    }
  }

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
        if (msg.type === 'transcript') {
          setMessages(prev => [...prev, { role: 'user', content: msg.text }])
          setVoiceState('processing')
        } else if (msg.type === 'response_text') {
          setMessages(prev => [...prev, { role: 'assistant', content: msg.text }])
        } else if (msg.type === 'error') {
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

  const voiceBg = {
    idle: '#E8634A',
    recording: '#E63946',
    processing: '#F4A261',
    playing: '#52B788',
  }[voiceState]

  const greeting = `${getGreeting(language)}${patientName ? `, ${patientName}!` : '!'}`
  const healthTip = language === 'zh'
    ? '提示：豆腐和鱼是管理血糖的好选择。'
    : 'Tip: Fish soup is a great low-GI option — a good choice for managing blood sugar today!'

  return (
    <main style={{ background: '#F7F5F2', display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Chat messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="space-y-4">
            {/* Daily summary card */}
            <div style={{
              background: 'white',
              borderRadius: '16px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
              overflow: 'hidden',
            }}>
              <div style={{ background: '#E8634A', padding: '14px 20px' }}>
                <p style={{ color: 'white', fontSize: '22px', fontWeight: 600 }}>{greeting}</p>
              </div>
              <div style={{ padding: '16px 20px' }}>
                {medsTotal > 0 && (
                  <div style={{ marginBottom: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <span style={{ fontSize: '17px', color: '#374151', fontWeight: 500 }}>
                        {language === 'zh'
                          ? `今日已服用 ${medsTaken} / ${medsTotal} 种药物`
                          : `${medsTaken} of ${medsTotal} medications taken today`}
                      </span>
                      <span style={{ fontSize: '17px', color: medsTaken === medsTotal ? '#52B788' : '#E8634A', fontWeight: 600 }}>
                        {medsTotal > 0 ? Math.round(medsTaken / medsTotal * 100) : 0}%
                      </span>
                    </div>
                    <div style={{ background: '#f3f4f6', borderRadius: '999px', height: '8px' }}>
                      <div style={{
                        background: medsTaken === medsTotal ? '#52B788' : '#E8634A',
                        borderRadius: '999px',
                        height: '8px',
                        width: `${medsTotal > 0 ? Math.round(medsTaken / medsTotal * 100) : 0}%`,
                        transition: 'width 0.5s ease',
                      }} />
                    </div>
                  </div>
                )}
                <p style={{ fontSize: '16px', color: '#6b7280', borderTop: '1px solid #f3f4f6', paddingTop: '10px' }}>
                  {healthTip}
                </p>
              </div>
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              style={{
                maxWidth: '80%',
                padding: '16px 20px',
                borderRadius: '18px',
                fontSize: '20px',
                lineHeight: '1.65',
                background: msg.role === 'user' ? '#E8634A' : 'white',
                color: msg.role === 'user' ? 'white' : '#1f2937',
                boxShadow: msg.role === 'assistant' ? '0 2px 8px rgba(0,0,0,0.06)' : 'none',
              }}
            >
              {msg.role === 'assistant' ? renderMarkdown(msg.content) : msg.content}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div
              style={{
                background: 'white',
                padding: '16px 20px',
                borderRadius: '18px',
                fontSize: '20px',
                color: '#9ca3af',
                boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
              }}
            >
              <span className="animate-pulse">
                {language === 'zh' ? '思考中…' : 'Thinking…'}
              </span>
            </div>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Voice section */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', padding: '12px 0 8px' }}>
        {/* Large voice button with pulsing ring */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {voiceState === 'recording' && (
            <div style={{
              position: 'absolute',
              width: '148px',
              height: '148px',
              borderRadius: '50%',
              border: `3px solid #E63946`,
              opacity: 0.4,
              animation: 'ping 1s cubic-bezier(0, 0, 0.2, 1) infinite',
            }} />
          )}
          <style>{`
            @keyframes ping {
              75%, 100% { transform: scale(1.4); opacity: 0; }
            }
            @keyframes wave {
              0%, 100% { transform: scaleY(1); }
              50% { transform: scaleY(1.5); }
            }
          `}</style>
          <button
            onPointerDown={startRecording}
            onPointerUp={stopRecording}
            onPointerLeave={voiceState === 'recording' ? stopRecording : undefined}
            disabled={voiceState === 'processing' || !accessToken}
            style={{
              width: '120px',
              height: '120px',
              borderRadius: '50%',
              background: voiceBg,
              color: 'white',
              border: 'none',
              cursor: voiceState === 'processing' ? 'wait' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background 0.2s, transform 0.1s',
              boxShadow: '0 4px 20px rgba(232,99,74,0.4)',
              transform: voiceState === 'recording' ? 'scale(0.96)' : 'scale(1)',
              opacity: !accessToken ? 0.5 : 1,
            }}
            aria-label="Push to talk"
          >
            {voiceState === 'playing' ? (
              <div style={{ display: 'flex', gap: '4px', alignItems: 'center', height: '36px' }}>
                {[0, 1, 2, 3, 4].map(i => (
                  <div key={i} style={{
                    width: '5px',
                    height: `${14 + Math.sin(i) * 12}px`,
                    background: 'white',
                    borderRadius: '3px',
                    animation: `wave 0.8s ease-in-out infinite`,
                    animationDelay: `${i * 0.12}s`,
                  }} />
                ))}
              </div>
            ) : (
              <MicIcon size={42} />
            )}
          </button>
        </div>

        <p style={{ fontSize: '20px', color: '#4b5563', fontWeight: 500 }}>{voiceLabel}</p>

        {/* Speed toggle + language toggle */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
          {(['normal', 'slow'] as const).map(s => (
            <button
              key={s}
              onClick={() => setSpeed(s)}
              style={{
                padding: '6px 16px',
                borderRadius: '999px',
                fontSize: '15px',
                fontWeight: 500,
                background: speed === s ? '#E8634A' : 'white',
                color: speed === s ? 'white' : '#E8634A',
                border: `1.5px solid #E8634A`,
                minHeight: '36px',
              }}
            >
              {s === 'normal'
                ? language === 'zh' ? '正常语速' : 'Normal'
                : language === 'zh' ? '慢速' : 'Slow'}
            </button>
          ))}
          {(['en', 'zh'] as Language[]).map(lang => (
            <button
              key={lang}
              onClick={() => setLanguage(lang)}
              style={{
                padding: '6px 16px',
                borderRadius: '999px',
                fontSize: '15px',
                fontWeight: 600,
                background: language === lang ? '#3B4F7A' : 'white',
                color: language === lang ? 'white' : '#3B4F7A',
                border: `1.5px solid #3B4F7A`,
                minHeight: '36px',
              }}
            >
              {lang === 'en' ? 'EN' : '中文'}
            </button>
          ))}
        </div>
      </div>

      {/* Text input */}
      <div style={{
        padding: '8px 16px 16px',
        background: 'white',
        borderTop: '1px solid #f3f4f6',
        display: 'flex',
        gap: '10px',
        alignItems: 'center',
      }}>
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
          placeholder={language === 'zh' ? '输入消息…' : 'Type a message…'}
          disabled={isLoading}
          style={{
            flex: 1,
            padding: '12px 18px',
            border: '2px solid #f0ece8',
            borderRadius: '18px',
            fontSize: '20px',
            minHeight: '56px',
            background: '#fafaf9',
            outline: 'none',
            color: '#1f2937',
          }}
        />
        <button
          onClick={sendMessage}
          disabled={isLoading || !input.trim() || !accessToken}
          style={{
            padding: '12px 20px',
            background: '#E8634A',
            color: 'white',
            borderRadius: '18px',
            fontWeight: 700,
            fontSize: '20px',
            minHeight: '56px',
            minWidth: '80px',
            opacity: isLoading || !input.trim() || !accessToken ? 0.4 : 1,
            border: 'none',
            cursor: 'pointer',
            transition: 'opacity 0.2s',
          }}
        >
          {language === 'zh' ? '发送' : 'Send'}
        </button>
      </div>
    </main>
  )
}
