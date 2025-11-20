import type { VatTotals } from '../../types/operation'

interface TotalsBlockProps {
  totals: VatTotals
  operationsCount: number
}

export function TotalsBlock({ totals, operationsCount }: TotalsBlockProps) {
  const netLabel = totals.net_vat >= 0 ? 'To pay' : 'To refund'
  const netColor = totals.net_vat >= 0 ? 'text-amber-300' : 'text-emerald-300'

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="h-0.5 w-14 rounded-full bg-gradient-to-r from-emerald-500 to-sky-500" />
      <div className="mt-2">
        <h2 className="text-sm font-semibold text-slate-900">Totals</h2>
        <p className="mt-1 text-[11px] text-slate-500">Live VAT snapshot based on the uploaded dataset.</p>

        <dl className="mt-4 space-y-3 text-xs">
          <div className="flex items-baseline justify-between">
            <dt className="text-slate-500">Operations</dt>
            <dd className="font-semibold text-slate-900 tabular-nums">
              {operationsCount.toLocaleString()}
            </dd>
          </div>
          <div className="flex items-baseline justify-between">
            <dt className="text-slate-500">Input VAT</dt>
            <dd className="font-medium text-slate-900 tabular-nums">
              {totals.input_vat.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </dd>
          </div>
          <div className="flex items-baseline justify-between">
            <dt className="text-slate-500">Output VAT</dt>
            <dd className="font-medium text-slate-900 tabular-nums">
              {totals.output_vat.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </dd>
          </div>
          <div className="flex items-baseline justify-between border-t border-slate-200 pt-3">
            <dt className="text-slate-500">Net VAT ({netLabel})</dt>
            <dd className={`${netColor} font-semibold tabular-nums`}>
              {totals.net_vat.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  )
}
