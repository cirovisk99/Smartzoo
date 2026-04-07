import React from 'react'
import { useNavigate } from 'react-router-dom'

/**
 * BackButton — navigates to the map (/) or a custom target.
 * Props:
 *   to: destination path (default "/")
 *   label: button label (default "Voltar ao Mapa")
 */
export default function BackButton({ to = '/', label = 'Voltar ao Mapa' }) {
  const navigate = useNavigate()

  return (
    <button
      onClick={() => navigate(to)}
      className="inline-flex items-center gap-2 px-5 py-3 rounded-xl font-semibold transition-colors touch-target"
      style={{
        backgroundColor: 'var(--color-surface)',
        color: 'var(--color-primary)',
        border: '2px solid var(--color-primary)',
        minHeight: '48px',
        fontSize: '18px',
      }}
      aria-label={label}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="22"
        height="22"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2.5}
        aria-hidden="true"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
      </svg>
      {label}
    </button>
  )
}
