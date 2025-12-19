import { useMemo, useState, useEffect, useCallback } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import type { Operation } from '../types/operation'
import { calculateTotals, groupNetVatByMonth } from '../lib/vat'
import { FileUpload } from '../components/upload/FileUpload'
import { OneCUpload } from '../components/upload/OneCUpload'
import { OperationsTable } from '../components/dashboard/OperationsTable'
import { TotalsBlock } from '../components/dashboard/TotalsBlock'
import { TaxLoadChart } from '../components/dashboard/TaxLoadChart'
import { KNDModal } from '../components/reports/KNDModal'
import { ToastContainer } from '../components/common/ToastContainer'
import { reportsApi, type User, type Report } from '../services/api'
import type { ToastType } from '../components/common/Toast'

interface ToastData {
  id: string
  message: string
  type: ToastType
}

interface CalculatorPageProps {
  user: User | null
  onShowAuthModal: () => void
}

export function CalculatorPage({ user, onShowAuthModal }: CalculatorPageProps) {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [uploadTab, setUploadTab] = useState<'sberbank' | '1c'>('sberbank')
  const [operations, setOperations] = useState<Operation[]>([])
  const [currentReport, setCurrentReport] = useState<Report | null>(null)
  const [reportTitle, setReportTitle] = useState('')
  const [toasts, setToasts] = useState<ToastData[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [showKNDModal, setShowKNDModal] = useState(false)
  
  // Filters and settings
  const [selectedYears, setSelectedYears] = useState<number[]>([])
  const [columnVisibility, setColumnVisibility] = useState({
    company: false, // false = column is hidden, true = column is shown
    counterparty: false,
    payment_name: false,
  })
  const [showFilters, setShowFilters] = useState(false)

  // Load report if reportId is in URL
  useEffect(() => {
    const reportId = searchParams.get('reportId')
    if (reportId && !currentReport) {
      reportsApi.getById(reportId)
        .then((response) => {
          const reportData = response.report
          const ops: Operation[] = (reportData.operations || []).map(op => ({
            id: op.id,
            date: op.date,
            amount: op.amount,
            vat_rate: op.vatRate,
            vat_amount: op.vatAmount,
            counterparty: op.counterparty,
            source: op.source,
            direction: op.direction as 'input' | 'output',
            errors: op.errors || undefined,
          }))
          setOperations(ops)
          setCurrentReport(reportData)
          setReportTitle(reportData.title)
        })
        .catch((err) => {
          console.error('Failed to load report:', err)
        })
    }
  }, [searchParams, currentReport])

  // Get available years from operations
  const availableYears = useMemo(() => {
    const years = new Set<number>()
    operations.forEach(op => {
      if (op.date) {
        years.add(new Date(op.date).getFullYear())
      }
    })
    return Array.from(years).sort((a, b) => b - a)
  }, [operations])

  // Filter operations by selected years
  const filteredOperations = useMemo(() => {
    if (selectedYears.length === 0) return operations
    return operations.filter(op => {
      if (!op.date) return false
      const year = new Date(op.date).getFullYear()
      return selectedYears.includes(year)
    })
  }, [operations, selectedYears])

  const totals = useMemo(() => calculateTotals(filteredOperations), [filteredOperations])
  const chartData = useMemo(() => groupNetVatByMonth(filteredOperations), [filteredOperations])

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = Math.random().toString(36).substring(7)
    setToasts((prev) => [...prev, { id, message, type }])
  }, [])

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const handleSaveReport = async (showSuccess = true) => {
    if (!user) {
      onShowAuthModal()
      showToast('Войдите в систему для сохранения отчетов', 'warning')
      return
    }

    if (!reportTitle.trim()) {
      showToast('Введите название отчета', 'warning')
      return
    }

    if (operations.length === 0) {
      showToast('Нет операций для сохранения', 'warning')
      return
    }

    setIsSaving(true)
    try {
      if (currentReport) {
        await reportsApi.delete(currentReport.id)
        const response = await reportsApi.create(reportTitle, operations, totals)
        setCurrentReport(response.report)
        if (showSuccess) {
          showToast('Отчет обновлен', 'success')
        }
      } else {
        const response = await reportsApi.create(reportTitle, operations, totals)
        setCurrentReport(response.report)
        if (showSuccess) {
          showToast('Отчет успешно сохранен', 'success')
        }
      }
      setLastSaved(new Date())
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Ошибка сохранения отчета', 'error')
    } finally {
      setIsSaving(false)
    }
  }

  const handleMarkReady = async () => {
    if (!currentReport) {
      showToast('Сначала сохраните отчет', 'warning')
      return
    }

    try {
      await reportsApi.updateStatus(currentReport.id, 'READY')
      setCurrentReport({ ...currentReport, status: 'READY' })
      showToast('Отчет отмечен как готовый', 'success')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Ошибка обновления статуса', 'error')
    }
  }

  // Auto-save when operations change (debounced)
  useEffect(() => {
    if (!user || !currentReport || operations.length === 0 || !reportTitle.trim()) {
      return
    }

    const timer = setTimeout(() => {
      handleSaveReport(false) // Silent save
    }, 10000) // Auto-save after 10 seconds of inactivity

    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [operations, reportTitle])

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 text-slate-900">
      <ToastContainer toasts={toasts} onRemove={removeToast} />
      
      <div className="border-b border-slate-200 bg-white/95 backdrop-blur-sm sticky top-16 z-30 shadow-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900">Калькулятор НДС</h1>
              <p className="mt-0.5 text-xs text-slate-500">
                Загружайте операции, проверяйте НДС и анализируйте налоговую нагрузку
              </p>
            </div>
            {currentReport && (
              <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold border ${
                currentReport.status === 'READY'
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                  : 'bg-amber-50 text-amber-700 border-amber-300'
              }`}>
                {currentReport.status === 'READY' ? '✓ Готов' : '⚠ Требует просмотра'}
              </span>
            )}
          </div>
          {user && lastSaved && (
            <div className="hidden sm:flex flex-col items-end text-xs text-slate-500">
              <span>Сохранено: {lastSaved.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
          )}
        </div>
      </div>

      <main className="mx-auto flex min-h-[calc(100vh-128px)] max-w-7xl flex-col gap-6 px-4 py-6">
        {operations.length === 0 ? (
          <section className="mx-auto flex w-full max-w-3xl flex-col gap-6">
            <div className="text-center">
              <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Начало работы</h2>
              <p className="mt-2 text-sm text-slate-500">
                Загрузите файл Excel или CSV, чтобы автоматически рассчитать НДС по операциям.
              </p>
            </div>

            <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-10 shadow-sm">
              {/* Upload format tabs */}
              <div className="mb-6 flex gap-2 border-b border-slate-200">
                <button
                  onClick={() => setUploadTab('sberbank')}
                  className={`px-4 py-2 text-sm font-medium transition-colors ${
                    uploadTab === 'sberbank'
                      ? 'border-b-2 border-sky-600 text-sky-600'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  СберБанк
                </button>
                <button
                  onClick={() => setUploadTab('1c')}
                  className={`px-4 py-2 text-sm font-medium transition-colors ${
                    uploadTab === '1c'
                      ? 'border-b-2 border-purple-600 text-purple-600'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  1С:Бухгалтерия
                </button>
              </div>
              
              {uploadTab === 'sberbank' ? (
                <FileUpload onParsed={setOperations} />
              ) : (
                <OneCUpload onParsed={setOperations} autoLoadSample sampleUrl="/receipts_documents.csv" />
              )}
            </div>

            {!currentReport && (
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Название отчета
                </label>
                <input
                  type="text"
                  value={reportTitle}
                  onChange={(e) => setReportTitle(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  placeholder="Название отчета"
                />
              </div>
            )}

            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-6 py-4 text-xs text-slate-600">
              <p className="font-medium text-slate-700">Ожидаемый формат файла:</p>
              <ul className="mt-2 space-y-1 list-disc pl-4">
                <li>
                  <span className="font-semibold">date / дата / дата операции</span> – дата операции (YYYY-MM-DD или DD.MM.YYYY)
                </li>
                <li>
                  <span className="font-semibold">amount / сумма / стоимость</span> – сумма операции (число, в ₽)
                </li>
                <li>
                  <span className="font-semibold">vat_rate / ставка ндс / ндс</span> – ставка НДС в % (например 20, 10, 0)
                </li>
                <li>
                  <span className="font-semibold">counterparty / контрагент / клиент / поставщик</span> – наименование контрагента
                </li>
              </ul>
              <p className="mt-3 text-amber-600">Положительные суммы = исходящий НДС, отрицательные = входящий НДС</p>
            </div>
          </section>
        ) : (
          <section className="flex flex-1 flex-col gap-5">
            <div className="flex items-baseline justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h2 className="text-lg font-semibold text-slate-900">Дашборд</h2>
                  {!currentReport && (
                    <input
                      type="text"
                      value={reportTitle}
                      onChange={(e) => setReportTitle(e.target.value)}
                      placeholder="Название отчета"
                      className="rounded-lg border border-slate-300 px-3 py-1 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                    />
                  )}
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  Анализ {filteredOperations.length.toLocaleString('ru-RU')} операций
                  {selectedYears.length > 0 && ` (отфильтровано из ${operations.length})`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {operations.length > 0 && (
                  <>
                    <button
                      onClick={() => handleSaveReport(true)}
                      disabled={isSaving || !user}
                      className="rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm flex items-center gap-2"
                    >
                      {isSaving ? (
                        <>
                          <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Сохранение...
                        </>
                      ) : (
                        <>
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          {currentReport ? 'Обновить отчет' : 'Сохранить отчет'}
                        </>
                      )}
                    </button>
                    {currentReport && currentReport.status === 'REQUIRES_REVIEW' && (
                      <button
                        onClick={handleMarkReady}
                        className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 transition-colors shadow-sm flex items-center gap-2"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Отметить готовым
                      </button>
                    )}
                    <button
                      onClick={async () => {
                        try {
                          // Save report first if not saved
                          if (!currentReport) {
                            setIsSaving(true)

                            // Check if we have data to save
                            if (!reportTitle.trim()) {
                              showToast('Введите название отчета', 'warning')
                              return
                            }

                            if (operations.length === 0) {
                              showToast('Нет операций для сохранения', 'warning')
                              return
                            }

                            // Save the report
                            const response = await reportsApi.create(reportTitle, operations, totals)
                            setCurrentReport(response.report)
                            setLastSaved(new Date())
                            showToast('Отчет сохранен', 'success')

                            // Redirect to reports page with the new report
                            navigate(`/reports?reportId=${response.report.id}`)
                            return
                          }

                          // For existing reports, just open KND modal
                          setShowKNDModal(true)
                        } catch (err) {
                          console.error('Save report error:', err)
                          showToast(err instanceof Error ? err.message : 'Ошибка сохранения отчета', 'error')
                        } finally {
                          setIsSaving(false)
                        }
                      }}
                      disabled={isSaving}
                      className="rounded-lg bg-purple-600 px-3 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm flex items-center gap-1.5"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      КНД
                    </button>
                  </>
                )}
                {/* Upload format tabs */}
                <div className="mb-4 flex gap-2 border-b border-slate-200">
                  <button
                    onClick={() => setUploadTab('sberbank')}
                    className={`px-4 py-2 text-sm font-medium transition-colors ${
                      uploadTab === 'sberbank'
                        ? 'border-b-2 border-sky-600 text-sky-600'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    СберБанк
                  </button>
                  <button
                    onClick={() => setUploadTab('1c')}
                    className={`px-4 py-2 text-sm font-medium transition-colors ${
                      uploadTab === '1c'
                        ? 'border-b-2 border-purple-600 text-purple-600'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    1С:Бухгалтерия
                  </button>
                </div>
                
                {uploadTab === 'sberbank' ? (
                  <FileUpload onParsed={setOperations} />
                ) : (
                  <OneCUpload onParsed={setOperations} autoLoadSample sampleUrl="/receipts_documents.csv" />
                )}
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-4">
              <TotalsBlock totals={totals} operationsCount={operations.length} />
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Входящий НДС</p>
                <p className="mt-2 text-lg font-semibold text-slate-900">
                  {totals.input_vat.toLocaleString('ru-RU', {
                    style: 'currency',
                    currency: 'RUB',
                  })}
                </p>
                <p className="mt-1 text-[11px] text-slate-500">НДС по покупкам (входящий)</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Исходящий НДС</p>
                <p className="mt-2 text-lg font-semibold text-slate-900">
                  {totals.output_vat.toLocaleString('ru-RU', {
                    style: 'currency',
                    currency: 'RUB',
                  })}
                </p>
                <p className="mt-1 text-[11px] text-slate-500">НДС с реализации (исходящий)</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Операции</p>
                <p className="mt-2 text-lg font-semibold text-slate-900">
                  {operations.length.toLocaleString('ru-RU')}
                </p>
                <p className="mt-1 text-[11px] text-slate-500">Строк загружено</p>
              </div>
            </div>

            {/* Filters and Column Settings */}
            <div className="rounded-lg border border-slate-200 bg-white px-3 py-3 shadow-sm text-xs">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-slate-900">Фильтры и настройки</h3>
                <button
                  onClick={() => setShowFilters(!showFilters)}
                  className="text-[11px] text-sky-600 hover:text-sky-700 flex items-center gap-1"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                  </svg>
                  {showFilters ? 'Скрыть' : 'Показать'}
                </button>
              </div>
              
              {showFilters && (
                <div className="space-y-3">
                  {/* Year filter */}
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-2">
                      Период (годы):
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {availableYears.map(year => (
                        <label key={year} className="inline-flex items-center gap-1.5 cursor-pointer rounded-full border border-slate-200 px-2 py-0.5 hover:border-sky-300">
                          <input
                            type="checkbox"
                            checked={selectedYears.includes(year)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedYears([...selectedYears, year])
                              } else {
                                setSelectedYears(selectedYears.filter(y => y !== year))
                              }
                            }}
                            className="h-3 w-3 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                          />
                          <span className="text-[11px] text-slate-700">{year}</span>
                        </label>
                      ))}
                      {availableYears.length > 0 && (
                        <button
                          onClick={() => setSelectedYears([])}
                          className="text-[11px] text-slate-400 hover:text-slate-700 underline ml-1"
                        >
                          Сбросить
                        </button>
                      )}
                    </div>
                    {availableYears.length === 0 && (
                      <p className="text-xs text-slate-500">Загрузите операции для выбора периода</p>
                    )}
                  </div>

                  {/* Column visibility */}
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-2">
                      Видимость колонок:
                    </label>
                    <div className="flex flex-col gap-1.5">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={columnVisibility.company}
                          onChange={(e) => setColumnVisibility({ ...columnVisibility, company: e.target.checked })}
                          className="h-3 w-3 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                        />
                        <span className="text-[11px] text-slate-700">Наша компания</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={columnVisibility.counterparty}
                          onChange={(e) => setColumnVisibility({ ...columnVisibility, counterparty: e.target.checked })}
                          className="h-3 w-3 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                        />
                        <span className="text-[11px] text-slate-700">Контрагент</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={columnVisibility.payment_name}
                          onChange={(e) => setColumnVisibility({ ...columnVisibility, payment_name: e.target.checked })}
                          className="h-3 w-3 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                        />
                        <span className="text-[11px] text-slate-700">Наименование платежа</span>
                      </label>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Analytics Section - Full Width */}
            <div className="w-full">
              <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
                <span className="font-medium text-slate-800">Аналитика по НДС</span>
                <span>Разбивка по месяцам</span>
              </div>

              <div className="rounded-lg bg-white p-4 shadow-sm">
                <TaxLoadChart data={chartData} />
              </div>

              <div className="mt-4">
                <OperationsTable 
                  operations={operations} 
                  selectedYears={selectedYears}
                  columnVisibility={columnVisibility}
                />
              </div>
            </div>
          </section>
        )}
      </main>

      {showKNDModal && currentReport && (
        <KNDModal
          report={currentReport}
          isOpen={showKNDModal}
          onClose={() => setShowKNDModal(false)}
          onGenerate={(inn, kpp, invoiceData) => {
            // Handle KND generation here
            showToast('KND отчет генерируется...', 'info')
            setShowKNDModal(false)
          }}
        />
      )}
    </div>
  )
}

