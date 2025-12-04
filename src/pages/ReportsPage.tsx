import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { reportsApi, type Report, getToken } from '../services/api'
import { ReportList } from '../components/reports/ReportList'

export function ReportsPage() {
  const navigate = useNavigate()
  const [, setReports] = useState<Report[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = getToken()
    if (!token) {
      navigate('/')
      return
    }

    const loadReports = async () => {
      try {
        setLoading(true)
        const response = await reportsApi.getAll()
        setReports(response.reports)
      } catch (err) {
        console.error('Failed to load reports:', err)
      } finally {
        setLoading(false)
      }
    }

    loadReports()
  }, [navigate])

  const handleSelectReport = (report: Report) => {
    navigate(`/calculator?reportId=${report.id}`)
  }

  const handleCreateNew = () => {
    navigate('/calculator')
  }

  const handleLogout = () => {
    // Logout is handled by Navbar
    navigate('/')
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="text-slate-500">Загрузка отчетов...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="mx-auto max-w-7xl px-4 py-8">
        <ReportList
          onSelectReport={handleSelectReport}
          onCreateNew={handleCreateNew}
          onLogout={handleLogout}
        />
      </div>
    </div>
  )
}
