import { useState, useEffect } from 'react'
import { Routes, Route } from 'react-router-dom'
import './App.css'
import { Navbar } from './components/layout/Navbar'
import { LandingPage } from './pages/LandingPage'
import { CalculatorPage } from './pages/CalculatorPage'
import { ReportsPage } from './pages/ReportsPage'
import { authApi, getToken, removeToken, type User } from './services/api'

function App() {
  const [user, setUser] = useState<User | null>(null)
  const [showAuthModal, setShowAuthModal] = useState(false)

  // Check authentication on mount
  useEffect(() => {
    const token = getToken()
    if (token) {
      authApi.getCurrentUser()
        .then(({ user }) => {
          setUser(user)
        })
        .catch(() => {
          removeToken()
        })
    }
  }, [])

  return (
    <div className="min-h-screen">
      <Navbar 
        user={user}
        onUserChange={setUser}
        showAuthModal={showAuthModal}
        onShowAuthModal={setShowAuthModal}
      />
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route 
          path="/calculator" 
          element={
            <CalculatorPage 
              user={user}
              onShowAuthModal={() => setShowAuthModal(true)}
            />
          } 
        />
        <Route path="/reports" element={<ReportsPage />} />
      </Routes>
    </div>
  )
}

export default App
