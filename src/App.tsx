import { useMemo, useState } from 'react'
import './App.css'
import type { Operation } from './types/operation'
import { calculateTotals, groupNetVatByMonth } from './lib/vat'
import { FileUpload } from './components/upload/FileUpload'
import { OperationsTable } from './components/dashboard/OperationsTable'
import { TotalsBlock } from './components/dashboard/TotalsBlock'
import { TaxLoadChart } from './components/dashboard/TaxLoadChart'

function App() {
  const [operations, setOperations] = useState<Operation[]>([])

  const totals = useMemo(() => calculateTotals(operations), [operations])
  const chartData = useMemo(() => groupNetVatByMonth(operations), [operations])

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <div className="border-b border-slate-200 bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-slate-900">НДС калькулятор</h1>
            <p className="mt-0.5 text-xs text-slate-500">
              Загружайте операции, проверяйте НДС и анализируйте налоговую нагрузку перед выгрузкой в 1С / банк.
            </p>
          </div>
          <div className="flex flex-col items-end gap-1 text-[11px] text-slate-500">
            <span className="rounded-full border border-emerald-500/50 bg-emerald-50 px-3 py-0.5 font-medium text-emerald-700">
              Этап 1 · Прототип в браузере
            </span>
            <span>
              {operations.length
                ? `${operations.length.toLocaleString('ru-RU')} операций загружено`
                : 'Данные ещё не загружены'}
            </span>
          </div>
        </div>
      </div>

      <main className="mx-auto flex min-h-[calc(100vh-56px)] max-w-6xl flex-col gap-6 px-4 py-6">
        {operations.length === 0 ? (
          <section className="mx-auto flex w-full max-w-3xl flex-col gap-6">
            <div className="text-center">
              <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Начало работы</h2>
              <p className="mt-2 text-sm text-slate-500">
                Загрузите файл Excel или CSV, чтобы автоматически рассчитать НДС по операциям.
              </p>
            </div>

            <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-10 shadow-sm">
              <FileUpload onParsed={setOperations} />
            </div>

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
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Дашборд</h2>
                <p className="mt-1 text-xs text-slate-500">
                  Анализ {operations.length.toLocaleString('ru-RU')} операций
                </p>
              </div>
              <FileUpload onParsed={setOperations} />
            </div>

            <div className="grid gap-3 md:grid-cols-4">
              <TotalsBlock totals={totals} operationsCount={operations.length} />
              {/* Дополнительные KPI карточки */}
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

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
              <div>
                <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
                  <span className="font-medium text-slate-800">Аналитика по НДС</span>
                  <span>Разбивка по месяцам</span>
                </div>
                <TaxLoadChart data={chartData} />
              </div>

              <div className="flex flex-col gap-2">
                {/* место под фильтры / экспорт */}
                <button
                  type="button"
                  className="self-end rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                >
                  Экспорт JSON
                </button>
                <OperationsTable operations={operations} />
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  )
}

export default App
