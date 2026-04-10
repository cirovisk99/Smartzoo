import React, { useState, useEffect, useCallback } from 'react'
import { fetchRoute } from '../api.js'
import BackButton from '../components/BackButton.jsx'
import StatusBadge from '../components/StatusBadge.jsx'
import { useNavigate } from 'react-router-dom'

const POLLING_INTERVAL_MS = 5 * 60 * 1000

export default function RouteScreen() {
  const navigate = useNavigate()
  const [route, setRoute] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastUpdate, setLastUpdate] = useState(null)

  const loadRoute = useCallback(async () => {
    setError(null)
    const { data, error: err } = await fetchRoute()
    if (err) {
      setError(err)
    } else {
      setRoute(data || [])
      setLastUpdate(new Date())
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    loadRoute()
    const interval = setInterval(loadRoute, POLLING_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [loadRoute])

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
          <h1 className="text-2xl font-bold text-white">Roteiro Sugerido</h1>
          {lastUpdate && (
            <p style={{ fontSize: '14px', color: 'var(--color-text-muted)' }}>
              Atualizado: {lastUpdate.toLocaleTimeString('pt-BR')} · Próxima em 5 min
            </p>
          )}
        </div>
        <button
          onClick={() => { setLoading(true); loadRoute() }}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 zoo-btn-ghost touch-target"
          style={{
            minHeight: '48px',
            fontSize: '15px',
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.6 : 1,
          }}
          aria-label="Atualizar Roteiro"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
            className={loading ? 'animate-spin' : ''}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
          </svg>
          Atualizar
        </button>
      </header>

      {/* Error */}
      {error && (
        <div
          className="flex items-center gap-3 px-6 py-3 text-white font-semibold flex-shrink-0"
          style={{ backgroundColor: '#c0392b', fontSize: '17px' }}
          role="alert"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          {error}
        </div>
      )}

      {/* Content */}
      <main className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <svg className="animate-spin" xmlns="http://www.w3.org/2000/svg" width="48" height="48" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="#5cb85c" strokeWidth="4" />
              <path className="opacity-75" fill="#5cb85c" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <p className="text-xl" style={{ color: 'var(--color-text-muted)' }}>Calculando o melhor roteiro...</p>
          </div>
        ) : route.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4" style={{ color: 'var(--color-text-muted)' }}>
            <svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c-.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" />
            </svg>
            <p className="text-xl">Nenhum roteiro disponível no momento.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3 max-w-2xl mx-auto">
            {/* Summary bar */}
            <div
              className="zoo-card p-4 flex items-center gap-4"
            >
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: 'rgba(232,100,14,0.2)' }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="var(--color-orange)" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c-.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" />
                </svg>
              </div>
              <div>
                <p className="font-bold" style={{ fontSize: '19px', color: 'var(--color-orange)' }}>
                  {route.length} paradas no roteiro
                </p>
                <p style={{ fontSize: '15px', color: 'var(--color-text-muted)' }}>
                  Ordenado por maior atividade esperada agora
                </p>
              </div>
            </div>

            {/* Route items */}
            {route.map((item, index) => (
              <RouteItem
                key={item.cage_id}
                item={item}
                index={index}
                onClick={() => navigate(`/cage/${item.cage_id}`)}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

function RouteItem({ item, index, onClick }) {
  const activityPct = Math.round(
    item.expected_activity > 1
      ? Math.min(item.expected_activity, 100)
      : Math.min(item.expected_activity * 100, 100)
  )
  const isActive = item.status === 'active'

  return (
    <button
      onClick={onClick}
      className="w-full text-left zoo-card p-4 flex items-center gap-4 touch-target transition-all"
      style={{
        minHeight: '80px',
        border: `1px solid ${isActive ? 'rgba(92,184,92,0.4)' : 'var(--color-card-border)'}`,
      }}
      aria-label={`Ver detalhes: ${item.animal_name}`}
    >
      {/* Position badge */}
      <div
        className="w-12 h-12 rounded-full flex-shrink-0 flex items-center justify-center font-black text-white text-xl"
        style={{
          backgroundColor: isActive ? 'var(--color-lime)' : 'var(--color-inactive)',
          boxShadow: isActive ? '0 0 10px rgba(92,184,92,0.5)' : 'none',
          minWidth: '48px',
        }}
      >
        {index + 1}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <span className="font-bold text-xl truncate text-white">
            {item.animal_name}
          </span>
          <StatusBadge status={item.status} size="sm" />
        </div>

        <div className="flex items-center gap-3">
          <div
            className="flex-1 rounded-full overflow-hidden"
            style={{ height: '8px', backgroundColor: 'rgba(255,255,255,0.15)' }}
            role="progressbar"
            aria-valuenow={activityPct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Atividade esperada: ${activityPct}%`}
          >
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${activityPct}%`,
                backgroundColor: isActive ? 'var(--color-lime)' : 'var(--color-inactive)',
              }}
            />
          </div>
          <span
            className="font-semibold flex-shrink-0"
            style={{ fontSize: '15px', color: isActive ? '#a8d8a0' : 'var(--color-text-muted)', minWidth: '44px' }}
          >
            {activityPct}%
          </span>
        </div>

        <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
          Atividade esperada agora
        </p>
      </div>

      {/* Chevron */}
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="rgba(255,255,255,0.4)" strokeWidth={2.5} className="flex-shrink-0">
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
      </svg>
    </button>
  )
}
