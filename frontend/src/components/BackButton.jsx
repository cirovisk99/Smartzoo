import React from 'react'
import { useNavigate } from 'react-router-dom'

export default function BackButton({ to = '/', label = 'Voltar ao Mapa' }) {
  const navigate = useNavigate()

  return (
    <button
      onClick={() => navigate(to)}
      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl font-semibold transition-colors touch-target zoo-btn-ghost"
      style={{ minHeight: '48px', fontSize: '16px' }}
      aria-label={label}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="20"
        height="20"
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
