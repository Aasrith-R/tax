import { useState, useMemo } from 'react'
import type { Operation } from '../../types/operation'

interface OperationsTableProps {
  operations: Operation[]
  selectedYears?: number[]
  columnVisibility?: {
    company: boolean
    counterparty: boolean
    payment_name: boolean
  }
}

export function OperationsTable({ 
  operations, 
  selectedYears = [],
  columnVisibility = { company: false, counterparty: false, payment_name: false }
}: OperationsTableProps) {
  const [hoveredRow, setHoveredRow] = useState<string | null>(null)
  const [tooltipPosition, setTooltipPosition] = useState<{ x: number; y: number } | null>(null)

  // Filter operations by selected years
  const filteredOperations = useMemo(() => {
    if (selectedYears.length === 0) return operations
    return operations.filter(op => {
      if (!op.date) return false
      const year = new Date(op.date).getFullYear()
      return selectedYears.includes(year)
    })
  }, [operations, selectedYears])

  if (!operations.length) {
    return (
      <div className="mt-4 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-xs text-slate-500">
        <p className="font-medium text-slate-700">Операции ещё не загружены</p>
        <p className="mt-1 text-[11px]">
          Загрузите файл CSV/Excel, чтобы увидеть операции, рассчитанный НДС и подсветку возможных ошибок.
        </p>
      </div>
    )
  }

  const buildTooltipContent = (op: Operation): string => {
    const parts: string[] = []
    if (op.company) parts.push(`Компания: ${op.company}`)
    if (op.counterparty) parts.push(`Контрагент: ${op.counterparty}`)
    if (op.payment_name) parts.push(`Платеж: ${op.payment_name}`)
    if (op.source) parts.push(`Источник: ${op.source}`)
    if (op.additional_info) {
      Object.entries(op.additional_info).forEach(([key, value]) => {
        parts.push(`${key}: ${value}`)
      })
    }
    return parts.join('\n')
  }

  return (
    <div className="mt-4 w-full max-w-full overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm p-2">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50">
          <tr>
            <th className="px-3 py-2 text-left font-medium uppercase tracking-wide text-slate-400">Дата</th>
            {columnVisibility.company && (
              <th className="px-3 py-2 text-left font-medium uppercase tracking-wide text-slate-400">Наша компания</th>
            )}
            {columnVisibility.counterparty && (
              <th className="px-3 py-2 text-left font-medium uppercase tracking-wide text-slate-400">Контрагент</th>
            )}
            {columnVisibility.payment_name && (
              <th className="px-3 py-2 text-left font-medium uppercase tracking-wide text-slate-400">Наименование платежа</th>
            )}
            <th className="px-3 py-2 text-right font-medium uppercase tracking-wide text-slate-400">Сумма, ₽</th>
            <th className="px-3 py-2 text-right font-medium uppercase tracking-wide text-slate-400">Ставка НДС</th>
            <th className="px-3 py-2 text-right font-medium uppercase tracking-wide text-slate-400">НДС, ₽</th>
            <th className="px-3 py-2 text-left font-medium uppercase tracking-wide text-slate-400">Тип НДС</th>
            <th className="px-3 py-2 text-left font-medium uppercase tracking-wide text-slate-400">Источник</th>
            <th className="px-3 py-2 text-left font-medium uppercase tracking-wide text-slate-400">Качество</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {filteredOperations.map((op) => {
            const hasErrors = !!op.errors?.length
            return (
              <tr
                key={op.id}
                className={`relative ${hasErrors ? 'bg-red-50' : 'odd:bg-white even:bg-slate-50'} hover:bg-slate-100 transition-colors`}
                onMouseEnter={(e) => {
                  setHoveredRow(op.id)
                  setTooltipPosition({ x: e.clientX, y: e.clientY })
                }}
                onMouseMove={(e) => {
                  if (hoveredRow === op.id) {
                    setTooltipPosition({ x: e.clientX, y: e.clientY })
                  }
                }}
                onMouseLeave={() => {
                  setHoveredRow(null)
                  setTooltipPosition(null)
                }}
              >
                <td className="whitespace-nowrap px-3 py-2 text-slate-900">
                  {op.date ? new Date(op.date).toLocaleDateString('ru-RU') : '—'}
                </td>
                {columnVisibility.company && (
                  <td className="max-w-[150px] truncate px-3 py-2 text-slate-900" title={op.company}>
                    {op.company || '—'}
                  </td>
                )}
                {columnVisibility.counterparty && (
                  <td className="max-w-[200px] truncate px-3 py-2 text-slate-900" title={op.counterparty}>
                    {op.counterparty || '—'}
                  </td>
                )}
                {columnVisibility.payment_name && (
                  <td className="max-w-[250px] truncate px-3 py-2 text-slate-900" title={op.payment_name}>
                    {op.payment_name || '—'}
                  </td>
                )}
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                  <span className={op.amount < 0 ? 'text-red-600 font-medium' : 'text-emerald-700 font-medium'}>
                    {op.amount.toLocaleString('ru-RU', {
                      style: 'currency',
                      currency: 'RUB',
                    })}
                  </span>
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-slate-700" title={Number.isFinite(op.vat_rate) ? `${(op.vat_rate * 100).toFixed(1)}%` : '0.0%'}>
                  {Number.isFinite(op.vat_rate) ? `${(op.vat_rate * 100).toFixed(1)}%` : '0.0%'}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-slate-900">
                  {op.vat_amount.toLocaleString('ru-RU', {
                    style: 'currency',
                    currency: 'RUB',
                  })}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-xs">
                  <span
                    className={`rounded-full px-2 py-0.5 tabular-nums ${
                      op.direction === 'input'
                        ? 'bg-sky-50 text-sky-700 ring-1 ring-sky-200'
                        : 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                    }`}
                  >
                    {op.direction === 'input' ? 'Входящий НДС' : 'Исходящий НДС'}
                  </span>
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-xs">
                  {hasErrors ? (
                    <span className="inline-flex max-w-[220px] items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[11px] text-red-700 ring-1 ring-red-200">
                      {op.errors?.[0] ?? 'Ошибка'}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700 ring-1 ring-emerald-200">
                      ОК
                    </span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {selectedYears.length > 0 && filteredOperations.length === 0 && (
        <div className="px-4 py-6 text-center text-sm text-slate-500">
          Нет операций за выбранные годы
        </div>
      )}
      
      {/* Tooltip overlay */}
      {hoveredRow && tooltipPosition && (() => {
        const op = filteredOperations.find(o => o.id === hoveredRow)
        if (!op) return null
        const tooltipContent = buildTooltipContent(op)
        if (!tooltipContent) return null
        
        return (
          <div 
            className="fixed z-50 bg-slate-900 text-white text-xs rounded-lg px-3 py-2 shadow-xl max-w-md whitespace-pre-line pointer-events-none border border-slate-700"
            style={{
              left: `${tooltipPosition.x + 10}px`,
              top: `${tooltipPosition.y + 10}px`,
            }}
          >
            <div className="font-semibold mb-1 text-sky-300">Дополнительная информация:</div>
            <div className="text-slate-200">{tooltipContent}</div>
          </div>
        )
      })()}
    </div>
  )
}
