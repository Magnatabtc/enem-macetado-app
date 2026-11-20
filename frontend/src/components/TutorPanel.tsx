import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import {
  AlertTriangle,
  Loader2,
  MessageCircle,
  Mic,
  Send,
  Sparkles,
  Square,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react'
import { tokenStore, type FeedQuestion } from '../api'

type Phase = 'connecting' | 'idle' | 'listening' | 'thinking' | 'speaking' | 'error'
type SttMode = 'webspeech' | 'media' | 'text'
type Role = 'user' | 'tutor'

interface ChatMessage {
  id: number
  role: Role
  text: string
}

interface ReadyInfo {
  tutor: string
  stt: boolean
  tts: boolean
}

type ServerMessage =
  | { type: 'ready'; tutor: string; stt: boolean; tts: boolean }
  | { type: 'status'; status: string }
  | { type: 'delta'; text: string }
  | { type: 'audio'; mime: string; data: string }
  | { type: 'done'; text: string }
  | { type: 'stt_fallback' }
  | { type: 'error'; error: string }
  | { type: 'pong' }

interface SpeechAlternative {
  transcript: string
}

interface SpeechResult {
  readonly length: number
  readonly isFinal: boolean
  [index: number]: SpeechAlternative
}

interface SpeechResultList {
  readonly length: number
  [index: number]: SpeechResult
}

interface SpeechResultEvent extends Event {
  resultIndex: number
  results: SpeechResultList
}

interface SpeechErrorEvent extends Event {
  error: string
}

interface SpeechRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  start: () => void
  stop: () => void
  abort: () => void
  onstart: (() => void) | null
  onresult: ((event: SpeechResultEvent) => void) | null
  onerror: ((event: SpeechErrorEvent) => void) | null
  onend: (() => void) | null
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike

function getSpeechRecognition(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null
  const candidate = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor
    webkitSpeechRecognition?: SpeechRecognitionConstructor
  }
  return candidate.SpeechRecognition ?? candidate.webkitSpeechRecognition ?? null
}

const SPEECH_SUPPORTED = typeof window !== 'undefined' && Boolean(getSpeechRecognition())
const MEDIA_SUPPORTED =
  typeof window !== 'undefined' &&
  typeof MediaRecorder !== 'undefined' &&
  typeof navigator !== 'undefined' &&
  Boolean(navigator.mediaDevices?.getUserMedia)

const SYNTHESIS_SUPPORTED = typeof window !== 'undefined' && 'speechSynthesis' in window

function parseServerMessage(raw: string): ServerMessage | null {
  try {
    const value = JSON.parse(raw) as unknown
    if (typeof value !== 'object' || value === null) return null
    const type = (value as { type?: unknown }).type
    if (typeof type !== 'string') return null
    return value as ServerMessage
  } catch {
    return null
  }
}

function buildTutorUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const token = tokenStore.get() ?? ''
  return `${protocol}//${window.location.host}/ws/tutor?token=${encodeURIComponent(token)}`
}

function Waveform({ active, tone }: { active: boolean; tone: 'lime' | 'violet' }) {
  const color = tone === 'lime' ? 'bg-lime' : 'bg-violet-soft'
  return (
    <div className="flex h-9 items-center justify-center gap-[3px]" aria-hidden="true">
      {Array.from({ length: 17 }, (_, index) => (
        <span
          key={index}
          className={`w-[3px] rounded-full ${color} ${active ? 'animate-wave' : 'opacity-30'}`}
          style={{
            height: `${5 + ((index * 7) % 20)}px`,
            animationDelay: `${index * 65}ms`,
            animationDuration: `${780 + (index % 5) * 90}ms`,
          }}
        />
      ))}
    </div>
  )
}

interface TutorPanelProps {
  open: boolean
  question: FeedQuestion | null
  onClose: () => void
}

export function TutorPanel({ open, question, onClose }: TutorPanelProps) {
  const [phase, setPhase] = useState<Phase>('connecting')
  const [ready, setReady] = useState<ReadyInfo | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [streaming, setStreaming] = useState('')
  const [interim, setInterim] = useState('')
  const [input, setInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [muted, setMuted] = useState(false)
  const [sttMode, setSttMode] = useState<SttMode>('text')
  const [reconnectKey, setReconnectKey] = useState(0)

  const wsRef = useRef<WebSocket | null>(null)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const audioUrlRef = useRef<string | null>(null)
  const mutedRef = useRef(false)
  const openRef = useRef(open)
  const streamingRef = useRef('')
  const serverAudioRef = useRef(false)
  const messageIdRef = useRef(0)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    openRef.current = open
  }, [open])

  useEffect(() => {
    mutedRef.current = muted
    if (muted) {
      if (SYNTHESIS_SUPPORTED) window.speechSynthesis.cancel()
      const audio = audioRef.current
      if (audio) {
        audio.pause()
        setPhase((current) => (current === 'speaking' ? 'idle' : current))
      }
    }
  }, [muted])

  const nextMessageId = useCallback(() => {
    messageIdRef.current += 1
    return messageIdRef.current
  }, [])

  const cleanupAudio = useCallback(() => {
    const audio = audioRef.current
    if (audio) {
      audio.onended = null
      audio.onerror = null
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
    }
    audioRef.current = null
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current)
      audioUrlRef.current = null
    }
  }, [])

  const stopSpeech = useCallback(() => {
    if (SYNTHESIS_SUPPORTED) window.speechSynthesis.cancel()
  }, [])

  const stopRecognition = useCallback(() => {
    const recognition = recognitionRef.current
    recognitionRef.current = null
    if (!recognition) return
    recognition.onresult = null
    recognition.onerror = null
    recognition.onend = null
    recognition.onstart = null
    try {
      recognition.abort()
    } catch {
      /* já encerrado */
    }
  }, [])

  const speak = useCallback((text: string) => {
    if (!text.trim() || mutedRef.current || !SYNTHESIS_SUPPORTED) return
    try {
      window.speechSynthesis.cancel()
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.lang = 'pt-BR'
      utterance.rate = 1.02
      utterance.pitch = 1
      const voices = window.speechSynthesis.getVoices()
      const voice =
        voices.find((item) => item.lang.toLowerCase().startsWith('pt-br')) ??
        voices.find((item) => item.lang.toLowerCase().startsWith('pt'))
      if (voice) utterance.voice = voice
      utterance.onstart = () => setPhase('speaking')
      utterance.onend = () => setPhase((current) => (current === 'speaking' ? 'idle' : current))
      utterance.onerror = () => setPhase((current) => (current === 'speaking' ? 'idle' : current))
      window.speechSynthesis.speak(utterance)
    } catch {
      setPhase((current) => (current === 'speaking' ? 'idle' : current))
    }
  }, [])

  const playAudio = useCallback(
    (data: string, mime: string) => {
      try {
        const binary = window.atob(data)
        const bytes = new Uint8Array(binary.length)
        for (let index = 0; index < binary.length; index += 1) {
          bytes[index] = binary.charCodeAt(index)
        }
        const blob = new Blob([bytes], { type: mime || 'audio/mpeg' })
        cleanupAudio()
        stopSpeech()
        const url = URL.createObjectURL(blob)
        const audio = new Audio(url)
        audioRef.current = audio
        audioUrlRef.current = url
        audio.onplay = () => setPhase('speaking')
        audio.onended = () => {
          setPhase((current) => (current === 'speaking' ? 'idle' : current))
          cleanupAudio()
        }
        audio.onerror = () => {
          setPhase((current) => (current === 'speaking' ? 'idle' : current))
          cleanupAudio()
        }
        void audio
          .play()
          .then(() => setPhase('speaking'))
          .catch(() => setPhase((current) => (current === 'speaking' ? 'idle' : current)))
      } catch {
        setPhase((current) => (current === 'speaking' ? 'idle' : current))
      }
    },
    [cleanupAudio, stopSpeech],
  )

  const sendAsk = useCallback(
    (raw: string) => {
      const text = raw.trim()
      if (!text) return
      const socket = wsRef.current
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        setError('Sem conexão com o tutor. Reconecte para continuar.')
        setPhase('error')
        return
      }
      stopRecognition()
      stopSpeech()
      cleanupAudio()
      serverAudioRef.current = false
      streamingRef.current = ''
      setStreaming('')
      setInterim('')
      setInput('')
      setError(null)
      setNotice(null)
      setMessages((previous) => [...previous, { id: nextMessageId(), role: 'user', text }])
      setPhase('thinking')
      socket.send(JSON.stringify({ type: 'ask', text }))
    },
    [cleanupAudio, nextMessageId, stopRecognition, stopSpeech],
  )

  const startWebSpeech = useCallback(() => {
    const Constructor = getSpeechRecognition()
    if (!Constructor) {
      setSttMode('text')
      setNotice('Seu navegador não tem reconhecimento de voz. Escreva sua pergunta abaixo.')
      inputRef.current?.focus()
      return
    }

    stopRecognition()
    stopSpeech()
    cleanupAudio()
    setError(null)
    setNotice(null)
    setInterim('')

    try {
      const recognition = new Constructor()
      recognitionRef.current = recognition
      recognition.lang = 'pt-BR'
      recognition.continuous = false
      recognition.interimResults = true
      recognition.maxAlternatives = 1

      let finalTranscript = ''
      let sent = false

      recognition.onstart = () => setPhase('listening')

      recognition.onresult = (event) => {
        let interimText = ''
        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          const result = event.results[index]
          if (!result) continue
          const transcript = result[0]?.transcript ?? ''
          if (result.isFinal) {
            finalTranscript = `${finalTranscript} ${transcript}`.trim()
          } else {
            interimText = `${interimText} ${transcript}`.trim()
          }
        }

        setInterim(interimText)

        if (finalTranscript && !sent) {
          sent = true
          sendAsk(finalTranscript)
        }
      }

      recognition.onerror = (event) => {
        if (event.error === 'aborted') return
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          setError('Permissão de microfone negada. Libere o microfone no navegador ou escreva sua dúvida.')
        } else if (event.error === 'no-speech') {
          setNotice('Não ouvi nada. Aproxime o microfone e tente outra vez.')
        } else {
          setNotice('O reconhecimento de voz do navegador falhou. Você pode escrever sua pergunta.')
        }
        setPhase('idle')
      }

      recognition.onend = () => {
        recognitionRef.current = null
        setInterim('')
        setPhase((current) => (current === 'listening' ? 'idle' : current))
      }

      recognition.start()
    } catch {
      setNotice('Não conseguimos iniciar o microfone. Escreva sua pergunta abaixo.')
      setPhase('idle')
    }
  }, [cleanupAudio, sendAsk, stopRecognition, stopSpeech])

  const startMediaRecording = useCallback(async () => {
    if (!MEDIA_SUPPORTED) {
      setSttMode('text')
      setNotice('Gravação de áudio indisponível neste navegador. Escreva sua pergunta.')
      inputRef.current?.focus()
      return
    }

    stopSpeech()
    cleanupAudio()
    setError(null)
    setNotice(null)

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (!openRef.current) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      streamRef.current = stream

      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'].find((type) =>
        MediaRecorder.isTypeSupported(type),
      )
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      recorderRef.current = recorder
      const chunks: BlobPart[] = []

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data)
      }

      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop())
        if (streamRef.current === stream) streamRef.current = null
        if (recorderRef.current === recorder) recorderRef.current = null

        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' })
        if (blob.size === 0) {
          setNotice('Nada foi gravado. Toque no microfone e fale um pouco mais.')
          setPhase('idle')
          return
        }

        const reader = new FileReader()
        reader.onloadend = () => {
          if (!openRef.current) return
          const raw = typeof reader.result === 'string' ? reader.result : ''
          const base64 = raw.includes(',') ? (raw.split(',')[1] ?? '') : ''
          const socket = wsRef.current
          if (!socket || socket.readyState !== WebSocket.OPEN) {
            setError('A conexão com o tutor caiu durante o envio do áudio. Reconecte.')
            setPhase('error')
            return
          }
          if (!base64) {
            setNotice('Não consegui preparar o áudio. Escreva sua pergunta.')
            setPhase('idle')
            return
          }
          serverAudioRef.current = false
          streamingRef.current = ''
          setStreaming('')
          setMessages((previous) => [
            ...previous,
            { id: nextMessageId(), role: 'user', text: 'Mensagem de voz' },
          ])
          setPhase('thinking')
          socket.send(
            JSON.stringify({
              type: 'audio_chunk',
              mime: (recorder.mimeType || 'audio/webm').split(';')[0],
              data: base64,
            }),
          )
          socket.send(JSON.stringify({ type: 'audio_end' }))
        }
        reader.readAsDataURL(blob)
        setPhase('thinking')
      }

      recorder.start(250)
      setPhase('listening')
    } catch {
      setError(
        'Não consegui acessar o microfone. Verifique a permissão do navegador ou escreva sua dúvida.',
      )
      setPhase('idle')
    }
  }, [cleanupAudio, nextMessageId, stopSpeech])

  const handleServerMessage = useCallback(
    (raw: string) => {
      const message = parseServerMessage(raw)
      if (!message) return

      switch (message.type) {
        case 'ready': {
          setReady({ tutor: message.tutor, stt: message.stt, tts: message.tts })
          if (SPEECH_SUPPORTED) {
            setSttMode('webspeech')
          } else if (message.stt && MEDIA_SUPPORTED) {
            setSttMode('media')
          } else {
            setSttMode('text')
            setNotice('Envie sua dúvida por texto. O reconhecimento de voz não está disponível aqui.')
          }
          setPhase((current) => (current === 'connecting' ? 'idle' : current))
          break
        }
        case 'status': {
          if (message.status === 'thinking') {
            setPhase('thinking')
          }
          break
        }
        case 'delta': {
          streamingRef.current += message.text
          setStreaming(streamingRef.current)
          setPhase('thinking')
          break
        }
        case 'audio': {
          serverAudioRef.current = true
          playAudio(message.data, message.mime)
          break
        }
        case 'done': {
          const text = message.text?.trim() || streamingRef.current.trim()
          streamingRef.current = ''
          setStreaming('')
          setPhase('idle')
          if (text) {
            setMessages((previous) => [...previous, { id: nextMessageId(), role: 'tutor', text }])
            if (!serverAudioRef.current) speak(text)
          }
          break
        }
        case 'stt_fallback': {
          setPhase('idle')
          setSttMode((current) => (current === 'media' ? 'text' : current))
          setNotice(
            'O servidor não conseguiu transcrever o áudio. Escreva sua pergunta ou use o microfone do navegador.',
          )
          window.setTimeout(() => inputRef.current?.focus(), 80)
          break
        }
        case 'error': {
          setError(message.error || 'O tutor encontrou um erro. Tente novamente.')
          setPhase((current) => (current === 'connecting' ? 'error' : 'idle'))
          break
        }
        case 'pong':
          break
        default:
          break
      }
    },
    [nextMessageId, playAudio, speak],
  )

  useEffect(() => {
    if (!open || !question) return
    let disposed = false

    setPhase('connecting')
    setReady(null)
    setMessages([])
    setStreaming('')
    setInterim('')
    setInput('')
    setError(null)
    setNotice(null)
    setSttMode(SPEECH_SUPPORTED ? 'webspeech' : MEDIA_SUPPORTED ? 'media' : 'text')
    streamingRef.current = ''
    serverAudioRef.current = false

    let socket: WebSocket
    try {
      socket = new WebSocket(buildTutorUrl())
    } catch {
      setError('Não foi possível abrir a conexão com o tutor.')
      setPhase('error')
      return
    }
    wsRef.current = socket

    socket.onopen = () => {
      if (disposed) return
      setPhase('idle')
      socket.send(JSON.stringify({ type: 'start', question_id: question.id }))
    }

    socket.onmessage = (event: MessageEvent<unknown>) => {
      if (disposed || typeof event.data !== 'string') return
      handleServerMessage(event.data)
    }

    socket.onerror = () => {
      if (disposed) return
      setError((previous) => previous ?? 'Não foi possível conectar ao tutor. Confira sua conexão.')
      setPhase('error')
    }

    socket.onclose = () => {
      if (disposed) return
      setError((previous) => previous ?? 'A conexão com o tutor foi encerrada. Reconecte para continuar.')
      setPhase('error')
    }

    const pingTimer = window.setInterval(() => {
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'ping' }))
    }, 25_000)

    return () => {
      disposed = true
      window.clearInterval(pingTimer)
      if (wsRef.current === socket) wsRef.current = null
      try {
        socket.close(1000, 'fechando tutor')
      } catch {
        /* já fechado */
      }
    }
  }, [open, question, reconnectKey, handleServerMessage])

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      stopRecognition()
    }
    const recorder = recorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      try {
        recorder.stop()
      } catch {
        /* já parado */
      }
    }
  }, [stopRecognition])

  const handleMic = useCallback(() => {
    if (!open) return

    if (phase === 'listening') {
      stopListening()
      if (!recorderRef.current) {
        setPhase((current) => (current === 'listening' ? 'idle' : current))
      }
      return
    }

    const socket = wsRef.current
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      setReconnectKey((key) => key + 1)
      return
    }

    if (sttMode === 'text') {
      setNotice('Você pode escrever sua dúvida no campo abaixo. O microfone não está disponível.')
      inputRef.current?.focus()
      return
    }

    if (phase === 'speaking') {
      stopSpeech()
      cleanupAudio()
      setPhase('idle')
    }

    if (sttMode === 'webspeech') {
      startWebSpeech()
    } else {
      void startMediaRecording()
    }
  }, [
    cleanupAudio,
    open,
    phase,
    startMediaRecording,
    startWebSpeech,
    sttMode,
    stopListening,
    stopSpeech,
  ])

  const cleanupAll = useCallback(() => {
    stopRecognition()
    const recorder = recorderRef.current
    recorderRef.current = null
    if (recorder) {
      recorder.ondataavailable = null
      recorder.onstop = null
      try {
        if (recorder.state !== 'inactive') recorder.stop()
      } catch {
        /* já parado */
      }
    }
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    cleanupAudio()
    stopSpeech()
    const socket = wsRef.current
    wsRef.current = null
    if (socket && (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN)) {
      try {
        socket.close(1000, 'painel fechado')
      } catch {
        /* já fechado */
      }
    }
  }, [cleanupAudio, stopRecognition, stopSpeech])

  useEffect(() => {
    if (!open) return

    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const focusTimer = window.setTimeout(() => panelRef.current?.focus(), 90)

    return () => {
      window.clearTimeout(focusTimer)
      document.body.style.overflow = previousOverflow
      previousFocusRef.current?.focus?.({ preventScroll: true })
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    return () => {
      openRef.current = false
      cleanupAll()
    }
  }, [open, cleanupAll])

  useEffect(() => {
    if (!open) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  useEffect(() => {
    if (!open) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    messagesEndRef.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'end' })
  }, [messages, streaming, interim, open])

  if (!open || !question) return null

  const phaseCopy: Record<Phase, { title: string; hint: string }> = {
    connecting: { title: 'Conectando…', hint: 'Chamando seu tutor' },
    idle: {
      title: sttMode === 'text' ? 'Escreva sua dúvida' : 'Toque e fale',
      hint:
        sttMode === 'webspeech'
          ? 'Fale sua dúvida — envio automático ao terminar'
          : sttMode === 'media'
            ? 'Toque para gravar, toque de novo para enviar'
            : 'O microfone não está disponível neste navegador',
    },
    listening: {
      title: 'Ouvindo…',
      hint: sttMode === 'media' ? 'Toque no botão para encerrar e enviar' : 'Pode falar, estou te ouvindo',
    },
    thinking: { title: 'Pensando…', hint: 'Montando a melhor explicação' },
    speaking: { title: 'Falando…', hint: 'Toque no microfone para interromper e perguntar' },
    error: { title: 'Conexão caiu', hint: 'Reconecte para continuar a conversa' },
  }

  const copy = phaseCopy[phase]
  const micDisabled = phase === 'connecting' || phase === 'thinking'
  const micLabel =
    phase === 'listening'
      ? 'Parar de ouvir'
      : phase === 'thinking'
        ? 'Tutor pensando'
        : phase === 'speaking'
          ? 'Interromper a fala e perguntar'
          : 'Falar com o tutor'

  const canSendText = input.trim().length > 0 && phase !== 'thinking' && phase !== 'connecting'

  const submitText = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canSendText) return
    sendAsk(input)
  }

  return createPortal(
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 animate-fade-in bg-ink/80 backdrop-blur-md"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tutor-title"
        tabIndex={-1}
        className="absolute inset-x-0 bottom-0 mx-auto flex h-[min(84dvh,680px)] w-full max-w-[560px] animate-slide-up flex-col overflow-hidden rounded-t-4xl border border-b-0 border-white/10 bg-surface shadow-sheet outline-none"
      >
        <div className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-white/15" aria-hidden="true" />

        <header className="flex shrink-0 items-start justify-between gap-3 px-5 pb-3 pt-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-violet/15 text-violet-soft">
              <Sparkles className="h-5 w-5" aria-hidden="true" />
              <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border-2 border-surface bg-lime" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h2 id="tutor-title" className="truncate font-display text-base font-semibold text-white">
                Tutor de {question.subject_label}
              </h2>
              <p className="mt-0.5 flex items-center gap-1.5 truncate text-[11px] text-white/40">
                <MessageCircle className="h-3 w-3 shrink-0" aria-hidden="true" />
                {ready
                  ? ready.tutor === 'openai'
                    ? 'IA OpenAI em tempo real'
                    : 'Modo local determinístico'
                  : 'Conectando ao servidor'}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => setMuted((value) => !value)}
              aria-pressed={muted}
              aria-label={muted ? 'Ativar voz do tutor' : 'Silenciar voz do tutor'}
              className={`icon-button h-9 w-9 ${muted ? 'border-danger/30 bg-danger/10 text-danger' : ''}`}
            >
              {muted ? <VolumeX className="h-4 w-4" aria-hidden="true" /> : <Volume2 className="h-4 w-4" aria-hidden="true" />}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="icon-button h-9 w-9"
              aria-label="Fechar tutor"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5">
          {question.topic && (
            <div className="mb-3 rounded-2xl border border-white/[0.07] bg-white/[0.025] px-3.5 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/30">
                Contexto da questão
              </p>
              <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-white/50">
                {question.statement}
              </p>
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="mb-3 flex flex-col gap-2 rounded-2xl border border-danger/30 bg-danger/[0.08] px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <p className="flex items-start gap-2 text-xs leading-snug text-danger">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                {error}
              </p>
              <button
                type="button"
                onClick={() => setReconnectKey((key) => key + 1)}
                className="shrink-0 self-start rounded-lg border border-danger/30 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-danger/10 sm:self-auto"
              >
                Reconectar
              </button>
            </div>
          )}

          {notice && !error && (
            <div
              role="status"
              className="mb-3 rounded-2xl border border-violet/20 bg-violet/[0.07] px-3.5 py-2.5 text-[11px] leading-relaxed text-white/60"
            >
              {notice}
            </div>
          )}

          {messages.length === 0 && !streaming && (
            <div className="mb-4 flex items-start gap-3">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet/15 text-violet-soft">
                <Sparkles className="h-4 w-4" aria-hidden="true" />
              </span>
              <div className="max-w-[86%] rounded-2xl rounded-tl-md border border-white/[0.07] bg-white/[0.04] px-3.5 py-2.5">
                <p className="text-[13px] leading-relaxed text-white/70">
                  Oi! Pode perguntar sobre esta questão do jeito que preferir. Explico o raciocínio,
                  comparo as alternativas ou dou uma dica sem entregar a resposta.
                </p>
              </div>
            </div>
          )}

          <div className="space-y-3 pb-2">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex items-start gap-2.5 ${message.role === 'user' ? 'justify-end' : ''}`}
              >
                {message.role === 'tutor' && (
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet/15 text-violet-soft">
                    <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                )}
                <div
                  className={`max-w-[86%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed ${
                    message.role === 'user'
                      ? 'rounded-tr-md bg-lime/15 text-white/85'
                      : 'rounded-tl-md border border-white/[0.07] bg-white/[0.04] text-white/75'
                  }`}
                >
                  {message.text}
                </div>
              </div>
            ))}

            {streaming && (
              <div className="flex items-start gap-2.5">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet/15 text-violet-soft">
                  <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
                <div className="max-w-[86%] rounded-2xl rounded-tl-md border border-white/[0.07] bg-white/[0.04] px-3.5 py-2.5 text-[13px] leading-relaxed text-white/75">
                  {streaming}
                  <span className="ml-0.5 inline-block h-3.5 w-[2px] animate-pulse-soft bg-lime align-middle" aria-hidden="true" />
                </div>
              </div>
            )}

            {interim && (
              <div className="flex justify-end">
                <div className="max-w-[86%] rounded-2xl rounded-tr-md border border-dashed border-violet/30 px-3.5 py-2.5 text-[12px] italic leading-relaxed text-white/50">
                  {interim}…
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>

        <div className="shrink-0 border-t border-white/[0.07] px-5 pb-1 pt-2">
          <Waveform active={phase === 'listening' || phase === 'speaking'} tone={phase === 'speaking' ? 'violet' : 'lime'} />

          <div className="mt-0.5 flex items-center justify-between gap-3 pb-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white">{copy.title}</p>
              <p className="truncate text-[11px] text-white/40">{copy.hint}</p>
            </div>

            <div className="relative shrink-0">
              {phase === 'listening' && (
                <span
                  className="absolute inset-0 animate-pulse-ring rounded-full bg-lime/40"
                  aria-hidden="true"
                />
              )}
              <button
                type="button"
                onClick={handleMic}
                disabled={micDisabled}
                aria-label={micLabel}
                className={`relative flex h-[64px] w-[64px] items-center justify-center rounded-full transition active:scale-95 disabled:opacity-60 ${
                  phase === 'listening'
                    ? 'bg-danger text-ink shadow-[0_0_0_6px_rgba(251,113,133,.15)]'
                    : phase === 'thinking'
                      ? 'bg-violet text-white'
                      : phase === 'speaking'
                        ? 'bg-violet-soft text-ink'
                        : 'bg-lime text-ink shadow-glow'
                }`}
              >
                {phase === 'listening' ? (
                  <Square className="h-6 w-6" fill="currentColor" aria-hidden="true" />
                ) : phase === 'thinking' ? (
                  <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
                ) : phase === 'speaking' ? (
                  <Volume2 className="h-6 w-6" aria-hidden="true" />
                ) : (
                  <Mic className="h-6 w-6" aria-hidden="true" />
                )}
              </button>
            </div>
          </div>
        </div>

        <div className="shrink-0 border-t border-white/[0.06] px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3">
          {messages.length === 0 && !streaming && !interim && (
            <div className="mb-2 flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
              {['Explique a resposta', 'Dica sem entregar', 'Como cai no ENEM?'].map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => sendAsk(suggestion)}
                  disabled={phase === 'thinking' || phase === 'connecting'}
                  className="shrink-0 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[11px] font-medium text-white/55 transition hover:border-lime/30 hover:text-lime disabled:opacity-40"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          )}

          <form onSubmit={submitText} className="flex items-center gap-2">
            <label htmlFor="tutor-input" className="sr-only">
              Escreva sua dúvida para o tutor
            </label>
            <input
              id="tutor-input"
              ref={inputRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={
                phase === 'thinking' ? 'O tutor está respondendo…' : 'Ou escreva sua dúvida…'
              }
              autoComplete="off"
              enterKeyHint="send"
              className="field min-h-[44px] flex-1 rounded-full px-4 py-2.5 text-sm"
              aria-describedby="tutor-input-hint"
            />
            <span id="tutor-input-hint" className="sr-only">
              A pergunta será enviada ao tutor da questão atual.
            </span>
            <button
              type="submit"
              disabled={!canSendText}
              aria-label="Enviar pergunta por texto"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-lime text-ink transition hover:bg-lime-soft active:scale-95 disabled:cursor-not-allowed disabled:opacity-30"
            >
              <Send className="h-4 w-4" aria-hidden="true" />
            </button>
          </form>

          <p className="mt-2 text-center text-[10px] leading-relaxed text-white/25">
            O tutor explica com base no enunciado e no gabarito. Ele não substitui a revisão da teoria.
          </p>
        </div>
      </div>
    </div>,
    document.body,
  )
}
