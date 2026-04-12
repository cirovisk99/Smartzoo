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
    utterance.rate = 0.95

    // Pick a Portuguese voice if available
    const voices = window.speechSynthesis.getVoices()
    const ptVoice = voices.find(v => v.lang.startsWith('pt'))
    if (ptVoice) utterance.voice = ptVoice

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
      if (event.error === 'no-speech') {
        setStatus(STATUS.IDLE)
      } else if (event.error === 'not-allowed') {
        setErrorMsg('Acesso ao microfone negado. Verifique as permissões do navegador.')
        setStatus(STATUS.ERROR)
      } else {
        setErrorMsg('Erro no microfone. Tente novamente.')
        setStatus(STATUS.ERROR)
      }
    }

    try {
      recognition.start()
    } catch {
      setErrorMsg('Não foi possível iniciar o microfone.')
      setStatus(STATUS.ERROR)
    }
  }, [stopSpeaking, sendTranscript])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopSpeaking()
      if (recognitionRef.current) recognitionRef.current.abort()
    }
  }, [stopSpeaking])

  const isListening = status === STATUS.LISTENING
  const isProcessing = status === STATUS.PROCESSING
  const isSpeaking = status === STATUS.SPEAKING
  const isError = status === STATUS.ERROR

  const micClickHandler = () => {
    if (isListening || isProcessing) return
    startListening()
  }

  return (
    <>
      {/* Conversation panel */}
      {isOpen && (
        <div
          style={{
            position: 'fixed',
            bottom: '132px',
            left: '16px',
            right: '16px',
            backgroundColor: 'rgba(18, 32, 8, 0.96)',
            borderRadius: '16px',
            border: '1px solid rgba(92, 184, 92, 0.35)',
            backdropFilter: 'blur(14px)',
            padding: '16px',
            zIndex: 50,
            boxShadow: '0 8px 40px rgba(0,0,0,0.7)',
            maxHeight: '260px',
            overflowY: 'auto',
          }}
        >
          {/* Panel header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '16px', fontWeight: 700, color: 'var(--color-lime)' }}>
                Guia Virtual
              </span>
              {isListening && (
                <span style={{ fontSize: '13px', color: '#e74c3c', fontWeight: 600, animation: 'blink 1s step-start infinite' }}>
                  ● Ouvindo...
                </span>
              )}
              {isProcessing && (
                <span style={{ fontSize: '13px', color: '#f39c12', fontWeight: 600 }}>
                  ⟳ Processando...
                </span>
              )}
              {isSpeaking && (
                <span style={{ fontSize: '13px', color: 'var(--color-lime)', fontWeight: 600 }}>
                  ◆ Respondendo...
                </span>
              )}
            </div>
            <button
              onClick={close}
              style={{
                background: 'rgba(255,255,255,0.1)',
                border: 'none',
                borderRadius: '8px',
                width: '32px',
                height: '32px',
                cursor: 'pointer',
                color: 'rgba(255,255,255,0.8)',
                fontSize: '20px',
                lineHeight: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              aria-label="Fechar guia de voz"
            >
              ×
            </button>
          </div>

          {/* User transcript */}
          {transcript && (
            <div style={{ marginBottom: '10px' }}>
              <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.45)', margin: '0 0 3px 0' }}>
                Você disse:
              </p>
              <p style={{ fontSize: '15px', color: 'rgba(255,255,255,0.85)', fontStyle: 'italic', margin: 0 }}>
                "{transcript}"
              </p>
            </div>
          )}

          {/* AI response */}
          {response && (
            <div
              style={{
                backgroundColor: 'rgba(92, 184, 92, 0.1)',
                borderRadius: '10px',
                padding: '12px',
                borderLeft: '3px solid var(--color-lime)',
                marginBottom: isError ? '10px' : 0,
              }}
            >
              <p style={{ fontSize: '15px', color: '#fff', lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap' }}>
                {response}
              </p>
            </div>
          )}

          {/* Error */}
          {isError && errorMsg && (
            <p style={{ color: '#e74c3c', fontSize: '14px', margin: 0 }}>{errorMsg}</p>
          )}

          {/* Idle hint (no response yet) */}
          {status === STATUS.IDLE && !response && !errorMsg && (
            <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.45)', margin: 0 }}>
              Toque no microfone e faça uma pergunta sobre os animais.
            </p>
          )}

          {/* Ask again button after idle */}
          {status === STATUS.IDLE && (response || isError) && (
            <div style={{ marginTop: '12px', textAlign: 'center' }}>
              <button
                onClick={startListening}
                style={{
                  backgroundColor: 'rgba(92,184,92,0.15)',
                  border: '1px solid var(--color-lime)',
                  borderRadius: '8px',
                  padding: '8px 20px',
                  color: 'var(--color-lime)',
                  fontSize: '14px',
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

      {/* Floating mic button */}
      <button
        onClick={micClickHandler}
        style={{
          position: 'fixed',
          bottom: '56px',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '68px',
          height: '68px',
          borderRadius: '50%',
          border: `3px solid ${isListening ? 'rgba(231,76,60,0.6)' : 'rgba(255,255,255,0.3)'}`,
          cursor: isListening || isProcessing ? 'default' : 'pointer',
          zIndex: 50,
          backgroundColor: isListening
            ? '#c0392b'
            : isProcessing
            ? '#e67e22'
            : 'var(--color-lime)',
          boxShadow: isListening
            ? '0 0 0 8px rgba(192,57,43,0.25), 0 4px 20px rgba(0,0,0,0.5)'
            : '0 4px 20px rgba(0,0,0,0.5)',
          animation: isListening ? 'mic-pulse 1.4s ease-in-out infinite' : 'none',
          transition: 'background-color 0.2s, box-shadow 0.2s',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        aria-label={isListening ? 'Ouvindo...' : 'Falar com guia virtual'}
        title={isListening ? 'Ouvindo...' : 'Toque para falar com o Guia Virtual'}
      >
        {isProcessing ? (
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
            <circle
              cx="12" cy="12" r="9"
              stroke="white" strokeWidth="2.5"
              strokeDasharray="28 14"
              style={{ animation: 'spin 0.9s linear infinite', transformOrigin: '50% 50%' }}
            />
          </svg>
        ) : isSpeaking ? (
          <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="white">
            <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06C18.01 19.86 21 16.28 21 12c0-4.28-2.99-7.86-7-8.77z"/>
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="white">
            <path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z"/>
          </svg>
        )}
      </button>

      {/* Label below mic */}
      {!isOpen && (
        <div
          style={{
            position: 'fixed',
            bottom: '38px',
            left: '50%',
            transform: 'translateX(-50%)',
            fontSize: '11px',
            color: 'rgba(255,255,255,0.5)',
            whiteSpace: 'nowrap',
            zIndex: 50,
            pointerEvents: 'none',
          }}
        >
          Guia Virtual
        </div>
      )}
    </>
  )
}
