import type { Operation } from '../../types/operation'

interface OperationsTableProps {
  operations: Operation[]
}

export function OperationsTable({ operations }: OperationsTableProps) {
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

  return (
    <div className="mt-4 w-full max-w-full overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="min-w-[720px] divide-y divide-slate-200 text-[10px] sm:text-[11px]">
        <thead className="bg-slate-50">
          <tr>
            <th className="px-3 py-2 text-left font-medium uppercase tracking-wide text-slate-400">Дата</th>
            <th className="px-3 py-2 text-left font-medium uppercase tracking-wide text-slate-400">Контрагент</th>
            <th className="px-3 py-2 text-right font-medium uppercase tracking-wide text-slate-400">Сумма, ₽</th>
            <th className="px-3 py-2 text-right font-medium uppercase tracking-wide text-slate-400">Ставка НДС</th>
            <th className="px-3 py-2 text-right font-medium uppercase tracking-wide text-slate-400">НДС, ₽</th>
            <th className="px-3 py-2 text-left font-medium uppercase tracking-wide text-slate-400">Тип НДС</th>
            <th className="px-3 py-2 text-left font-medium uppercase tracking-wide text-slate-400">Источник</th>
            <th className="px-3 py-2 text-left font-medium uppercase tracking-wide text-slate-400">Качество</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {operations.map((op) => {
            const hasErrors = !!op.errors?.length
            return (
              <tr
                key={op.id}
                className={`${hasErrors ? 'bg-red-50' : 'odd:bg-white even:bg-slate-50'} hover:bg-slate-100 transition-colors`}
              >
                <td className="whitespace-nowrap px-3 py-2 text-slate-900">
                  {op.date ? new Date(op.date).toLocaleDateString('ru-RU') : '—'}
                </td>
                <td className="max-w-[200px] truncate px-3 py-2 text-slate-900" title={op.counterparty}>
                  {op.counterparty || '—'}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-slate-900">
                  {op.amount.toLocaleString('ru-RU', {
                    style: 'currency',
                    currency: 'RUB',
                  })}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-slate-700">
                  {(op.vat_rate * 100).toFixed(1)}%
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
    </div>
  )
}
