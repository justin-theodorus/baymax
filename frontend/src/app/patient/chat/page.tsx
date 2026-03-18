'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

type Message = { role: 'user' | 'assistant'; content: string }
type VoiceState = 'idle' | 'recording' | 'processing' | 'playing'
type Language = 'en' | 'zh' | 'ms' | 'ta'

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

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
const WS_BASE = API_BASE.replace(/^http/, 'ws')

const LANG_LABELS: { code: Language; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'ta', label: 'Tamil' },
  { code: 'ms', label: 'Malay' },
  { code: 'zh', label: '中文' },
]

export default function PatientChat() {
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
        setPatientId(payload.app_user_id || '')
      } catch {
        setPatientId('')
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
        {
          role: 'assistant',
          content: language === 'zh'
            ? '抱歉，连接失败。请再试一次。'
            : 'Sorry, I could not connect. Please try again.',
        },
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
    idle: 'Hold to speak',
    recording: 'Listening...',
    processing: 'Processing...',
    playing: 'Baymax is speaking...',
  }[voiceState]

  return (
    <main className="bg-white flex flex-col h-screen">
      <style>{`
        @keyframes wave {
          0%, 100% { transform: scaleY(1); }
          50% { transform: scaleY(1.5); }
        }
        @keyframes ping {
          75%, 100% { transform: scale(1.4); opacity: 0; }
        }
      `}</style>

      {/* Sticky header */}
      <div className="sticky top-0 bg-white flex items-center gap-5 px-8 pt-14 pb-4 shadow-[0px_4px_10px_0px_rgba(0,0,0,0.05)] z-10">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="#4894fe">
          <path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423L16.5 15.75l.394 1.183a2.25 2.25 0 001.423 1.423L19.5 18.75l-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
        </svg>
        <p className="text-black text-2xl font-bold">Baymax</p>
      </div>

      {/* Chat messages — scrollable */}
      <div className="flex-1 overflow-y-auto px-8 py-5 flex flex-col gap-5">
        {messages.length === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center gap-5 py-10">
            <p className="text-[#b4b4b4] text-lg">{voiceLabel}</p>

            {/* Large waveform */}
            <div className="relative flex items-center justify-center">
              {voiceState === 'recording' && (
                <div
                  className="absolute rounded-full border-2 border-[#4894fe] opacity-40"
                  style={{
                    width: '160px',
                    height: '160px',
                    animation: 'ping 1s cubic-bezier(0, 0, 0.2, 1) infinite',
                  }}
                />
              )}
              <button
                onPointerDown={startRecording}
                onPointerUp={stopRecording}
                onPointerLeave={voiceState === 'recording' ? stopRecording : undefined}
                disabled={voiceState === 'processing' || !accessToken}
                style={{ minHeight: '0', minWidth: '0' }}
                aria-label="Push to talk"
              >
                <div className="flex items-center gap-2 h-40">
                  {[0.4, 0.7, 1, 0.8, 1, 0.7, 0.4].map((h, i) => (
                    <div
                      key={i}
                      className="w-3 rounded-full"
                      style={{
                        height: `${h * 120}px`,
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

            {/* Language selector */}
            <div className="flex gap-2 flex-wrap justify-center">
              {LANG_LABELS.map(({ code, label }) => {
                const isActive = language === code
                return (
                  <button
                    key={code}
                    onClick={() => setLanguage(code)}
                    className={`px-4 py-2 rounded-[10px] text-base font-medium ${isActive ? 'bg-[#4894fe] text-white' : 'bg-[#f0f0f0] text-[#8b8b8b]'}`}
                    style={{ minHeight: '0', minWidth: '0' }}
                  >
                    {label}
                  </button>
                )
              })}
            </div>

            {/* Speed selector */}
            <div className="flex gap-2">
              {(['Normal', 'Slow'] as const).map(s => {
                const isActive = speed === s.toLowerCase()
                return (
                  <button
                    key={s}
                    onClick={() => setSpeed(s.toLowerCase() as 'normal' | 'slow')}
                    className={`px-4 py-2 rounded-[10px] text-base font-medium ${isActive ? 'bg-[#4894fe] text-white' : 'bg-[#f0f0f0] text-[#8b8b8b]'}`}
                    style={{ minHeight: '0', minWidth: '0' }}
                  >
                    {s}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] px-5 py-4 text-base font-medium leading-normal ${
                msg.role === 'user'
                  ? 'bg-[#4894fe] text-[#e9e9e9] rounded-tl-[20px] rounded-tr-[20px] rounded-bl-[20px]'
                  : 'bg-[rgba(142,142,142,0.2)] text-black rounded-tl-[20px] rounded-tr-[20px] rounded-br-[20px]'
              }`}
            >
              {msg.role === 'assistant' ? renderMarkdown(msg.content) : msg.content}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-[rgba(142,142,142,0.2)] text-[#9ca3af] px-5 py-4 rounded-tl-[20px] rounded-tr-[20px] rounded-br-[20px] animate-pulse text-base">
              Thinking…
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Bottom input bar */}
      <div className="bg-white shadow-[0px_-4px_10px_0px_rgba(0,0,0,0.05)] px-8 py-4">
        <div className="flex items-center gap-3 bg-[#f2f2f2] rounded-full px-5 py-3">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
            placeholder="Ask Baymax"
            className="flex-1 bg-transparent text-[#838080] text-base outline-none"
            style={{ minHeight: '0' }}
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || isLoading}
            style={{ minHeight: '0', minWidth: '0' }}
            aria-label="Send message"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="#4894fe">
              <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
            </svg>
          </button>
          <button
            onPointerDown={startRecording}
            onPointerUp={stopRecording}
            onPointerLeave={voiceState === 'recording' ? stopRecording : undefined}
            disabled={voiceState === 'processing' || !accessToken}
            style={{ minHeight: '0', minWidth: '0' }}
            aria-label="Voice input"
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill={voiceState === 'recording' ? '#E63946' : '#4894fe'}
            >
              <path d="M8.25 4.5a3.75 3.75 0 117.5 0v8.25a3.75 3.75 0 11-7.5 0V4.5z" />
              <path d="M6 10.5a.75.75 0 01.75.75v1.5a5.25 5.25 0 1010.5 0v-1.5a.75.75 0 011.5 0v1.5a6.751 6.751 0 01-6 6.709v2.291h3a.75.75 0 010 1.5h-7.5a.75.75 0 010-1.5h3v-2.291a6.751 6.751 0 01-6-6.709v-1.5A.75.75 0 016 10.5z" />
            </svg>
          </button>
        </div>
      </div>
    </main>
  )
}
