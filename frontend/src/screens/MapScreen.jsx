import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchStatus } from '../api.js'
import VoiceChat from '../components/VoiceChat.jsx'

const POLLING_INTERVAL_MS = 5000

export default function MapScreen() {
  const navigate = useNavigate()
  const [cages, setCages] = useState([])
  const [error, setError] = useState(null)
  const [lastUpdate, setLastUpdate] = useState(null)

  const loadStatus = useCallback(async () => {
    const { data, error: err } = await fetchStatus()
    if (err) {
      setError(err)
    } else {
      setError(null)
      setCages(data || [])
      setLastUpdate(new Date())
    }
  }, [])

  useEffect(() => {
    loadStatus()
    const interval = setInterval(loadStatus, POLLING_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [loadStatus])

  return (
    <div className="flex flex-col h-full zoo-bg-texture" style={{ backgroundColor: 'var(--color-bg)' }}>

      {/* Header */}
      <header
        className="flex items-center justify-between px-4 py-2 flex-shrink-0"
        style={{
          backgroundColor: 'var(--color-header)',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
          minHeight: '56px',
        }}
      >
        {/* Logo Zoo SP */}
        <img
          src="/logo-principal.svg"
          alt="Zoo São Paulo"
          style={{ height: '38px', width: 'auto' }}
        />

        {/* Nav buttons */}
        <div className="flex gap-2">
          <button
            onClick={() => navigate('/route')}
            className="flex items-center gap-2 px-3 py-2 zoo-btn-lime touch-target"
            style={{ minHeight: '44px', fontSize: '15px' }}
            aria-label="Sugestão de Roteiro"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
            </svg>
            Roteiro
          </button>
        </div>
      </header>

      {/* Offline banner */}
      {error && (
        <div
          className="flex items-center gap-3 px-6 py-3 text-white font-semibold flex-shrink-0"
          style={{ backgroundColor: '#c0392b', fontSize: '17px' }}
          role="alert"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          {error} — Tentando reconectar...
        </div>
      )}

      {/* Map area */}
      <main className="flex-1 relative overflow-hidden px-3 pb-3">
        <div
          className="relative w-full h-full rounded-2xl overflow-hidden"
          style={{
            border: '1px solid rgba(255,255,255,0.1)',
            boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
            backgroundColor: '#4a5c2a',
          }}
        >
          {/* Mapa oficial Zoo SP como fundo */}
          <img
            src="/mapa-zoo.png"
            alt="Mapa do Zoo São Paulo"
            className="absolute inset-0 w-full h-full"
            style={{ objectFit: 'contain', objectPosition: 'center' }}
          />

          {/* Cage markers */}
          {cages.map((cage) => (
            <CageMarker
              key={cage.cage_id}
              cage={cage}
              onClick={() => navigate(`/cage/${cage.cage_id}`)}
            />
          ))}

          {/* Empty state */}
          {cages.length === 0 && !error && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex flex-col items-center gap-3" style={{ color: 'rgba(255,255,255,0.5)' }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                </svg>
                <span className="text-xl font-medium">Carregando jaulas...</span>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer
        className="flex items-center justify-between px-4 py-1.5 flex-shrink-0"
        style={{
          backgroundColor: 'var(--color-header)',
          borderTop: '1px solid rgba(255,255,255,0.08)',
          fontSize: '13px',
          color: 'var(--color-text-muted)',
        }}
      >
        <span>{cages.length} jaulas monitoradas</span>
        {lastUpdate && (
          <span>Atualizado: {lastUpdate.toLocaleTimeString('pt-BR')}</span>
        )}
        <div className="flex items-center gap-2">
          <span
            className="w-2.5 h-2.5 rounded-full"
            style={{ backgroundColor: error ? '#c0392b' : 'var(--color-lime)' }}
          />
          <span>{error ? 'Offline' : 'Online'}</span>
        </div>
      </footer>

      {/* Voice chat — floating mic + panel */}
      <VoiceChat />
    </div>
  )
}

function CageMarker({ cage, onClick }) {
  const isActive = cage.status === 'active'
  const left = `${(cage.location_x ?? 0.5) * 100}%`
  const top  = `${(cage.location_y ?? 0.5) * 100}%`

  return (
    <button
      onClick={onClick}
      className="absolute flex flex-col items-center"
      style={{
        left,
        top,
        transform: 'translate(-50%, -50%)',
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: '4px',
        zIndex: 10,
        minWidth: '48px',
        minHeight: '48px',
        justifyContent: 'center',
      }}
      aria-label={`Jaula: ${cage.animal_name}`}
    >
      {/* Marker circle */}
      <span
        className="relative flex items-center justify-center rounded-full"
        style={{
          width: '40px',
          height: '40px',
          backgroundColor: isActive ? 'var(--color-lime)' : '#5a5a72',
          border: `3px solid ${isActive ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.4)'}`,
          boxShadow: isActive
            ? '0 0 12px rgba(92,184,92,0.7), 0 2px 8px rgba(0,0,0,0.4)'
            : '0 2px 8px rgba(0,0,0,0.4)',
          opacity: isActive ? 1 : 0.75,
        }}
      >
        {isActive ? (
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="white" viewBox="0 0 24 24">
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
          </svg>
        ) : (
          <span style={{ fontSize: '16px', lineHeight: 1 }}>💤</span>
        )}
      </span>

      {/* Label */}
      <span
        className="mt-1 font-bold text-center leading-tight"
        style={{
          fontSize: '12px',
          color: isActive ? '#ffffff' : 'rgba(255,255,255,0.6)',
          backgroundColor: 'rgba(0,0,0,0.65)',
          borderRadius: '6px',
          padding: '2px 6px',
          maxWidth: '84px',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          backdropFilter: 'blur(2px)',
        }}
      >
        {cage.animal_name}
      </span>
    </button>
  )
}
