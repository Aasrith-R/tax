import {
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Title,
  Tooltip,
} from 'chart.js'
import { Line } from 'react-chartjs-2'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend)

interface TaxLoadChartProps {
  data: { month: string; net_vat: number }[]
}

export function TaxLoadChart({ data }: TaxLoadChartProps) {
  if (!data.length) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Налоговая нагрузка</h2>
        <p className="mt-1 text-[11px] text-slate-500">Загрузите операции, чтобы увидеть динамику НДС по месяцам.</p>
      </div>
    )
  }

  const labels = data.map((d) => d.month)
  const values = data.map((d) => d.net_vat)

  const chartData = {
    labels,
    datasets: [
      {
        label: 'Итоговый НДС',
        data: values,
        borderColor: '#22c55e',
        backgroundColor: 'rgba(34, 197, 94, 0.15)',
        tension: 0.3,
        fill: true,
        pointRadius: 3,
      },
    ],
  }

  const options = {
    responsive: true,
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        callbacks: {
          label: (ctx: any) =>
            ctx.parsed.y.toLocaleString('ru-RU', {
              style: 'currency',
              currency: 'RUB',
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            }),
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: '#64748b', font: { size: 10 } },
      },
      y: {
        grid: { color: 'rgba(148, 163, 184, 0.12)' },
        ticks: {
          color: '#64748b',
          font: { size: 10 },
          callback: (value: any) =>
            Number(value).toLocaleString('ru-RU', { maximumFractionDigits: 0 }),
        },
      },
    },
  } as const

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900">Налоговая нагрузка</h2>
      <p className="mt-1 text-[11px] text-slate-500">Итоговый НДС по месяцам на основе загружённых операций.</p>
      <div className="mt-3 h-40">
        <Line data={chartData} options={options} />
      </div>
    </div>
  )
}
