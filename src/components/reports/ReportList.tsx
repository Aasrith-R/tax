import { useState, useEffect } from 'react'
import { reportsApi, type Report } from '../../services/api'
import { removeToken } from '../../services/api'
import { KNDModal, type InvoiceData } from './KNDModal'
import { KNDPreviewModal } from './KNDPreviewModal'
import { generateKNDPDF, downloadPDF } from '../../lib/kndGenerator'

interface ReportListProps {
  onSelectReport: (report: Report) => void
  onCreateNew: () => void
  onLogout: () => void
}

export function ReportList({ onSelectReport, onCreateNew, onLogout }: ReportListProps) {
  const [reports, setReports] = useState<Report[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedReport, setSelectedReport] = useState<Report | null>(null)
  const [isKNDModalOpen, setIsKNDModalOpen] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [previewPdfBlob, setPreviewPdfBlob] = useState<Blob | null>(null)
  const [previewFilename, setPreviewFilename] = useState('')
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)

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

  const handleConvertToKND = (report: Report, e: React.MouseEvent) => {
    e.stopPropagation()
    setSelectedReport(report)
    setIsKNDModalOpen(true)
  }

  const handleGenerateKND = async (inn: string, kpp: string, invoiceData?: InvoiceData[]) => {
    if (!selectedReport) return

    try {
      setGenerating(true)
      
      console.log('\n📤 ReportList - handleGenerateKND called:')
      console.log('  Invoice data provided:', invoiceData ? `Yes (${invoiceData.length} items)` : 'No')
      if (invoiceData && invoiceData.length > 0) {
        console.log('  Invoice data[0] details:')
        console.log('    invoiceNumber:', invoiceData[0].invoiceNumber)
        console.log('    sellerName:', invoiceData[0].sellerName || '(null/empty)')
        console.log('    sellerInn:', invoiceData[0].sellerInn || '(null/empty)')
        console.log('    sellerKpp:', invoiceData[0].sellerKpp || '(null/empty)')
        console.log('    Full invoiceData[0]:', JSON.stringify(invoiceData[0], null, 2))
      }
      
      // Fetch full report data with operations if needed
      const fullReport = await reportsApi.getById(selectedReport.id)
      
      // Generate PDF
      const pdfBlob = await generateKNDPDF(fullReport.report, inn, kpp, invoiceData)
      
      // Set preview data and show preview modal
      const filename = `КНД_${selectedReport.title}_${new Date().toISOString().split('T')[0]}.pdf`
      setPreviewFilename(filename)
      setPreviewPdfBlob(pdfBlob)
      setIsPreviewOpen(true)
    } catch (err) {
      console.error('Error generating KND:', err)
      alert(err instanceof Error ? err.message : 'Ошибка при генерации КНД формы')
    } finally {
      setGenerating(false)
    }
  }

  const handleDownloadFromPreview = () => {
    if (previewPdfBlob) {
      downloadPDF(previewPdfBlob, previewFilename)
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
                <div className="ml-4 flex gap-2">
                  <button
                    onClick={(e) => handleConvertToKND(report, e)}
                    className="rounded-lg px-3 py-1 text-xs font-medium bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200"
                  >
                    КНД 1151001
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDelete(report.id)
                    }}
                    className="rounded-lg px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                  >
                    Удалить
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedReport && (
        <KNDModal
          report={selectedReport}
          isOpen={isKNDModalOpen}
          onClose={() => {
            setIsKNDModalOpen(false)
            setSelectedReport(null)
          }}
          onGenerate={handleGenerateKND}
        />
      )}

      {generating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-xl shadow-xl p-6">
            <div className="flex items-center gap-3">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-sky-600"></div>
              <p className="text-sm text-slate-700">Генерация КНД формы...</p>
            </div>
          </div>
        </div>
      )}

      <KNDPreviewModal
        isOpen={isPreviewOpen}
        pdfBlob={previewPdfBlob}
        filename={previewFilename}
        onClose={() => {
          setIsPreviewOpen(false)
          // Clean up blob URL after a delay to allow iframe to finish
          setTimeout(() => {
            setPreviewPdfBlob(null)
            setPreviewFilename('')
          }, 100)
        }}
        onDownload={handleDownloadFromPreview}
      />
    </div>
  )
}

