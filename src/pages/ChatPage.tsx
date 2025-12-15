import { useState, useEffect } from 'react'
import { AIChat } from '../components/chat/AIChat'
import { reportsApi, type Report } from '../services/api'

export function ChatPage() {
  const [reports, setReports] = useState<Report[]>([])
  const [selectedReport, setSelectedReport] = useState<Report | null>(null)
  const [operations, setOperations] = useState<any[]>([])

  useEffect(() => {
    loadReports()
  }, [])

  const loadReports = async () => {
    try {
      const response = await reportsApi.getAll()
      setReports(response.reports)
    } catch (error) {
      console.error('Failed to load reports:', error)
    }
  }

  const handleReportSelect = async (reportId: string) => {
    try {
      const response = await reportsApi.getById(reportId)
      setSelectedReport(response.report)
      setOperations(response.report.operations || [])
    } catch (error) {
      console.error('Failed to load report:', error)
    }
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-4rem)] max-w-7xl gap-4 p-4">
      {/* Sidebar with reports */}
      <div className="w-64 flex-shrink-0 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-4 text-sm font-semibold text-slate-900">Контекст данных</h2>
        <div className="space-y-2">
          <button
            onClick={() => {
              setSelectedReport(null)
              setOperations([])
            }}
            className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
              !selectedReport
                ? 'bg-sky-50 text-sky-700 border border-sky-200'
                : 'text-slate-700 hover:bg-slate-50'
            }`}
          >
            Без контекста
          </button>
          {reports.map((report) => (
            <button
              key={report.id}
              onClick={() => handleReportSelect(report.id)}
              className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                selectedReport?.id === report.id
                  ? 'bg-sky-50 text-sky-700 border border-sky-200'
                  : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              <div className="font-medium">{report.title}</div>
              <div className="text-xs text-slate-500 mt-0.5">
                {report._count?.operations || 0} операций
              </div>
            </button>
          ))}
        </div>
        {selectedReport && (
          <div className="mt-4 rounded-lg bg-slate-50 p-3 text-xs">
            <div className="font-medium text-slate-900 mb-2">Текущий отчет:</div>
            <div className="space-y-1 text-slate-600">
              <div>НДС к уплате: {selectedReport.totals.net_vat.toLocaleString('ru-RU')} ₽</div>
              <div>Входящий НДС: {selectedReport.totals.input_vat.toLocaleString('ru-RU')} ₽</div>
              <div>Исходящий НДС: {selectedReport.totals.output_vat.toLocaleString('ru-RU')} ₽</div>
            </div>
          </div>
        )}
      </div>

      {/* Chat area */}
      <div className="flex-1 rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="border-b border-slate-200 bg-slate-50 px-6 py-3">
          <h1 className="text-lg font-semibold text-slate-900">Спросить у ИИ</h1>
          <p className="text-xs text-slate-500 mt-1">
            {selectedReport
              ? `Контекст: ${selectedReport.title} (${operations.length} операций)`
              : 'Задайте вопросы о ваших данных или прикрепите файлы для анализа'}
          </p>
        </div>
        <div className="h-[calc(100%-80px)]">
          <AIChat reportId={selectedReport?.id} operations={operations} />
        </div>
      </div>
    </div>
  )
}

