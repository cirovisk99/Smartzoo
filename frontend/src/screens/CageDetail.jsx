import React, { useState, useEffect, useRef } from 'react'
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
  const [snapshot, setSnapshot] = useState(null)
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const snapshotUrl = `${BASE_URL}/api/cage/${id}/snapshot`

  useEffect(() => {
    let cancelled = false

    async function loadAll() {
      setLoading(true)
      setError(null)

      // Load cage info from status list
      const { data: statusList, error: statusErr } = await fetchStatus()
      if (!cancelled) {
        if (statusErr) {
          setError(statusErr)
        } else {
          const found = (statusList || []).find((c) => String(c.cage_id) === String(id))
          setCageInfo(found || null)
        }
      }

      // Load history
      const { data: hist, error: histErr } = await fetchCageHistory(id)
      if (!cancelled) {
        if (!histErr && hist) setHistory(hist.history || [])
      }

      // Load snapshot — API returns JPEG directly, use URL as img src
      if (!cancelled) {
        setLoading(false)
      }
    }

    loadAll()
    return () => { cancelled = true }
  }, [id])

  if (loading) {
    return (
      <div className="flex flex-col h-full items-center justify-center gap-4" style={{ backgroundColor: 'var(--color-bg)' }}>
        <Spinner />
        <p className="text-xl text-gray-600">Carregando informações da jaula...</p>
      </div>
    )
  }

  // Build chart data — fill missing hours with 0
  const hourLabels = Array.from({ length: 24 }, (_, i) => `${i}h`)
  const activityData = Array(24).fill(0)
  history.forEach((entry) => {
    const h = new Date(entry.hour).getHours()
    if (h >= 0 && h < 24) {
      activityData[h] = Math.round((entry.active_ratio || 0) * 100)
    }
  })

  const chartData = {
    labels: hourLabels,
    datasets: [
      {
        label: 'Atividade (%)',
        data: activityData,
        backgroundColor: activityData.map((v) =>
          v > 50 ? 'rgba(76, 175, 80, 0.85)' : 'rgba(158, 158, 158, 0.6)'
        ),
        borderColor: activityData.map((v) =>
          v > 50 ? '#2E7D32' : '#757575'
        ),
        borderWidth: 1,
        borderRadius: 4,
      },
    ],
  }

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      title: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) => ` ${ctx.raw}% de atividade`,
        },
      },
    },
    scales: {
      x: {
        ticks: {
          font: { size: 13, family: 'Inter' },
          color: '#616161',
          maxRotation: 0,
        },
        grid: { display: false },
      },
      y: {
        min: 0,
        max: 100,
        ticks: {
          font: { size: 13, family: 'Inter' },
          color: '#616161',
          callback: (v) => `${v}%`,
        },
        grid: { color: 'rgba(0,0,0,0.06)' },
      },
    },
  }

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ backgroundColor: 'var(--color-bg)' }}>
      {/* Header */}
      <header
        className="flex items-center gap-4 px-6 py-4 shadow-md flex-shrink-0"
        style={{ backgroundColor: 'var(--color-primary)' }}
      >
        <BackButton />
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-white truncate">
            {cageInfo ? cageInfo.animal_name : `Jaula #${id}`}
          </h1>
          {cageInfo?.zone_label && (
            <p className="text-green-200 mt-0.5" style={{ fontSize: '16px' }}>
              Última localização: {cageInfo.zone_label}
            </p>
          )}
        </div>
        {cageInfo && <StatusBadge status={cageInfo.status} />}
      </header>

      {error && (
        <div
          className="px-6 py-3 text-white font-medium flex-shrink-0"
          style={{ backgroundColor: '#D32F2F', fontSize: '18px' }}
          role="alert"
        >
          {error}
        </div>
      )}

      <main className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
        {/* Top row: snapshot + info */}
        <div className="flex gap-4" style={{ minHeight: '220px' }}>
          {/* Snapshot */}
          <div
            className="flex-1 rounded-2xl overflow-hidden shadow"
            style={{ backgroundColor: 'var(--color-surface)' }}
          >
            <img
              src={snapshotUrl}
              alt={`Snapshot de ${cageInfo?.animal_name || 'jaula'}`}
              className="w-full h-full object-cover"
              style={{ minHeight: '200px' }}
              onError={(e) => {
                e.currentTarget.style.display = 'none'
                e.currentTarget.nextSibling.style.display = 'flex'
              }}
            />
            <div
              className="w-full h-full flex-col items-center justify-center gap-3"
              style={{ minHeight: '200px', color: '#9E9E9E', display: 'none' }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
              </svg>
              <span style={{ fontSize: '16px' }}>Sem imagem disponível</span>
            </div>
          </div>

          {/* Info panel */}
          <div
            className="rounded-2xl shadow p-5 flex flex-col gap-3 flex-shrink-0"
            style={{ backgroundColor: 'var(--color-surface)', minWidth: '200px', maxWidth: '260px' }}
          >
            <h2 className="text-xl font-bold" style={{ color: 'var(--color-primary)' }}>Informações</h2>

            {cageInfo ? (
              <>
                <InfoRow label="Status" value={<StatusBadge status={cageInfo.status} size="sm" />} />
                <InfoRow label="Animais" value={cageInfo.animal_count ?? '—'} />
                <InfoRow label="Zona" value={cageInfo.zone_label || cageInfo.zone || '—'} />
                <InfoRow label="Nível de atividade" value={
                  <ActivityBar value={cageInfo.activity_level || 0} />
                } />
                {cageInfo.last_update && (
                  <InfoRow label="Última atualização" value={
                    <span style={{ fontSize: '14px', color: '#757575' }}>
                      {new Date(cageInfo.last_update).toLocaleTimeString('pt-BR')}
                    </span>
                  } />
                )}
              </>
            ) : (
              <p className="text-gray-500" style={{ fontSize: '16px' }}>Informações indisponíveis</p>
            )}
          </div>
        </div>

        {/* Activity chart */}
        <div
          className="rounded-2xl shadow p-5 flex flex-col gap-3"
          style={{ backgroundColor: 'var(--color-surface)', flex: '1', minHeight: '200px' }}
        >
          <h2 className="text-xl font-bold" style={{ color: 'var(--color-primary)' }}>
            Atividade nas últimas 24 horas
          </h2>
          <div style={{ flex: 1, minHeight: '160px', position: 'relative' }}>
            {history.length === 0 ? (
              <div className="flex items-center justify-center h-full" style={{ color: '#9E9E9E', fontSize: '18px' }}>
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
      <span style={{ fontSize: '13px', color: '#757575', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </span>
      <span style={{ fontSize: '17px', fontWeight: 500, color: 'var(--color-text)' }}>
        {value}
      </span>
    </div>
  )
}

function ActivityBar({ value }) {
  // value expected 0–1 or 0–100
  const pct = value > 1 ? Math.min(value, 100) : Math.min(value * 100, 100)
  return (
    <div className="flex items-center gap-2 w-full">
      <div className="flex-1 rounded-full overflow-hidden" style={{ height: '10px', backgroundColor: '#e0e0e0' }}>
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${pct}%`,
            backgroundColor: pct > 50 ? 'var(--color-active)' : 'var(--color-inactive)',
          }}
        />
      </div>
      <span style={{ fontSize: '14px', color: '#757575', minWidth: '36px' }}>{Math.round(pct)}%</span>
    </div>
  )
}

function Spinner() {
  return (
    <svg
      className="animate-spin"
      xmlns="http://www.w3.org/2000/svg"
      width="48"
      height="48"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="#2E7D32" strokeWidth="4" />
      <path className="opacity-75" fill="#2E7D32" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}
