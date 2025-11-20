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
            <h1 className="text-lg font-semibold tracking-tight text-slate-900">VAT Analyzer</h1>
            <p className="mt-0.5 text-xs text-slate-500">
              Upload operations, validate VAT, and review your tax position before sending to 1C/Sber.
            </p>
          </div>
          <div className="flex flex-col items-end gap-1 text-[11px] text-slate-500">
            <span className="rounded-full border border-emerald-500/50 bg-emerald-50 px-3 py-0.5 font-medium text-emerald-700">
              Stage 1 · Browser-only prototype
            </span>
            <span>
              {operations.length
                ? `${operations.length.toLocaleString()} operations loaded`
                : 'No data loaded yet'}
            </span>
          </div>
        </div>
      </div>

      <main className="mx-auto flex min-h-[calc(100vh-56px)] max-w-6xl flex-col gap-6 px-4 py-6">
        {operations.length === 0 ? (
          <section className="mx-auto flex w-full max-w-3xl flex-col gap-6">
            <div className="text-center">
              <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Get Started</h2>
              <p className="mt-2 text-sm text-slate-500">
                Upload your Excel or CSV file to automatically calculate VAT obligations.
              </p>
            </div>

            <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-10 shadow-sm">
              <FileUpload onParsed={setOperations} />
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-6 py-4 text-xs text-slate-600">
              <p className="font-medium text-slate-700">Expected file format:</p>
              <ul className="mt-2 space-y-1 list-disc pl-4">
                <li>
                  <span className="font-semibold">date</span> – Transaction date (YYYY-MM-DD or DD/MM/YYYY)
                </li>
                <li>
                  <span className="font-semibold">amount</span> – Transaction amount (numeric)
                </li>
                <li>
                  <span className="font-semibold">vat_rate</span> – VAT rate in % (e.g. 20, 10, 0)
                </li>
                <li>
                  <span className="font-semibold">counterparty</span> – Client or supplier name
                </li>
              </ul>
            </div>
          </section>
        ) : (
          <section className="flex flex-1 flex-col gap-5">
            <div className="flex items-baseline justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Dashboard</h2>
                <p className="mt-1 text-xs text-slate-500">
                  Analyzing {operations.length.toLocaleString()} operations
                </p>
              </div>
              <FileUpload onParsed={setOperations} />
            </div>

            <div className="grid gap-3 md:grid-cols-4">
              <TotalsBlock totals={totals} operationsCount={operations.length} />
              {/* Simple KPI cards to match the reference layout */}
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Input VAT</p>
                <p className="mt-2 text-lg font-semibold text-slate-900">
                  {totals.input_vat.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </p>
                <p className="mt-1 text-[11px] text-slate-500">VAT paid on purchases</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Output VAT</p>
                <p className="mt-2 text-lg font-semibold text-slate-900">
                  {totals.output_vat.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </p>
                <p className="mt-1 text-[11px] text-slate-500">VAT collected on sales</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Operations</p>
                <p className="mt-2 text-lg font-semibold text-slate-900">
                  {operations.length.toLocaleString()}
                </p>
                <p className="mt-1 text-[11px] text-slate-500">Rows imported</p>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
              <div>
                <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
                  <span className="font-medium text-slate-800">VAT Analysis</span>
                  <span>Monthly breakdown</span>
                </div>
                <TaxLoadChart data={chartData} />
              </div>

              <div className="flex flex-col gap-2">
                {/* small placeholder for future filters / export */}
                <button
                  type="button"
                  className="self-end rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                >
                  Export JSON
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
