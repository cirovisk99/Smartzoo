import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchStatus } from '../api.js'

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
    <div
      className="flex flex-col h-full"
      style={{ backgroundColor: 'var(--color-bg)' }}
    >
      {/* Header */}
      <header
        className="flex items-center justify-between px-6 py-4 shadow-md flex-shrink-0"
        style={{ backgroundColor: 'var(--color-primary)' }}
      >
        <div className="flex items-center gap-3">
          <span className="text-3xl">🦁</span>
          <h1 className="text-2xl font-bold text-white tracking-wide">SmartZoo</h1>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => navigate('/chat')}
            className="flex items-center gap-2 px-4 py-2 rounded-xl font-semibold text-white transition-colors touch-target"
            style={{
              backgroundColor: 'rgba(255,255,255,0.15)',
              border: '2px solid rgba(255,255,255,0.4)',
              minHeight: '48px',
              fontSize: '18px',
            }}
            aria-label="Chat com IA"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
            Chat AI
          </button>
          <button
            onClick={() => navigate('/route')}
            className="flex items-center gap-2 px-4 py-2 rounded-xl font-semibold text-white transition-colors touch-target"
            style={{
              backgroundColor: 'rgba(255,255,255,0.15)',
              border: '2px solid rgba(255,255,255,0.4)',
              minHeight: '48px',
              fontSize: '18px',
            }}
            aria-label="Sugestão de Roteiro"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
            </svg>
            Roteiro
          </button>
        </div>
      </header>

      {/* Offline banner */}
      {error && (
        <div
          className="flex items-center gap-3 px-6 py-3 text-white font-medium flex-shrink-0"
          style={{ backgroundColor: '#D32F2F', fontSize: '18px' }}
          role="alert"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          {error} — Tentando reconectar...
        </div>
      )}

      {/* Map area */}
      <main className="flex-1 relative overflow-hidden p-4">
        <div
          className="relative w-full h-full rounded-2xl overflow-hidden shadow-inner"
          style={{ backgroundColor: '#c8e6c9' }}
        >
          {/* Map background — placeholder with zoo pattern */}
          <div
            className="absolute inset-0"
            style={{
              background: 'linear-gradient(135deg, #c8e6c9 0%, #a5d6a7 30%, #81c784 60%, #c8e6c9 100%)',
            }}
          >
            {/* Decorative paths */}
            <svg className="absolute inset-0 w-full h-full opacity-20" xmlns="http://www.w3.org/2000/svg">
              <path d="M 10% 50% Q 30% 20%, 50% 50% T 90% 50%" stroke="#2E7D32" strokeWidth="4" fill="none" />
              <path d="M 50% 10% Q 70% 30%, 50% 50% T 50% 90%" stroke="#2E7D32" strokeWidth="4" fill="none" />
              <rect x="5%" y="5%" width="20%" height="15%" rx="8" fill="rgba(46,125,50,0.1)" stroke="#2E7D32" strokeWidth="1" />
              <rect x="75%" y="5%" width="20%" height="15%" rx="8" fill="rgba(46,125,50,0.1)" stroke="#2E7D32" strokeWidth="1" />
              <rect x="5%" y="80%" width="20%" height="15%" rx="8" fill="rgba(46,125,50,0.1)" stroke="#2E7D32" strokeWidth="1" />
              <rect x="75%" y="80%" width="20%" height="15%" rx="8" fill="rgba(46,125,50,0.1)" stroke="#2E7D32" strokeWidth="1" />
              <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" fill="rgba(46,125,50,0.15)" fontSize="64" fontFamily="Inter, sans-serif" fontWeight="bold">MAPA DO ZOO</text>
            </svg>
          </div>

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
              <div className="flex flex-col items-center gap-3 text-green-800 opacity-60">
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
        className="flex items-center justify-between px-6 py-2 flex-shrink-0"
        style={{ backgroundColor: 'var(--color-surface)', borderTop: '1px solid #e0e0e0', fontSize: '16px', color: '#757575' }}
      >
        <span>{cages.length} jaulas monitoradas</span>
        {lastUpdate && (
          <span>Atualizado: {lastUpdate.toLocaleTimeString('pt-BR')}</span>
        )}
        <div className="flex items-center gap-2">
          <span
            className="w-2.5 h-2.5 rounded-full"
            style={{ backgroundColor: error ? '#D32F2F' : 'var(--color-active)' }}
          />
          <span>{error ? 'Offline' : 'Online'}</span>
        </div>
      </footer>
    </div>
  )
}

function CageMarker({ cage, onClick }) {
  const isActive = cage.status === 'active'
  const left = `${(cage.location_x ?? 0.5) * 100}%`
  const top = `${(cage.location_y ?? 0.5) * 100}%`

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
        className={`relative flex items-center justify-center rounded-full shadow-lg ${isActive ? 'pulse-active' : ''}`}
        style={{
          width: '36px',
          height: '36px',
          backgroundColor: isActive ? 'var(--color-active)' : 'var(--color-inactive)',
          border: '3px solid white',
          boxShadow: isActive
            ? '0 2px 8px rgba(76,175,80,0.5)'
            : '0 2px 8px rgba(0,0,0,0.2)',
        }}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="white" viewBox="0 0 24 24">
          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
        </svg>
      </span>

      {/* Label */}
      <span
        className="mt-1 font-semibold text-center leading-tight"
        style={{
          fontSize: '13px',
          color: 'var(--color-text)',
          backgroundColor: 'rgba(255,255,255,0.9)',
          borderRadius: '4px',
          padding: '1px 4px',
          maxWidth: '80px',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
        }}
      >
        {cage.animal_name}
      </span>
    </button>
  )
}
