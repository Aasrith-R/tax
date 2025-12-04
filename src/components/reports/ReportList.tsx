import { useState, useEffect } from 'react'
import { reportsApi, type Report } from '../../services/api'
import { removeToken } from '../../services/api'

interface ReportListProps {
  onSelectReport: (report: Report) => void
  onCreateNew: () => void
  onLogout: () => void
}

export function ReportList({ onSelectReport, onCreateNew, onLogout }: ReportListProps) {
  const [reports, setReports] = useState<Report[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadReports = async () => {
    try {
      setLoading(true)
      const response = await reportsApi.getAll()
      setReports(response.reports)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка загрузки отчетов')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadReports()
  }, [])

  const handleDelete = async (id: string) => {
    if (!confirm('Вы уверены, что хотите удалить этот отчет?')) {
      return
    }

    try {
      await reportsApi.delete(id)
      await loadReports()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Ошибка удаления')
    }
  }

  const getStatusBadge = (status: string) => {
    if (status === 'READY') {
      return (
        <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 border border-emerald-200">
          Готов
        </span>
      )
    }
    return (
      <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700 border border-amber-200">
        Требует просмотра
      </span>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-sm text-slate-500">Загрузка отчетов...</div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Мои отчеты</h2>
          <p className="mt-1 text-xs text-slate-500">
            {reports.length} {reports.length === 1 ? 'отчет' : 'отчетов'}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onCreateNew}
            className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700"
          >
            + Новый отчет
          </button>
          <button
            onClick={() => {
              removeToken()
              onLogout()
            }}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Выйти
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {reports.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center">
          <p className="text-sm text-slate-600 mb-4">У вас пока нет сохраненных отчетов</p>
          <button
            onClick={onCreateNew}
            className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700"
          >
            Создать первый отчет
          </button>
        </div>
      ) : (
        <div className="grid gap-3">
          {reports.map((report) => (
            <div
              key={report.id}
              className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => onSelectReport(report)}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="font-medium text-slate-900">{report.title}</h3>
                    {getStatusBadge(report.status)}
                  </div>
                  <div className="flex items-center gap-4 text-xs text-slate-500">
                    <span>
                      {report._count?.operations || 0} {report._count?.operations === 1 ? 'операция' : 'операций'}
                    </span>
                    <span>
                      НДС к уплате: {report.totals.net_vat.toLocaleString('ru-RU', {
                        style: 'currency',
                        currency: 'RUB',
                      })}
                    </span>
                    <span>
                      {new Date(report.createdAt).toLocaleDateString('ru-RU')}
                    </span>
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleDelete(report.id)
                  }}
                  className="ml-4 rounded-lg px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                >
                  Удалить
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

