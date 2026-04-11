import React, { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js'
import { Bar } from 'react-chartjs-2'
import { fetchCageHistory, fetchStatus } from '../api.js'

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'
import BackButton from '../components/BackButton.jsx'
import StatusBadge from '../components/StatusBadge.jsx'

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend)

export default function CageDetail() {
  const { id } = useParams()
  const [cageInfo, setCageInfo] = useState(null)
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [snapshotTs, setSnapshotTs] = useState(Date.now())
  const snapshotUrl = `${BASE_URL}/api/cage/${id}/snapshot?t=${snapshotTs}`

  useEffect(() => {
    let cancelled = false

    async function loadAll() {
      setLoading(true)
      setError(null)

      const { data: statusList, error: statusErr } = await fetchStatus()
      if (!cancelled) {
        if (statusErr) {
          setError(statusErr)
        } else {
          const found = (statusList || []).find((c) => String(c.cage_id) === String(id))
          setCageInfo(found || null)
        }
      }

      const { data: hist, error: histErr } = await fetchCageHistory(id)
      if (!cancelled) {
        if (!histErr && hist) setHistory(hist.history || [])
      }

      if (!cancelled) setLoading(false)
    }

    loadAll()
    const snapshotTimer = setInterval(() => setSnapshotTs(Date.now()), 30000)
    return () => { cancelled = true; clearInterval(snapshotTimer) }
  }, [id])

  if (loading) {
    return (
      <div className="flex flex-col h-full items-center justify-center gap-4 zoo-bg-texture" style={{ backgroundColor: 'var(--color-bg)' }}>
        <Spinner />
        <p className="text-xl" style={{ color: 'var(--color-text-muted)' }}>Carregando informações da jaula...</p>
      </div>
    )
  }

  const hourLabels = Array.from({ length: 24 }, (_, i) => `${i}h`)
  const activityData = Array(24).fill(0)
  history.forEach((entry) => {
    const h = new Date(entry.hour + 'Z').toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: 'numeric', hour12: false })
    const hNum = parseInt(h, 10)
    if (hNum >= 0 && hNum < 24) {
      activityData[hNum] = Math.round((entry.active_ratio || 0) * 100)
    }
  })

  // Melhor horário para visita: hora com maior atividade (mínimo 3 horas com dados)
  const hoursWithData = activityData.filter(v => v > 0).length
  const bestHourIdx = activityData.reduce((best, v, i) => v > activityData[best] ? i : best, 0)
  const bestHourValue = activityData[bestHourIdx]
  const bestHourLabel = hoursWithData >= 3 && bestHourValue > 0 ? `${bestHourIdx}h – ${bestHourIdx + 1}h` : null

  const chartData = {
    labels: hourLabels,
    datasets: [
      {
        label: 'Atividade (%)',
        data: activityData,
        backgroundColor: activityData.map((v) =>
          v > 50 ? 'rgba(92,184,92,0.85)' : 'rgba(138,158,106,0.6)'
        ),
        borderColor: activityData.map((v) =>
          v > 50 ? '#449d44' : '#6b8c3a'
        ),
        borderWidth: 1,
        borderRadius: 4,
      },
    ],
  }

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    layout: { padding: { bottom: 8 } },
    plugins: {
      legend: { display: false },
      title: { display: false },
      tooltip: {
        callbacks: { label: (ctx) => ` ${ctx.raw}% de atividade` },
      },
    },
    scales: {
      x: {
        ticks: { font: { size: 10, family: 'Inter' }, color: 'rgba(255,255,255,0.6)', maxRotation: 0 },
        grid: { display: false },
        border: { color: 'rgba(255,255,255,0.1)' },
      },
      y: {
        min: 0,
        max: 100,
        ticks: { font: { size: 10, family: 'Inter' }, color: 'rgba(255,255,255,0.6)', callback: (v) => `${v}%` },
        grid: { color: 'rgba(255,255,255,0.07)' },
        border: { color: 'rgba(255,255,255,0.1)' },
      },
    },
  }

  return (
    <div className="flex flex-col h-full overflow-hidden zoo-bg-texture" style={{ backgroundColor: 'var(--color-bg)' }}>

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
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-white truncate">
            {cageInfo ? cageInfo.animal_name : `Jaula #${id}`}
          </h1>
          {cageInfo?.zone_label && (
            <p style={{ fontSize: '15px', color: 'var(--color-text-muted)' }}>
              Última localização: {cageInfo.zone_label}
            </p>
          )}
        </div>
        {cageInfo && <StatusBadge status={cageInfo.status} />}
      </header>

      {error && (
        <div
          className="px-6 py-3 text-white font-semibold flex-shrink-0"
          style={{ backgroundColor: '#c0392b', fontSize: '17px' }}
          role="alert"
        >
          {error}
        </div>
      )}

      <main className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">

        {/* Linha principal: imagem à esquerda, cards à direita */}
        <div className="flex gap-4" style={{ minHeight: '220px' }}>

          {/* Snapshot */}
          <div className="rounded-2xl overflow-hidden flex-shrink-0" style={{ width: '55%', border: '1px solid var(--color-card-border)', boxShadow: '0 4px 16px rgba(0,0,0,0.3)', backgroundColor: 'var(--color-surface)' }}>
            <img
              src={snapshotUrl}
              alt={`Snapshot de ${cageInfo?.animal_name || 'jaula'}`}
              className="w-full h-full"
              style={{ objectFit: 'cover', objectPosition: 'center' }}
              onError={(e) => {
                e.currentTarget.style.display = 'none'
                e.currentTarget.nextSibling.style.display = 'flex'
              }}
            />
            <div className="w-full h-full flex flex-col items-center justify-center gap-2"
              style={{ color: 'var(--color-text-muted)', display: 'none' }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
              </svg>
              <span style={{ fontSize: '15px' }}>Sem imagem</span>
            </div>
          </div>

          {/* Cards direita: Melhor horário em cima, Info abaixo */}
          <div className="flex flex-col gap-3 flex-1 min-w-0">

            {bestHourLabel && (
              <div className="zoo-card p-4 flex flex-col justify-center gap-1 flex-shrink-0" style={{ borderTop: '3px solid var(--color-lime)' }}>
                <p style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--color-text-muted)' }}>
                  Melhor horário
                </p>
                <p style={{ fontSize: '22px', fontWeight: 800, color: 'var(--color-lime)', lineHeight: 1.1 }}>
                  {bestHourLabel}
                </p>
                <p style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                  {bestHourValue}% atividade média
                </p>
              </div>
            )}

            {cageInfo && (
              <div className="zoo-card p-4 flex flex-col gap-2 flex-1">
                <h2 className="text-base font-bold" style={{ color: 'var(--color-orange)' }}>Informações</h2>
                {cageInfo.species && <InfoRow label="Espécie" value={cageInfo.species} />}
                <InfoRow label="Presença detectada" value={cageInfo.animal_count > 0 ? 'Sim' : 'Não'} />
                {(cageInfo.zone_label || (cageInfo.zone && cageInfo.zone !== 'unknown')) && (
                  <InfoRow label="Zona" value={cageInfo.zone_label || cageInfo.zone} />
                )}
                <InfoRow label="Atividade" value={<ActivityBar value={cageInfo.activity_level || 0} />} />
                <InfoRow label="Status" value={<StatusBadge status={cageInfo.status} size="sm" />} />
                {cageInfo.last_update && (
                  <InfoRow label="Atualização" value={
                    <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                      {new Date(cageInfo.last_update + 'Z').toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                    </span>
                  } />
                )}
              </div>
            )}
          </div>
        </div>

        {/* Activity chart */}
        <div className="zoo-card p-5 flex flex-col gap-3" style={{ minHeight: '240px' }}>
          <h2 className="text-xl font-bold" style={{ color: 'var(--color-orange)' }}>
            Atividade nas últimas 24 horas
          </h2>
          <div style={{ flex: 1, minHeight: '180px', position: 'relative' }}>
            {history.length === 0 ? (
              <div className="flex items-center justify-center h-full" style={{ color: 'var(--color-text-muted)', fontSize: '17px' }}>
                Sem dados de histórico disponíveis
              </div>
            ) : (
              <Bar data={chartData} options={chartOptions} />
            )}
          </div>
        </div>
      </main>
    </div>
  )
}

function InfoRow({ label, value }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span style={{ fontSize: '12px', color: 'var(--color-text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {label}
      </span>
      <span style={{ fontSize: '17px', fontWeight: 500, color: 'var(--color-text)' }}>
        {value}
      </span>
    </div>
  )
}

function ActivityBar({ value }) {
  const pct = value > 1 ? Math.min(value, 100) : Math.min(value * 100, 100)
  return (
    <div className="flex items-center gap-2 w-full">
      <div className="flex-1 rounded-full overflow-hidden" style={{ height: '10px', backgroundColor: 'rgba(255,255,255,0.15)' }}>
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${pct}%`,
            backgroundColor: pct > 50 ? 'var(--color-lime)' : 'var(--color-inactive)',
          }}
        />
      </div>
      <span style={{ fontSize: '14px', color: 'var(--color-text-muted)', minWidth: '36px' }}>{Math.round(pct)}%</span>
    </div>
  )
}

function Spinner() {
  return (
    <svg className="animate-spin" xmlns="http://www.w3.org/2000/svg" width="48" height="48" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="#5cb85c" strokeWidth="4" />
      <path className="opacity-75" fill="#5cb85c" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}
