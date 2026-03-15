'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

type Message = { role: 'user' | 'assistant'; content: string }
type VoiceState = 'idle' | 'recording' | 'processing' | 'playing'
type Language = 'en' | 'zh'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
const WS_BASE = API_BASE.replace(/^http/, 'ws')

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

  const chatEndRef = useRef<HTMLDivElement>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const audioCtxRef = useRef<AudioContext | null>(null)
  const pendingAudioRef = useRef<ArrayBuffer[]>([])

  // Auth check on mount
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
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
  }, [])

  // Scroll chat to bottom on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  // Send text message
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

  // Play WAV audio bytes received over WebSocket
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

  // Connect WebSocket for voice
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
        // Accumulate all chunks then play (simple approach)
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

  // Reconnect on wsReconnects change
  useEffect(() => {
    if (accessToken && wsReconnects > 0) connectWebSocket()
  }, [wsReconnects, connectWebSocket, accessToken])

  const startRecording = async () => {
    if (voiceState !== 'idle') return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      audioChunksRef.current = []

      // Ensure WS is open
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        connectWebSocket()
        // Wait briefly for connection
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

  const voiceButtonLabel = {
    idle: '🎤',
    recording: '🔴',
    processing: '⏳',
    playing: '🔊',
  }[voiceState]

  const voiceButtonColor = {
    idle: 'bg-sky-500 hover:bg-sky-600',
    recording: 'bg-red-500 animate-pulse',
    processing: 'bg-yellow-400',
    playing: 'bg-green-500',
  }[voiceState]

  return (
    <main className="bg-sky-50 flex flex-col" style={{ height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <header className="bg-sky-600 text-white px-5 py-4 flex items-center justify-between shrink-0">
        <h1 style={{ fontSize: '26px', fontWeight: 'bold' }}>Baymax</h1>
        <div className="flex gap-2">
          {(['en', 'zh'] as Language[]).map(lang => (
            <button
              key={lang}
              onClick={() => setLanguage(lang)}
              className={`rounded-xl font-bold transition-colors px-4 py-2 ${
                language === lang ? 'bg-white text-sky-600' : 'bg-sky-500 text-white border border-sky-300'
              }`}
              style={{ minHeight: '48px', minWidth: '64px', fontSize: '18px' }}
            >
              {lang === 'en' ? 'EN' : '中文'}
            </button>
          ))}
        </div>
      </header>

      {/* Chat messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center text-gray-400 mt-12" style={{ fontSize: '22px' }}>
            {language === 'en'
              ? 'Hello! How are you feeling today?'
              : '您好！今天感觉怎么样？'}
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-xs lg:max-w-md px-5 py-4 rounded-2xl shadow-sm ${
                msg.role === 'user'
                  ? 'bg-sky-500 text-white'
                  : 'bg-white text-gray-800'
              }`}
              style={{ fontSize: '20px', lineHeight: '1.65' }}
            >
              {msg.content}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div
              className="bg-white px-5 py-4 rounded-2xl shadow-sm text-gray-500"
              style={{ fontSize: '20px' }}
            >
              <span className="animate-pulse">
                {language === 'zh' ? '思考中…' : 'Thinking…'}
              </span>
            </div>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Voice button */}
      <div className="flex flex-col items-center gap-2 py-3 shrink-0">
        <button
          onPointerDown={startRecording}
          onPointerUp={stopRecording}
          onPointerLeave={voiceState === 'recording' ? stopRecording : undefined}
          disabled={voiceState === 'processing' || voiceState === 'playing' || !accessToken}
          className={`rounded-full flex items-center justify-center text-white transition-transform active:scale-95 disabled:opacity-50 ${voiceButtonColor}`}
          style={{ width: '80px', height: '80px', fontSize: '34px' }}
          title={voiceState === 'recording' ? 'Release to send' : 'Hold to speak'}
          aria-label="Push to talk"
        >
          {voiceButtonLabel}
        </button>
        <p className="text-gray-400" style={{ fontSize: '15px' }}>
          {voiceState === 'idle'
            ? language === 'zh' ? '按住说话' : 'Hold to speak'
            : voiceState === 'recording'
            ? language === 'zh' ? '录音中…' : 'Recording…'
            : voiceState === 'processing'
            ? language === 'zh' ? '处理中…' : 'Processing…'
            : language === 'zh' ? '播放中…' : 'Playing…'}
        </p>

        {/* Speed toggle */}
        <div className="flex gap-2">
          {(['normal', 'slow'] as const).map(s => (
            <button
              key={s}
              onClick={() => setSpeed(s)}
              className={`px-4 py-2 rounded-xl font-medium transition-colors ${
                speed === s
                  ? 'bg-sky-500 text-white'
                  : 'bg-white text-sky-600 border border-sky-300'
              }`}
              style={{ minHeight: '44px', fontSize: '16px' }}
            >
              {s === 'normal'
                ? language === 'zh' ? '正常语速' : 'Normal'
                : language === 'zh' ? '慢速' : 'Slow'}
            </button>
          ))}
        </div>
      </div>

      {/* Text input */}
      <div className="px-4 pb-4 pt-2 bg-white border-t border-gray-100 flex gap-3 items-center shrink-0">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
          placeholder={language === 'zh' ? '输入消息…' : 'Type a message…'}
          className="flex-1 px-5 py-3 border-2 border-sky-200 rounded-2xl focus:outline-none focus:border-sky-400 bg-sky-50"
          style={{ fontSize: '20px', minHeight: '56px' }}
          disabled={isLoading}
        />
        <button
          onClick={sendMessage}
          disabled={isLoading || !input.trim() || !accessToken}
          className="px-5 py-3 bg-sky-500 text-white rounded-2xl font-bold hover:bg-sky-600 disabled:opacity-40 transition-colors"
          style={{ minHeight: '56px', minWidth: '80px', fontSize: '20px' }}
        >
          {language === 'zh' ? '发送' : 'Send'}
        </button>
      </div>
    </main>
  )
}
