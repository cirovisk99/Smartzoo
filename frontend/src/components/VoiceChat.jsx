import React, { useState, useRef, useCallback, useEffect } from 'react'
import { sendChatMessage } from '../api.js'

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

const STATUS = {
  IDLE: 'idle',
  LISTENING: 'listening',
  PROCESSING: 'processing',
  SPEAKING: 'speaking',
  ERROR: 'error',
}

const SILENCE_THRESHOLD = 12   // nível de amplitude (0-255) abaixo = silêncio
const SILENCE_DELAY_MS  = 1500 // ms de silêncio antes de parar
const MAX_RECORD_MS     = 12000 // segurança: para após 12s

function stripMarkdown(text) {
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/#{1,6}\s?/g, '')
    .replace(/`{1,3}(.*?)`{1,3}/gs, '$1')
    .replace(/^\s*[-*+]\s/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export default function VoiceChat() {
  const [status, setStatus]     = useState(STATUS.IDLE)
  const [isOpen, setIsOpen]     = useState(false)
  const [transcript, setTranscript] = useState('')
  const [response, setResponse] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  const mediaRecorderRef = useRef(null)
  const audioCtxRef      = useRef(null)
  const silenceTimerRef  = useRef(null)
  const maxTimerRef      = useRef(null)
  const chunksRef        = useRef([])

  const currentAudioRef = useRef(null)

  const stopSpeaking = useCallback(() => {
    if (currentAudioRef.current) {
      currentAudioRef.current.pause()
      currentAudioRef.current = null
    }
  }, [])

  const cleanup = useCallback(() => {
    clearTimeout(silenceTimerRef.current)
    clearTimeout(maxTimerRef.current)
    silenceTimerRef.current = null
    maxTimerRef.current = null
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
    mediaRecorderRef.current = null
    if (audioCtxRef.current) {
      audioCtxRef.current.close()
      audioCtxRef.current = null
    }
    chunksRef.current = []
  }, [])

  const close = useCallback(() => {
    stopSpeaking()
    cleanup()
    setIsOpen(false)
    setStatus(STATUS.IDLE)
    setTranscript('')
    setResponse('')
    setErrorMsg('')
  }, [stopSpeaking, cleanup])

  const speakResponse = useCallback(async (text) => {
    const clean = stripMarkdown(text)
    try {
      const res = await fetch(`${BASE_URL}/api/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: clean }),
      })
      if (!res.ok) throw new Error('TTS falhou')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      currentAudioRef.current = audio
      audio.onended = () => { URL.revokeObjectURL(url); currentAudioRef.current = null; setStatus(STATUS.IDLE) }
      audio.onerror = () => { URL.revokeObjectURL(url); currentAudioRef.current = null; setStatus(STATUS.IDLE) }
      audio.play()
    } catch {
      setStatus(STATUS.IDLE)
    }
  }, [])

  const sendToChat = useCallback(async (text) => {
    if (!text.trim()) { setStatus(STATUS.IDLE); return }
    const { data, error } = await sendChatMessage(text.trim(), true)
    if (error || !data) {
      setErrorMsg(error || 'Erro ao obter resposta.')
      setStatus(STATUS.ERROR)
      return
    }
    setResponse(data.response)
    setStatus(STATUS.SPEAKING)
    speakResponse(data.response)
  }, [speakResponse])

  const transcribeAndChat = useCallback(async (audioBlob) => {
    setStatus(STATUS.PROCESSING)
    try {
      const formData = new FormData()
      formData.append('audio', audioBlob, 'recording.webm')

      const res = await fetch(`${BASE_URL}/api/transcribe`, {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        setErrorMsg('Erro na transcrição.')
        setStatus(STATUS.ERROR)
        return
      }

      const { text } = await res.json()

      if (!text.trim()) {
        setErrorMsg('Não entendi. Tente falar mais perto do microfone.')
        setStatus(STATUS.ERROR)
        return
      }

      setTranscript(text)
      await sendToChat(text)
    } catch {
      setErrorMsg('Erro ao processar áudio.')
      setStatus(STATUS.ERROR)
    }
  }, [sendToChat])

  const startListening = useCallback(async () => {
    stopSpeaking()
    setTranscript('')
    setResponse('')
    setErrorMsg('')
    chunksRef.current = []
    setIsOpen(true)
    setStatus(STATUS.LISTENING)

    let stream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
    } catch (err) {
      setErrorMsg('Acesso ao microfone negado: ' + err.message)
      setStatus(STATUS.ERROR)
      return
    }

    // AudioContext para detecção de silêncio
    const audioCtx = new AudioContext()
    audioCtxRef.current = audioCtx
    const analyser = audioCtx.createAnalyser()
    analyser.fftSize = 256
    audioCtx.createMediaStreamSource(stream).connect(analyser)
    const dataArray = new Uint8Array(analyser.frequencyBinCount)

    // MediaRecorder
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm'

    const recorder = new MediaRecorder(stream, { mimeType })
    mediaRecorderRef.current = recorder

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data)
    }

    recorder.onstop = () => {
      stream.getTracks().forEach(t => t.stop())
      if (audioCtxRef.current) {
        audioCtxRef.current.close()
        audioCtxRef.current = null
      }
      clearTimeout(silenceTimerRef.current)
      clearTimeout(maxTimerRef.current)
      const blob = new Blob(chunksRef.current, { type: mimeType })
      transcribeAndChat(blob)
    }

    recorder.start(200)

    // Segurança: para após MAX_RECORD_MS
    maxTimerRef.current = setTimeout(() => {
      if (recorder.state === 'recording') recorder.stop()
    }, MAX_RECORD_MS)

    // Detecção de silêncio — começa após 800ms para não cortar no início
    const stopRecording = () => {
      if (recorder.state === 'recording') recorder.stop()
    }

    setTimeout(() => {
      const checkSilence = () => {
        if (recorder.state !== 'recording') return
        analyser.getByteFrequencyData(dataArray)
        const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length

        if (avg < SILENCE_THRESHOLD) {
          if (!silenceTimerRef.current) {
            silenceTimerRef.current = setTimeout(stopRecording, SILENCE_DELAY_MS)
          }
        } else {
          if (silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current)
            silenceTimerRef.current = null
          }
        }
        requestAnimationFrame(checkSilence)
      }
      checkSilence()
    }, 800)
  }, [stopSpeaking, transcribeAndChat])

  useEffect(() => {
    return () => { stopSpeaking(); cleanup() }
  }, [stopSpeaking, cleanup])

  const isListening  = status === STATUS.LISTENING
  const isProcessing = status === STATUS.PROCESSING
  const isSpeaking   = status === STATUS.SPEAKING
  const isError      = status === STATUS.ERROR
  const isIdle       = status === STATUS.IDLE

  const statusLabel = isListening  ? 'Ouvindo...'
                    : isProcessing ? 'Pensando...'
                    : isSpeaking   ? 'Respondendo...'
                    : null

  return (
    <>
      {/* Painel de conversa — à direita do card */}
      {isOpen && (
        <div style={{
          position: 'fixed',
          left: '204px',
          top: '64px',
          width: '260px',
          backgroundColor: 'rgba(18, 32, 8, 0.96)',
          borderRadius: '16px',
          border: '1px solid rgba(92, 184, 92, 0.35)',
          backdropFilter: 'blur(14px)',
          padding: '16px',
          zIndex: 50,
          boxShadow: '0 8px 40px rgba(0,0,0,0.7)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--color-lime)' }}>Juba</span>
            <button onClick={close} style={{
              background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '8px',
              width: '28px', height: '28px', cursor: 'pointer',
              color: 'rgba(255,255,255,0.8)', fontSize: '18px', lineHeight: 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }} aria-label="Fechar">×</button>
          </div>

          {statusLabel && (
            <p style={{ fontSize: '13px', color: 'var(--color-lime)', fontWeight: 600, margin: '0 0 8px 0' }}>
              {statusLabel}
            </p>
          )}

          {transcript && (
            <div style={{ marginBottom: '10px' }}>
              <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', margin: '0 0 3px 0' }}>Você disse:</p>
              <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.85)', fontStyle: 'italic', margin: 0 }}>
                "{transcript}"
              </p>
            </div>
          )}

          {response && (
            <div style={{
              backgroundColor: 'rgba(92, 184, 92, 0.1)',
              borderRadius: '10px', padding: '10px 12px',
              borderLeft: '3px solid var(--color-lime)',
            }}>
              <p style={{ fontSize: '14px', color: '#fff', lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap' }}>
                {response}
              </p>
            </div>
          )}

          {isError && errorMsg && (
            <p style={{ color: '#e74c3c', fontSize: '13px', margin: 0 }}>{errorMsg}</p>
          )}

          {isIdle && !response && !errorMsg && (
            <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.45)', margin: 0 }}>
              Pergunte sobre os animais, horários ou localização!
            </p>
          )}

          {isIdle && (response || isError) && (
            <div style={{ marginTop: '10px', textAlign: 'center' }}>
              <button onClick={startListening} style={{
                backgroundColor: 'rgba(92,184,92,0.15)',
                border: '1px solid var(--color-lime)', borderRadius: '8px',
                padding: '7px 16px', color: 'var(--color-lime)',
                fontSize: '13px', cursor: 'pointer', fontWeight: 600,
              }}>
                🎤 Fazer outra pergunta
              </button>
            </div>
          )}
        </div>
      )}

      {/* Card do mascote */}
      <div style={{
        position: 'fixed', left: '16px', top: '64px', width: '172px',
        backgroundColor: 'rgba(18, 32, 8, 0.92)',
        borderRadius: '20px',
        border: `2px solid ${isListening ? '#e74c3c' : 'rgba(92,184,92,0.5)'}`,
        backdropFilter: 'blur(12px)',
        boxShadow: isListening
          ? '0 0 0 4px rgba(192,57,43,0.25), 0 8px 32px rgba(0,0,0,0.6)'
          : '0 8px 32px rgba(0,0,0,0.6)',
        zIndex: 50,
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        padding: '6px 8px 12px', gap: '6px',
        animation: isListening ? 'mic-pulse 1.4s ease-in-out infinite' : 'none',
        transition: 'border-color 0.2s',
      }}>
        <img
          src="/mascote-agente.png"
          alt="Juba, mascote do SmartZoo"
          style={{
            width: '152px', height: '152px',
            objectFit: 'cover', objectPosition: 'top',
            borderRadius: '14px',
            filter: isListening ? 'drop-shadow(0 0 8px rgba(231,76,60,0.6))' : 'none',
            transition: 'filter 0.3s',
          }}
        />
        <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--color-lime)' }}>Juba</span>

        {statusLabel ? (
          <span style={{
            fontSize: '12px', fontWeight: 600, textAlign: 'center',
            color: isListening ? '#e74c3c' : 'var(--color-lime)',
          }}>
            {statusLabel}
          </span>
        ) : (
          <button
            onClick={isIdle ? startListening : undefined}
            disabled={!isIdle}
            style={{
              backgroundColor: isIdle ? 'var(--color-lime)' : 'rgba(92,184,92,0.3)',
              border: 'none', borderRadius: '12px', padding: '8px 10px',
              color: '#fff', fontSize: '12px', fontWeight: 700,
              cursor: isIdle ? 'pointer' : 'default',
              textAlign: 'center', lineHeight: 1.3, width: '100%',
              transition: 'background-color 0.2s',
            }}
            aria-label="Toque para pedir dicas para o Juba"
          >
            🎤 Toque para pedir dicas para o Juba
          </button>
        )}
      </div>
    </>
  )
}
