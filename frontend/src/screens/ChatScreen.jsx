import React, { useState, useEffect, useRef, useCallback } from 'react'
import { sendChatMessage } from '../api.js'
import BackButton from '../components/BackButton.jsx'

const SUGGESTIONS = [
  'Qual animal está mais ativo agora?',
  'Me fale sobre os leões',
  'Qual o melhor horário para ver as girafas?',
  'Quais animais estão dormindo agora?',
  'Me dê curiosidades sobre elefantes',
]

const WELCOME_MESSAGE = {
  id: 'welcome',
  role: 'assistant',
  text: 'Olá! Sou o assistente do SmartZoo 🦁 Posso responder perguntas sobre os animais do zoológico, horários de atividade e muito mais. Como posso ajudar?',
  timestamp: new Date(),
}

function createMessage(role, text) {
  return { id: `${Date.now()}-${Math.random()}`, role, text, timestamp: new Date() }
}

export default function ChatScreen() {
  const [messages, setMessages] = useState([WELCOME_MESSAGE])
  const [inputText, setInputText] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => { scrollToBottom() }, [messages, scrollToBottom])

  const sendMessage = useCallback(async (text) => {
    const trimmed = text.trim()
    if (!trimmed || isLoading) return

    setError(null)
    setInputText('')
    setMessages((prev) => [...prev, createMessage('user', trimmed)])
    setIsLoading(true)

    const { data, error: err } = await sendChatMessage(trimmed)
    setIsLoading(false)

    if (err) {
      setError(err)
      setMessages((prev) => [...prev, createMessage('assistant', 'Desculpe, não consegui obter uma resposta. Tente novamente.')])
    } else {
      setMessages((prev) => [...prev, createMessage('assistant', data?.response || 'Sem resposta do servidor.')])
    }
  }, [isLoading])

  const handleSubmit = (e) => { e.preventDefault(); sendMessage(inputText) }
  const handleSuggestion = (s) => sendMessage(s)
  const clearConversation = () => { setMessages([WELCOME_MESSAGE]); setError(null); setInputText('') }

  return (
    <div className="flex flex-col h-full zoo-bg-texture" style={{ backgroundColor: 'var(--color-bg)' }}>

      {/* Header */}
      <header
        className="flex items-center gap-4 px-6 py-4 flex-shrink-0"
        style={{
          backgroundColor: 'var(--color-header)',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
        }}
      >
        <BackButton />
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-white">Chat com IA</h1>
          <p style={{ fontSize: '14px', color: 'var(--color-text-muted)' }}>Pergunte sobre os animais do zoo</p>
        </div>
        <button
          onClick={clearConversation}
          className="flex items-center gap-2 px-4 py-2 zoo-btn-ghost touch-target"
          style={{ minHeight: '48px', fontSize: '15px' }}
          aria-label="Limpar conversa"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
          </svg>
          Limpar
        </button>
      </header>

      {/* Messages area */}
      <div
        className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3"
        style={{ scrollBehavior: 'smooth' }}
      >
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}

        {isLoading && (
          <div className="flex items-start gap-3">
            <div
              className="w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center"
              style={{ backgroundColor: 'var(--color-orange)' }}
            >
              <span className="text-white text-lg">🦁</span>
            </div>
            <div
              className="px-4 py-3 rounded-2xl rounded-tl-sm zoo-card"
            >
              <TypingDots />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggestion chips */}
      {messages.length <= 1 && !isLoading && (
        <div className="px-4 pb-2 flex-shrink-0">
          <p style={{ fontSize: '15px', color: 'var(--color-text-muted)', marginBottom: '8px' }}>Sugestões:</p>
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => handleSuggestion(s)}
                className="px-4 py-2 rounded-full font-medium transition-colors touch-target"
                style={{
                  backgroundColor: 'rgba(92,184,92,0.15)',
                  color: '#a8d8a0',
                  border: '1.5px solid rgba(92,184,92,0.4)',
                  fontSize: '15px',
                  minHeight: '44px',
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div
          className="px-4 py-2 mx-4 mb-2 rounded-lg flex-shrink-0"
          style={{ backgroundColor: 'rgba(192,57,43,0.3)', border: '1px solid rgba(192,57,43,0.6)', fontSize: '15px', color: '#ff9999' }}
          role="alert"
        >
          {error}
        </div>
      )}

      {/* Input form */}
      <form
        onSubmit={handleSubmit}
        className="flex gap-3 px-4 py-3 flex-shrink-0"
        style={{
          backgroundColor: 'var(--color-header)',
          borderTop: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <input
          ref={inputRef}
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Digite sua pergunta..."
          disabled={isLoading}
          className="flex-1 px-4 py-3 rounded-xl outline-none"
          style={{
            border: '2px solid rgba(255,255,255,0.15)',
            fontSize: '17px',
            backgroundColor: isLoading ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.1)',
            color: '#ffffff',
            minHeight: '52px',
            transition: 'border-color 0.2s',
          }}
          onFocus={(e) => { e.target.style.borderColor = 'var(--color-lime)' }}
          onBlur={(e) => { e.target.style.borderColor = 'rgba(255,255,255,0.15)' }}
          aria-label="Mensagem para o assistente"
        />
        <button
          type="submit"
          disabled={isLoading || !inputText.trim()}
          className="px-5 py-3 rounded-xl font-bold text-white transition-colors touch-target flex items-center gap-2"
          style={{
            backgroundColor: isLoading || !inputText.trim() ? 'rgba(92,184,92,0.4)' : 'var(--color-lime)',
            minHeight: '52px',
            fontSize: '17px',
            cursor: isLoading || !inputText.trim() ? 'not-allowed' : 'pointer',
          }}
          aria-label="Enviar mensagem"
        >
          {isLoading ? (
            <svg className="animate-spin" xmlns="http://www.w3.org/2000/svg" width="22" height="22" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="white" strokeWidth="4" />
              <path className="opacity-75" fill="white" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
            </svg>
          )}
          Enviar
        </button>
      </form>
    </div>
  )
}

function MessageBubble({ message }) {
  const isUser = message.role === 'user'

  return (
    <div className={`flex items-start gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      {/* Avatar */}
      <div
        className="w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center"
        style={{ backgroundColor: isUser ? 'rgba(255,255,255,0.15)' : 'var(--color-orange)' }}
      >
        {isUser ? (
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" fill="rgba(255,255,255,0.8)" viewBox="0 0 24 24">
            <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z" />
          </svg>
        ) : (
          <span className="text-white text-lg">🦁</span>
        )}
      </div>

      {/* Bubble */}
      <div
        className={`max-w-xs rounded-2xl px-4 py-3 ${isUser ? 'rounded-tr-sm' : 'rounded-tl-sm'}`}
        style={{
          backgroundColor: isUser ? 'var(--color-lime)' : 'var(--color-surface)',
          color: '#ffffff',
          border: isUser ? 'none' : '1px solid var(--color-card-border)',
          fontSize: '17px',
          lineHeight: '1.5',
          maxWidth: '70%',
          wordBreak: 'break-word',
          boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        }}
      >
        <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{message.text}</p>
        <span
          style={{
            fontSize: '11px',
            opacity: 0.65,
            display: 'block',
            marginTop: '4px',
            textAlign: isUser ? 'right' : 'left',
          }}
        >
          {message.timestamp.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    </div>
  )
}

function TypingDots() {
  return (
    <div className="flex items-center gap-1.5" style={{ height: '24px' }}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="rounded-full"
          style={{
            width: '8px',
            height: '8px',
            backgroundColor: 'rgba(255,255,255,0.5)',
            animation: `typing-dot 1.2s ease-in-out ${i * 0.2}s infinite`,
          }}
        />
      ))}
    </div>
  )
}
