import { useEffect, useRef } from 'react'

interface KNDPreviewModalProps {
  isOpen: boolean
  pdfBlob: Blob | null
  filename: string
  onClose: () => void
  onDownload: () => void
}

export function KNDPreviewModal({
  isOpen,
  pdfBlob,
  filename,
  onClose,
  onDownload,
}: KNDPreviewModalProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    if (isOpen && pdfBlob && iframeRef.current) {
      const url = URL.createObjectURL(pdfBlob)
      iframeRef.current.src = url

      return () => {
        URL.revokeObjectURL(url)
      }
    }
  }, [isOpen, pdfBlob])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl h-[90vh] mx-4 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Предпросмотр КНД 1151001</h3>
            <p className="text-xs text-slate-500 mt-1">{filename}</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={onDownload}
              className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700"
            >
              Скачать PDF
            </button>
            <button
              onClick={onClose}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Закрыть
            </button>
          </div>
        </div>

        {/* PDF Preview */}
        <div className="flex-1 overflow-hidden bg-slate-100">
          {pdfBlob ? (
            <iframe
              ref={iframeRef}
              className="w-full h-full border-0"
              title="PDF Preview"
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-slate-500">Загрузка предпросмотра...</div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 bg-slate-50">
          <p className="text-xs text-slate-600 text-center">
            Проверьте данные перед скачиванием. После скачивания файл будет сохранен на вашем устройстве.
          </p>
        </div>
      </div>
    </div>
  )
}

