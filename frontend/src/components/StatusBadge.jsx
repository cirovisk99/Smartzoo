import React from 'react'

/**
 * StatusBadge — colored pill badge indicating animal activity status.
 * Props:
 *   status: "active" | "inactive" | string
 *   size: "sm" | "md" (default "md")
 */
export default function StatusBadge({ status, size = 'md' }) {
  const isActive = status === 'active'

  const label = isActive ? 'Visível' : 'Não visível'

  const sizeClasses = size === 'sm'
    ? 'text-sm px-2 py-0.5 gap-1'
    : 'text-base px-3 py-1 gap-1.5'

  const dotSize = size === 'sm' ? 'w-2 h-2' : 'w-3 h-3'

  return (
    <span
      className={`inline-flex items-center rounded-full font-semibold ${sizeClasses}`}
      style={{
        backgroundColor: isActive ? 'rgba(92,184,92,0.2)' : 'rgba(255,255,255,0.1)',
        color: isActive ? '#a8d8a0' : 'rgba(255,255,255,0.5)',
        border: `1.5px solid ${isActive ? 'rgba(92,184,92,0.6)' : 'rgba(255,255,255,0.2)'}`,
      }}
    >
      <span
        className={`${dotSize} rounded-full flex-shrink-0 ${isActive ? 'pulse-active' : ''}`}
        style={{
          backgroundColor: isActive ? 'var(--color-active)' : 'var(--color-inactive)',
          position: 'relative',
        }}
      />
      {label}
    </span>
  )
}
