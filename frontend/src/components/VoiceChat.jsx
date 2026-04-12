import React, { useState, useRef, useCallback, useEffect } from 'react'
import { sendChatMessage } from '../api.js'

const STATUS = {
  IDLE: 'idle',
  LISTENING: 'listening',
  PROCESSING: 'processing',
  SPEAKING: 'speaking',
  ERROR: 'error',
}

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
  const [status, setStatus] = useState(STATUS.IDLE)
  const [isOpen, setIsOpen] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [response, setResponse] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  const recognitionRef = useRef(null)
  const transcriptRef = useRef('')

  const stopSpeaking = useCallback(() => {
    if (window.speechSynthesis) window.speechSynthesis.cancel()
  }, [])

  const close = useCallback(() => {
    stopSpeaking()
    if (recognitionRef.current) {
      recognitionRef.current.abort()
      recognitionRef.current = null
    }
    setIsOpen(false)
    setStatus(STATUS.IDLE)
    setTranscript('')
    setResponse('')
    setErrorMsg('')
    transcriptRef.current = ''
  }, [stopSpeaking])

  const speakResponse = useCallback((text) => {
    if (!window.speechSynthesis) { setStatus(STATUS.IDLE); return }
    const clean = stripMarkdown(text)
    const utterance = new SpeechSynthesisUtterance(clean)
    utterance.lang = 'pt-BR'
    utterance.rate = 1.1    // mais animado
    utterance.pitch = 1.5   // mais agudo, infantil
    utterance.volume = 1.0

    // Prefere voz feminina pt-BR (soa mais como personagem animado)
    const voices = window.speechSynthesis.getVoices()
    const ptFemale = voices.find(v => v.lang.startsWith('pt') && /female|feminino|woman/i.test(v.name))
    const ptAny    = voices.find(v => v.lang.startsWith('pt'))
    if (ptFemale) utterance.voice = ptFemale
    else if (ptAny) utterance.voice = ptAny

    utterance.onend = () => setStatus(STATUS.IDLE)
    utterance.onerror = () => setStatus(STATUS.IDLE)
    window.speechSynthesis.speak(utterance)
  }, [])

  const sendTranscript = useCallback(async (text) => {
    if (!text.trim()) { setStatus(STATUS.IDLE); return }
    setStatus(STATUS.PROCESSING)
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

  const startListening = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      setErrorMsg('Reconhecimento de voz não suportado. Use Chrome ou Edge.')
      setStatus(STATUS.ERROR)
      setIsOpen(true)
      return
    }
    stopSpeaking()
    setTranscript('')
    setResponse('')
    setErrorMsg('')
    transcriptRef.current = ''
    setIsOpen(true)
    setStatus(STATUS.LISTENING)

    const recognition = new SpeechRecognition()
    recognition.lang = 'pt-BR'
    recognition.continuous = false
    recognition.interimResults = true
    recognitionRef.current = recognition

    recognition.onresult = (event) => {
      let final = ''
      let interim = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript
        if (event.results[i].isFinal) final += t
        else interim += t
      }
      const text = final || interim
      transcriptRef.current = text
      setTranscript(text)
    }

    recognition.onend = () => {
      recognitionRef.current = null
      sendTranscript(transcriptRef.current)
    }

    recognition.onerror = (event) => {
      recognitionRef.current = null
      setErrorMsg(`Erro: ${event.error}`)
      setStatus(STATUS.ERROR)
    }

    try { recognition.start() } catch {
      setErrorMsg('Não foi possível iniciar o microfone.')
      setStatus(STATUS.ERROR)
    }
  }, [stopSpeaking, sendTranscript])

  useEffect(() => {
    return () => {
      stopSpeaking()
      if (recognitionRef.current) recognitionRef.current.abort()
    }
  }, [stopSpeaking])

  const isListening   = status === STATUS.LISTENING
  const isProcessing  = status === STATUS.PROCESSING
  const isSpeaking    = status === STATUS.SPEAKING
  const isError       = status === STATUS.ERROR
  const isIdle        = status === STATUS.IDLE

  const statusLabel = isListening  ? 'Ouvindo...'
                    : isProcessing ? 'Pensando...'
                    : isSpeaking   ? 'Respondendo...'
                    : null

  return (
    <>
      {/* Conversation panel — à direita do card */}
      {isOpen && (
        <div
          style={{
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
          }}
        >
          {/* Header do painel */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--color-lime)' }}>
              Juba
            </span>
            <button
              onClick={close}
              style={{
                background: 'rgba(255,255,255,0.1)',
                border: 'none',
                borderRadius: '8px',
                width: '28px',
                height: '28px',
                cursor: 'pointer',
                color: 'rgba(255,255,255,0.8)',
                fontSize: '18px',
                lineHeight: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              aria-label="Fechar"
            >×</button>
          </div>

          {/* Status */}
          {statusLabel && (
            <p style={{ fontSize: '13px', color: 'var(--color-lime)', fontWeight: 600, margin: '0 0 8px 0' }}>
              {statusLabel}
            </p>
          )}

          {/* Transcript */}
          {transcript && (
            <div style={{ marginBottom: '10px' }}>
              <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', margin: '0 0 3px 0' }}>Você disse:</p>
              <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.85)', fontStyle: 'italic', margin: 0 }}>
                "{transcript}"
              </p>
            </div>
          )}

          {/* Resposta */}
          {response && (
            <div style={{
              backgroundColor: 'rgba(92, 184, 92, 0.1)',
              borderRadius: '10px',
              padding: '10px 12px',
              borderLeft: '3px solid var(--color-lime)',
            }}>
              <p style={{ fontSize: '14px', color: '#fff', lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap' }}>
                {response}
              </p>
            </div>
          )}

          {/* Erro */}
          {isError && errorMsg && (
            <p style={{ color: '#e74c3c', fontSize: '13px', margin: 0 }}>{errorMsg}</p>
          )}

          {/* Hint inicial */}
          {isIdle && !response && !errorMsg && (
            <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.45)', margin: 0 }}>
              Pergunte sobre os animais, horários ou localização no zoo!
            </p>
          )}

          {/* Botão nova pergunta */}
          {isIdle && (response || isError) && (
            <div style={{ marginTop: '10px', textAlign: 'center' }}>
              <button
                onClick={startListening}
                style={{
                  backgroundColor: 'rgba(92,184,92,0.15)',
                  border: '1px solid var(--color-lime)',
                  borderRadius: '8px',
                  padding: '7px 16px',
                  color: 'var(--color-lime)',
                  fontSize: '13px',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                🎤 Fazer outra pergunta
              </button>
            </div>
          )}
        </div>
      )}

      {/* Card do mascote — canto superior esquerdo */}
      <div
        style={{
          position: 'fixed',
          left: '16px',
          top: '64px',
          width: '172px',
          backgroundColor: 'rgba(18, 32, 8, 0.92)',
          borderRadius: '20px',
          border: `2px solid ${isListening ? '#e74c3c' : 'rgba(92,184,92,0.5)'}`,
          backdropFilter: 'blur(12px)',
          boxShadow: isListening
            ? '0 0 0 4px rgba(192,57,43,0.25), 0 8px 32px rgba(0,0,0,0.6)'
            : '0 8px 32px rgba(0,0,0,0.6)',
          zIndex: 50,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '6px 8px 12px',
          gap: '6px',
          animation: isListening ? 'mic-pulse 1.4s ease-in-out infinite' : 'none',
          transition: 'border-color 0.2s',
        }}
      >
        {/* Imagem do mascote */}
        <img
          src="/mascote-agente.png"
          alt="Juba, mascote do SmartZoo"
          style={{
            width: '152px',
            height: '152px',
            objectFit: 'cover',
            objectPosition: 'top',
            borderRadius: '14px',
            filter: isListening ? 'drop-shadow(0 0 8px rgba(231,76,60,0.6))' : 'none',
            transition: 'filter 0.3s',
          }}
        />

        {/* Nome */}
        <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--color-lime)' }}>
          Juba
        </span>

        {/* Indicador de status ou botão */}
        {statusLabel ? (
          <span style={{
            fontSize: '12px',
            fontWeight: 600,
            color: isListening ? '#e74c3c' : 'var(--color-lime)',
            textAlign: 'center',
          }}>
            {statusLabel}
          </span>
        ) : (
          <button
            onClick={isIdle ? startListening : undefined}
            disabled={!isIdle}
            style={{
              backgroundColor: isIdle ? 'var(--color-lime)' : 'rgba(92,184,92,0.3)',
              border: 'none',
              borderRadius: '12px',
              padding: '8px 10px',
              color: '#fff',
              fontSize: '12px',
              fontWeight: 700,
              cursor: isIdle ? 'pointer' : 'default',
              textAlign: 'center',
              lineHeight: 1.3,
              width: '100%',
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
