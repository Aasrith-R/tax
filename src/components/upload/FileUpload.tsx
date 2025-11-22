import { useState } from 'react'
import * as XLSX from 'xlsx'
import type { Operation } from '../../types/operation'
import { normalizeVatRate, validateOperation, extractVatFromDescription } from '../../lib/vat'

interface FileUploadProps {
  onParsed: (operations: Operation[]) => void
}

const ACCEPTED_TYPES = [
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]

/**
 * CRITICAL FIX: Direction detection based ONLY on which column has the amount
 * 
 * For SberBank statements:
 * - If amount in DEBIT column (Сумма по дебету) = YOU PAID = INPUT VAT (deductible)
 * - If amount in CREDIT column (Сумма по кредиту) = YOU RECEIVED = OUTPUT VAT (payable)
 * 
 * Operation codes '01', '02', '17' are NOT reliable for direction detection!
 */
function detectDirectionLocal(debitAmount: number, creditAmount: number): 'input' | 'output' {
  // The ONLY reliable indicator is which column has the non-zero amount
  if (debitAmount > 0 && creditAmount === 0) {
    return 'input'  // Debit = you paid = Input VAT (deductible)
  }
  if (creditAmount > 0 && debitAmount === 0) {
    return 'output' // Credit = you received = Output VAT (payable)
  }
  
  // Fallback (should never happen in proper SberBank statements)
  return debitAmount > creditAmount ? 'input' : 'output'
}

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

        const { headerRow, dataRows } = findHeaderAndDataRows(rows)
        const headerMap = buildHeaderIndex(headerRow as string[])

        console.log('Header mapping:', headerMap)

        const operations: Operation[] = dataRows
          .map((row, index) => {
            // Skip completely empty rows
            if (row.every((cell: unknown) => cell == null || String(cell).trim() === '')) {
              return null
            }
            
            const rawDate = getCell(row, headerMap, 'date')
            const rawDebitAmount = Number(getCell(row, headerMap, 'debit_amount') || 0)
            const rawCreditAmount = Number(getCell(row, headerMap, 'credit_amount') || 0)
            const counterparty = String(getCell(row, headerMap, 'counterparty') ?? '').trim()
            const paymentPurpose = String(getCell(row, headerMap, 'payment_purpose') ?? '').trim()
            
            // Skip rows without both amounts (likely header or summary rows)
            if (rawDebitAmount === 0 && rawCreditAmount === 0) {
              return null
            }
            
            // CRITICAL: Determine direction ONLY from which column has the amount
            const direction = detectDirectionLocal(rawDebitAmount, rawCreditAmount)
            
            // For amount: use the non-zero value (always positive)
            const rawAmount = rawDebitAmount > 0 ? rawDebitAmount : rawCreditAmount
            
            // Extract VAT from payment purpose description
            let vat_amount = 0
            let vat_rate = 0
            
            if (paymentPurpose) {
              vat_amount = extractVatFromDescription(paymentPurpose)
              
              // Try to infer rate from the text if VAT was found
              if (vat_amount > 0) {
                const rateMatch = paymentPurpose.match(/(\d+)\s*%/) || 
                                  paymentPurpose.match(/ндс\s*\(?\s*(\d+)\s*%?\)?/i)
                if (rateMatch) {
                  const parsedRate = parseInt(rateMatch[1])
                  // Filter out unrealistic rates (like 11250 which is actually an amount)
                  if (parsedRate <= 100) {
                    vat_rate = normalizeVatRate(parsedRate)
                  } else {
                    // Likely mistook amount for rate, use default 20%
                    vat_rate = 0.20
                  }
                } else {
                  // Default to 20% if VAT amount exists but no rate found
                  vat_rate = 0.20
                }
              }
            }
            
            // Debug logging for first few rows and credit operations
            if (index < 10 || rawCreditAmount > 0) {
              console.log(`Row ${index}:`, {
                rawDate,
                debit: rawDebitAmount,
                credit: rawCreditAmount,
                amount: rawAmount,
                direction,
                vat_amount,
                vat_rate,
                counterparty: counterparty || paymentPurpose?.substring(0, 50)
              })
            }

            const op: Operation = {
              id: `${file.name}-${index}`,
              date: normalizeDate(rawDate),
              amount: rawAmount,
              vat_rate,
              vat_amount,
              counterparty: counterparty || paymentPurpose?.substring(0, 50) || 'Не указан',
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

        console.log(`Parsed ${operations.length} operations`)
        const inputOps = operations.filter(op => op.direction === 'input')
        const outputOps = operations.filter(op => op.direction === 'output')
        console.log(`Input operations: ${inputOps.length}, Output operations: ${outputOps.length}`)
        console.log('Sample output operations:', outputOps.slice(0, 5))

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

function findHeaderAndDataRows(rows: any[]): { headerRow: any[]; dataRows: any[] } {
  if (!rows.length) {
    return { headerRow: [], dataRows: [] }
  }

  const headerIndex = rows.findIndex(row => {
    if (!Array.isArray(row)) return false
    return row.some(cell => {
      if (cell == null) return false
      const text = String(cell).trim().toLowerCase()
      return (
        text.includes('дата проводки') ||
        text.includes('дата операции') ||
        text === 'дата' ||
        text === 'date'
      )
    })
  })

  if (headerIndex === -1) {
    return { headerRow: rows[0], dataRows: rows.slice(1) }
  }

  return {
    headerRow: rows[headerIndex],
    dataRows: rows.slice(headerIndex + 1),
  }
}

function buildHeaderIndex(headers: string[]) {
  const map: Record<string, number> = {}
  
  headers.forEach((h, index) => {
    const key = String(h || '')
      .trim()
      .toLowerCase()
      .replace(/[^\wа-яё\s]/g, '')
    
    const originalHeader = String(h || '').trim()
    
    // Date columns
    if (['date', 'дата', 'дат', 'дата операции', 'датаоперации', '日付', 'дата проводки', 'датапроводки'].includes(key) || originalHeader === '日付') {
      map.date = index
    }
    
    // Debit amount (expenses - INPUT VAT) - CRITICAL COLUMN
    if (['сумма по дебету', 'суммаподебету', 'дебет', 'debit'].includes(key)) {
      map.debit_amount = index
    }
    
    // Credit amount (income - OUTPUT VAT) - CRITICAL COLUMN
    if (['сумма по кредиту', 'суммапокредиту', 'кредит', 'credit'].includes(key)) {
      map.credit_amount = index
    }
    
    // Counterparty columns
    if (['counterparty', 'контрагент', 'клиент', 'поставщик', 'партнер', 'организация', '相手先', 'банк (бик и наименование)', 'банк бик и наименование'].includes(key) || originalHeader === '相手先') {
      map.counterparty = index
    }
    
    // Payment purpose columns (SberBank specific - contains VAT info)
    if (['назначение платежа', 'назначениеплатежа', 'payment purpose', 'purpose'].includes(key)) {
      map.payment_purpose = index
    }
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
  
  // Handle Japanese date formats: YYYY/MM/DD, YYYY/MM/DD (年/月/日)
  const jpDateMatch = str.match(/^(\d{4})[\/年](\d{1,2})[\/月](\d{1,2})[日]?$/)
  if (jpDateMatch) {
    const [, year, month, day] = jpDateMatch
    const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day))
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
