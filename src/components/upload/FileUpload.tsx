import { useState } from 'react'
import * as XLSX from 'xlsx'
import type { Operation } from '../../types/operation'
import { computeVatAmount, detectDirection, normalizeVatRate, validateOperation } from '../../lib/vat'

interface FileUploadProps {
  onParsed: (operations: Operation[]) => void
}

const ACCEPTED_TYPES = [
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]

export function FileUpload({ onParsed }: FileUploadProps) {
  const [error, setError] = useState<string | null>(null)

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    if (!ACCEPTED_TYPES.includes(file.type) && !file.name.match(/\.(csv|xls|xlsx)$/i)) {
      setError('Неподдерживаемый формат файла. Загрузите CSV или Excel (.csv, .xls, .xlsx).')
      return
    }

    const reader = new FileReader()
    reader.onerror = () => {
      setError('Не удалось прочитать файл.')
    }
    reader.onload = () => {
      try {
        const data = new Uint8Array(reader.result as ArrayBuffer)
        const workbook = XLSX.read(data, { type: 'array' })
        const sheetName = workbook.SheetNames[0]
        const sheet = workbook.Sheets[sheetName]

        const rows: any[] = XLSX.utils.sheet_to_json(sheet, { header: 1 })
        if (!rows.length) {
          setError('Файл выглядит пустым.')
          return
        }

        const [headerRow, ...dataRows] = rows
        const headerMap = buildHeaderIndex(headerRow as string[])

        const operations: Operation[] = dataRows
          .map((row, index) => {
            // Skip completely empty rows
            if (row.every((cell: unknown) => cell == null || String(cell).trim() === '')) {
              return null
            }
            
            const rawDate = getCell(row, headerMap, 'date')
            const rawAmount = Number(getCell(row, headerMap, 'amount'))
            const rawVatRate = getCell(row, headerMap, 'vat_rate')
            const rawVatAmount = getCell(row, headerMap, 'vat_amount')
            const counterparty = String(getCell(row, headerMap, 'counterparty') ?? '').trim()

            const vat_rate = normalizeVatRate(rawVatRate)
            const vat_amount = computeVatAmount(rawAmount, vat_rate, rawVatAmount)
            const direction = detectDirection(rawAmount)

            const op: Operation = {
              id: `${file.name}-${index}`,
              date: normalizeDate(rawDate),
              amount: rawAmount,
              vat_rate,
              vat_amount,
              counterparty,
              source: file.name,
              direction,
            }

            const errors = validateOperation(op)
            if (errors.length) {
              op.errors = errors
            }

            return op
          })
          .filter((op): op is Operation => op !== null)

        setError(null)
        onParsed(operations)
      } catch (err) {
        console.error(err)
        setError('Не удалось разобрать файл. Проверьте формат и структуру колонок.')
      }
    }

    reader.readAsArrayBuffer(file)
  }

  return (
    <div className="flex flex-col items-center justify-center gap-3 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-sky-50 text-sky-500">
        <span className="text-xl">📄</span>
      </div>
      <div className="space-y-1 text-xs">
        <p className="font-medium text-slate-800">Перетащите файл Excel или CSV сюда</p>
        <p className="text-slate-500">или нажмите, чтобы выбрать</p>
      </div>
      <label className="inline-flex cursor-pointer items-center justify-center rounded-full border border-slate-300 bg-white px-4 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50">
        <span>Выбрать файл</span>
        <input type="file" accept=".csv,.xls,.xlsx" onChange={handleChange} className="hidden" />
      </label>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
}

function buildHeaderIndex(headers: string[]) {
  const map: Record<string, number> = {}
  headers.forEach((h, index) => {
    const key = String(h || '')
      .trim()
      .toLowerCase()
      .replace(/[^\wа-яё\s]/g, '') // Remove special characters except Russian letters
    
    // Date columns
    if (['date', 'дата', 'дат', 'дата операции', 'датаоперации'].includes(key)) map.date = index
    
    // Amount columns  
    if (['amount', 'sum', 'сумма', 'сум', 'сумма операции', 'суммаоперации', 'стоимость'].includes(key)) map.amount = index
    
    // VAT rate columns
    if (['vat', 'vat_rate', 'ставка ндс', 'ндс', 'ставка', 'процент ндс', 'процентндс'].includes(key)) map.vat_rate = index
    
    // VAT amount columns
    if (['vat_amount', 'сумма ндс', 'ндс сумма', 'суммандс', 'ндс руб'].includes(key)) map.vat_amount = index
    
    // Counterparty columns
    if (['counterparty', 'контрагент', 'клиент', 'поставщик', 'партнер', 'организация'].includes(key)) map.counterparty = index
  })
  return map
}

function getCell(row: any[], map: Record<string, number>, key: keyof typeof map): unknown {
  const idx = map[key]
  if (idx == null) return undefined
  return row[idx]
}

function normalizeDate(value: unknown): string {
  if (value == null) return ''
  if (value instanceof Date) return value.toISOString()

  // SheetJS often gives Excel dates as numbers (days since 1899-12-30)
  if (typeof value === 'number' && Number.isFinite(value)) {
    const excelEpoch = new Date(1899, 11, 30)
    const msPerDay = 24 * 60 * 60 * 1000
    const jsDate = new Date(excelEpoch.getTime() + value * msPerDay)
    return jsDate.toISOString()
  }

  const str = String(value).trim()
  
  // Handle Russian date formats: DD.MM.YYYY, DD/MM/YYYY
  const ruDateMatch = str.match(/^(\d{1,2})[.\/](\d{1,2})[.\/](\d{2,4})$/)
  if (ruDateMatch) {
    const [, day, month, year] = ruDateMatch
    const fullYear = year.length === 2 ? 2000 + parseInt(year) : parseInt(year)
    const date = new Date(fullYear, parseInt(month) - 1, parseInt(day))
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString()
    }
  }
  
  // Handle ISO and other standard formats
  const parsed = Date.parse(str)
  if (!Number.isNaN(parsed)) {
    return new Date(parsed).toISOString()
  }

  return ''
}
