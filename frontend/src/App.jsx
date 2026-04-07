import React, { useEffect, useRef, useCallback } from 'react'
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import MapScreen from './screens/MapScreen.jsx'
import CageDetail from './screens/CageDetail.jsx'
import ChatScreen from './screens/ChatScreen.jsx'
import RouteScreen from './screens/RouteScreen.jsx'

const INACTIVITY_TIMEOUT_MS = 60000

function InactivityGuard({ children }) {
  const navigate = useNavigate()
  const location = useLocation()
  const timerRef = useRef(null)

  const resetTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      if (location.pathname !== '/') {
        navigate('/')
      }
    }, INACTIVITY_TIMEOUT_MS)
  }, [navigate, location.pathname])

  useEffect(() => {
    resetTimer()

    const events = ['touchstart', 'touchmove', 'mousedown', 'mousemove', 'keydown', 'click']
    events.forEach((e) => window.addEventListener(e, resetTimer, { passive: true }))

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      events.forEach((e) => window.removeEventListener(e, resetTimer))
    }
  }, [resetTimer])

  return children
}

function AppRoutes() {
  return (
    <InactivityGuard>
      <Routes>
        <Route path="/" element={<MapScreen />} />
        <Route path="/cage/:id" element={<CageDetail />} />
        <Route path="/chat" element={<ChatScreen />} />
        <Route path="/route" element={<RouteScreen />} />
      </Routes>
    </InactivityGuard>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  )
}
