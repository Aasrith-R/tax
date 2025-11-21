import type { VatTotals } from '../../types/operation'
import { getVatSummary } from '../../lib/vat'

interface TotalsBlockProps {
  totals: VatTotals
  operationsCount: number
}

export function TotalsBlock({ totals, operationsCount }: TotalsBlockProps) {
  const vatSummary = getVatSummary(totals)
  const netColor = vatSummary.type === 'payment' ? 'text-amber-500' : 'text-emerald-600'

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="h-0.5 w-14 rounded-full bg-gradient-to-r from-emerald-500 to-sky-500" />
      <div className="mt-2">
        <h2 className="text-sm font-semibold text-slate-900">Итоги по НДС</h2>
        <p className="mt-1 text-[11px] text-slate-500">Расчёт по загружённым операциям (в рублях).</p>

        <dl className="mt-4 space-y-3 text-xs">
          <div className="flex items-baseline justify-between">
            <dt className="text-slate-500">Операции</dt>
            <dd className="font-semibold text-slate-900 tabular-nums">
              {operationsCount.toLocaleString('ru-RU')}
            </dd>
          </div>
          <div className="flex items-baseline justify-between">
            <dt className="text-slate-500">Входящий НДС</dt>
            <dd className="font-medium text-slate-900 tabular-nums">
              {totals.input_vat.toLocaleString('ru-RU', {
                style: 'currency',
                currency: 'RUB',
              })}
            </dd>
          </div>
          <div className="flex items-baseline justify-between">
            <dt className="text-slate-500">Исходящий НДС</dt>
            <dd className="font-medium text-slate-900 tabular-nums">
              {totals.output_vat.toLocaleString('ru-RU', {
                style: 'currency',
                currency: 'RUB',
              })}
            </dd>
          </div>
          <div className="flex items-baseline justify-between border-t border-slate-200 pt-3">
            <dt className="text-slate-500">{vatSummary.description}</dt>
            <dd className={`${netColor} font-semibold tabular-nums`}>
              {vatSummary.amount.toLocaleString('ru-RU', {
                style: 'currency',
                currency: 'RUB',
              })}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  )
}
