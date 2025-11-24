import { useState } from 'react'
import * as XLSX from 'xlsx'
import type { Operation } from '../../types/operation'
import { computeVatAmount, normalizeVatRate, validateOperation, extractVatFromDescription } from '../../lib/vat'

interface FileUploadProps {
  onParsed: (operations: Operation[]) => void
}

const ACCEPTED_TYPES = [
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]

/**
 * Extract counterparty name from Debit/Credit account string
 * Format: "40702810038000147369\n7736289024\nООО "КЬЮ БИ ЭС""
 * We want the third line (company name)
 */
function extractCounterpartyName(accountString: string): string {
  if (!accountString) return ''
  
  // Split by newlines and clean up
  const lines = accountString.split('\n').map(l => l.trim()).filter(l => l.length > 0)
  
  // The counterparty name is typically on the 3rd line
  if (lines.length >= 3) {
    const name = lines[2]
    // Clean up quotes if present
    return name.replace(/^["']|["']$/g, '').trim()
  }
  
  // Fallback: if we have 2 lines, the second is probably the name
  if (lines.length === 2) {
    const name = lines[1]
    return name.replace(/^["']|["']$/g, '').trim()
  }
  
  // Last fallback: return the longest line that doesn't look like account number
  if (lines.length > 0) {
    const nonAccountLines = lines.filter(l => !/^\d{20}$/.test(l) && !/^\d{10}$/.test(l))
    if (nonAccountLines.length > 0) {
      return nonAccountLines.reduce((longest, current) => 
        current.length > longest.length ? current : longest
      , '').replace(/^["']|["']$/g, '').trim()
    }
  }
  
  return ''
}

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
        console.log('Headers found:', headerRow)
        
        // CRITICAL: If debit_account and credit_account not found, try to infer from structure
        // SberBank format typically has structure: [Дата проводки] [Счет: Дебет] [Счет: Кредит] [Сумма по дебету] [Сумма по кредиту]
        if (headerMap.debit_account === undefined || headerMap.credit_account === undefined) {
          // Look for the second row which might have "Дебет" and "Кредит"
          if (dataRows.length > 0) {
            const possibleSubheader = dataRows[0]
            possibleSubheader.forEach((cell: unknown, idx: number) => {
              const cellText = String(cell || '').trim()
              if (cellText === 'Дебет' && headerMap.debit_account === undefined) {
                headerMap.debit_account = idx
                console.log('Found Дебет account column at index:', idx)
              }
              if (cellText === 'Кредит' && headerMap.credit_account === undefined) {
                headerMap.credit_account = idx
                console.log('Found Кредит account column at index:', idx)
              }
            })
            
            // If we found subheaders, skip the subheader row
            if (headerMap.debit_account !== undefined && headerMap.credit_account !== undefined) {
              dataRows.shift() // Remove the subheader row
            }
          }
        }

        const operations: Operation[] = dataRows
          .map((row, index) => {
            // Skip completely empty rows
            if (row.every((cell: unknown) => cell == null || String(cell).trim() === '')) {
              return null
            }
            
            const rawDate = getCell(row, headerMap, 'date')
            const rawDebitAmount = Number(getCell(row, headerMap, 'debit_amount') || 0)
            const rawCreditAmount = Number(getCell(row, headerMap, 'credit_amount') || 0)
            const paymentPurpose = String(getCell(row, headerMap, 'payment_purpose') ?? '').trim()
            
            // Extract counterparty name from Debit or Credit account columns
            let counterparty = ''
            if (rawDebitAmount > 0) {
              // For expenses (debit), get counterparty from Credit account column
              const creditAccount = String(getCell(row, headerMap, 'credit_account') ?? '')
              counterparty = extractCounterpartyName(creditAccount)
            } else if (rawCreditAmount > 0) {
              // For income (credit), get counterparty from Debit account column
              const debitAccount = String(getCell(row, headerMap, 'debit_account') ?? '')
              counterparty = extractCounterpartyName(debitAccount)
            }
            
            // Fallback to explicit counterparty column if available
            if (!counterparty) {
              counterparty = String(getCell(row, headerMap, 'counterparty') ?? '').trim()
            }
            
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
                counterparty,
                debitAccount: rawDebitAmount > 0 ? 'N/A' : String(getCell(row, headerMap, 'debit_account') ?? '').substring(0, 100),
                creditAccount: rawCreditAmount > 0 ? 'N/A' : String(getCell(row, headerMap, 'credit_account') ?? '').substring(0, 100)
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
    
    // Account columns - look for merged "Счет" header with subheaders
    if (key === 'счет' || originalHeader === 'Счет') {
      // In SberBank format, "Счет" is merged header with "Дебет" and "Кредит" below
      // We'll detect these in the next row
    }
    
    // Debit account (column D in your Excel - contains counterparty name)
    if (originalHeader === 'Дебет' && key === 'дебет') {
      map.debit_account = index
    }
    
    // Credit account (column E in your Excel - contains counterparty name)
    if (originalHeader === 'Кредит' && key === 'кредит') {
      map.credit_account = index
    }
    
    // Debit amount (expenses - INPUT VAT) - CRITICAL COLUMN
    if (key === 'суммаподебету' || originalHeader === 'Сумма по дебету') {
      map.debit_amount = index
    }
    
    // Credit amount (income - OUTPUT VAT) - CRITICAL COLUMN
    if (key === 'суммапокредиту' || originalHeader === 'Сумма по кредиту') {
      map.credit_amount = index
    }
    
    // Counterparty columns (fallback)
    if (['counterparty', 'контрагент', 'клиент', 'поставщик', 'партнер', 'организация', '相手先'].includes(key) || originalHeader === '相手先') {
      map.counterparty = index
    }
    
    // Payment purpose columns (SberBank specific - contains VAT info)
    if (key === 'назначениеплатежа' || originalHeader === 'Назначение платежа') {
      map.payment_purpose = index
    }
  })
  
  // If we didn't find debit_account and credit_account by name, try to infer from structure
  // In SberBank format: column after "Дата проводки" should be "Счет" group
  if (map.date !== undefined && map.debit_account === undefined) {
    // Typically: column 0 = Дата проводки, column 1 = Дебет, column 2 = Кредит
    // But with merged cells, we need to look at actual data rows
    console.log('Warning: Could not find Debit/Credit account columns by header. Will try to detect from data.')
  }
  
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