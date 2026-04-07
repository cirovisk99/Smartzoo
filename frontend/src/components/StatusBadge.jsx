import React from 'react'

/**
 * StatusBadge — colored pill badge indicating animal activity status.
 * Props:
 *   status: "active" | "inactive" | string
 *   size: "sm" | "md" (default "md")
 */
export default function StatusBadge({ status, size = 'md' }) {
  const isActive = status === 'active'

  const label = isActive ? 'Ativo' : 'Inativo'

  const sizeClasses = size === 'sm'
    ? 'text-sm px-2 py-0.5 gap-1'
    : 'text-base px-3 py-1 gap-1.5'

  const dotSize = size === 'sm' ? 'w-2 h-2' : 'w-3 h-3'

  return (
    <span
      className={`inline-flex items-center rounded-full font-semibold ${sizeClasses}`}
      style={{
        backgroundColor: isActive ? 'rgba(76, 175, 80, 0.15)' : 'rgba(158, 158, 158, 0.15)',
        color: isActive ? '#2E7D32' : '#616161',
        border: `1.5px solid ${isActive ? '#4CAF50' : '#9E9E9E'}`,
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
