import { useState } from 'react'
import * as XLSX from 'xlsx'
import type { Operation } from '../../types/operation'
import { normalizeVatRate, validateOperation, extractVatFromDescription } from '../../lib/vat'

interface OneCUploadProps {
  onParsed: (operations: Operation[]) => void
}

export function OneCUpload({ onParsed }: OneCUploadProps) {
  const [error, setError] = useState<string | null>(null)

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.name.match(/\.(csv|xls|xlsx)$/i)) {
      setError('Неподдерживаемый формат файла. Загрузите CSV или Excel (.csv, .xls, .xlsx).')
      return
    }

    const isCSV = file.name.toLowerCase().endsWith('.csv')
    const reader = new FileReader()
    
    reader.onerror = () => {
      setError('Не удалось прочитать файл.')
    }

    reader.onload = () => {
      try {
        let workbook: XLSX.WorkBook
        
        if (isCSV) {
          const csvText = reader.result as string
          workbook = XLSX.read(csvText, { 
            type: 'string',
            FS: ',',
            RS: '\n'
          })
        } else {
          const data = new Uint8Array(reader.result as ArrayBuffer)
          workbook = XLSX.read(data, { type: 'array' })
        }
        
        const sheetName = workbook.SheetNames[0]
        const sheet = workbook.Sheets[sheetName]
        const rows: any[] = XLSX.utils.sheet_to_json(sheet, { header: 1 })

        if (!rows.length) {
          setError('Файл выглядит пустым.')
          return
        }

        // 1C format: first row is headers
        const headerRow = rows[0]
        const dataRows = rows.slice(1)

        // Build column index map for 1C format
        const headerMap: Record<string, number> = {}
        headerRow.forEach((header: any, index: number) => {
          const headerStr = String(header || '').trim()
          if (headerStr) {
            headerMap[headerStr] = index
          }
        })

        console.log('\n📊 1C File Upload - Column Mapping:')
        console.log('═══════════════════════════════════════════════════════════')
        console.log('Detected columns (0-based index):')
        Object.entries(headerMap).forEach(([header, index]) => {
          console.log(`  Column ${index}: "${header}"`)
        })
        console.log('═══════════════════════════════════════════════════════════')
        console.log(`Total rows to process: ${dataRows.length}`)
        console.log('═══════════════════════════════════════════════════════════\n')

        // Check if this is a line items table (табличная часть) or main document table
        const hasSumma = headerMap['Сумма'] !== undefined
        const hasSummaNDS = headerMap['СуммаНДС'] !== undefined
        const hasVsego = headerMap['Всего'] !== undefined
        const isLineItemsTable = hasSumma || hasSummaNDS || hasVsego
        const isMainTable = headerMap['Date'] !== undefined || headerMap['СуммаДокумента'] !== undefined

        console.log('🔍 Format detection:')
        console.log(`  Has Сумма: ${hasSumma} (index: ${headerMap['Сумма']})`)
        console.log(`  Has СуммаНДС: ${hasSummaNDS} (index: ${headerMap['СуммаНДС']})`)
        console.log(`  Has Всего: ${hasVsego} (index: ${headerMap['Всего']})`)
        console.log(`  Is line items table: ${isLineItemsTable}`)
        console.log(`  Is main table: ${isMainTable}`)

        let operations: Operation[] = []

        if (isLineItemsTable) {
          // This is a line items table - process each line as a separate operation
          console.log('📋 Detected line items table format - processing each line as operation')
          
          operations = dataRows
            .map((row, index) => {
              // Skip empty rows
              if (row.every((cell: unknown) => cell == null || String(cell).trim() === '')) {
                return null
              }

              // Extract from line items columns - try multiple column names
              const summaIndex = headerMap['Сумма']
              const vsegoIndex = headerMap['Всего']
              const summaNDSIndex = headerMap['СуммаНДС']
              const soderzhanieIndex = headerMap['Содержание']
              
              const amount = Number(
                (summaIndex !== undefined ? row[summaIndex] : null) ||
                (vsegoIndex !== undefined ? row[vsegoIndex] : null) ||
                0
              )
              const vatAmount = Number(summaNDSIndex !== undefined ? row[summaNDSIndex] || 0 : 0)
              const description = String(soderzhanieIndex !== undefined ? row[soderzhanieIndex] || '' : '').trim()
              const refKey = String(headerMap['Ref_Key'] !== undefined ? row[headerMap['Ref_Key']] || '' : '').trim()
              const vatRateKey = String(headerMap['СтавкаНДС_Key'] !== undefined ? row[headerMap['СтавкаНДС_Key']] || '' : '').trim()
              
              // Debug first few rows
              if (index < 5) {
                console.log(`\n  Row ${index + 1}:`)
                console.log(`    Raw row length: ${row.length}`)
                console.log(`    Сумма index: ${summaIndex}, value: ${row[summaIndex]}, parsed: ${amount}`)
                console.log(`    СуммаНДС index: ${summaNDSIndex}, value: ${row[summaNDSIndex]}, parsed: ${vatAmount}`)
                console.log(`    Всего index: ${vsegoIndex}, value: ${vsegoIndex !== undefined ? row[vsegoIndex] : 'N/A'}`)
                console.log(`    Содержание: ${description.substring(0, 50)}`)
                console.log(`    Full row sample:`, row.slice(0, 5))
              }
              
              // Skip rows without amount
              if (amount === 0) {
                if (index < 5) {
                  console.log(`    ⚠️ Skipping row ${index + 1} - amount is 0`)
                }
                return null
              }

              // Determine VAT rate from key or calculate from amount and VAT
              let vat_rate = 0
              if (vatAmount > 0 && amount > 0) {
                // Calculate rate: VAT = Amount * rate / (1 + rate)
                // So: rate = VAT / (Amount - VAT)
                const amountWithoutVat = amount - vatAmount
                if (amountWithoutVat > 0) {
                  vat_rate = vatAmount / amountWithoutVat
                  // Normalize to common rates
                  if (vat_rate > 0.19 && vat_rate < 0.21) vat_rate = 0.20
                  else if (vat_rate > 0.09 && vat_rate < 0.11) vat_rate = 0.10
                  else if (vat_rate > 0.19 && vat_rate < 0.21) vat_rate = 0.20
                }
              }
              
              // If VAT rate key suggests a rate, use it
              if (vatRateKey && !vat_rate) {
                // Common VAT rate keys in 1C
                if (vatRateKey.includes('20') || vatRateKey.includes('18')) vat_rate = 0.20
                else if (vatRateKey.includes('10')) vat_rate = 0.10
                else if (vatRateKey.includes('0')) vat_rate = 0
              }

              // Default to 20% if we have VAT but no rate
              if (vatAmount > 0 && !vat_rate) {
                vat_rate = 0.20
              }

              // For line items, we don't know direction - default to input (expenses)
              // User can review and adjust if needed
              const direction: 'input' | 'output' = 'input'

              const op: Operation = {
                id: `${file.name}-1c-line-${index}`,
                date: new Date().toISOString(), // No date in line items, use current date
                amount: Math.abs(amount),
                vat_rate: normalizeVatRate(vat_rate * 100) / 100, // Convert to decimal
                vat_amount: Math.abs(vatAmount),
                counterparty: description.substring(0, 100) || 'Не указан',
                source: `${file.name} (строка ${index + 1})`,
                direction,
              }

              const errors = validateOperation(op)
              if (errors.length) {
                op.errors = errors
              }

              return op
            })
            .filter((op): op is Operation => op !== null)
        } else if (isMainTable) {
          // Original main document table format
          console.log('📋 Detected main document table format')
          
          operations = dataRows
            .map((row, index) => {
              // Skip empty rows
              if (row.every((cell: unknown) => cell == null || String(cell).trim() === '')) {
                return null
              }

              // Extract data from 1C columns
              const dateStr = row[headerMap['Date']] || row[headerMap['Дата']] || ''
              const documentAmount = Number(row[headerMap['СуммаДокумента']] || 0)
              const paymentPurpose = String(row[headerMap['НазначениеПлатежа']] || '').trim()
              const operationType = String(row[headerMap['ВидОперации']] || '').trim()
              const documentNumber = String(row[headerMap['Number']] || '').trim()

              // Skip rows without amount
              if (documentAmount === 0) {
                return null
              }

              // Determine direction from operation type
              let direction: 'input' | 'output' = 'input'
              if (operationType.toLowerCase().includes('отпокупателя') || 
                  operationType.toLowerCase() === 'отпокупателя') {
                direction = 'output'
              }

              // Extract VAT from payment purpose
              let vat_amount = 0
              let vat_rate = 0
              
              if (paymentPurpose) {
                vat_amount = extractVatFromDescription(paymentPurpose)
                
                if (vat_amount > 0) {
                  const rateMatch = paymentPurpose.match(/(\d+)\s*%/) || 
                                    paymentPurpose.match(/ндс\s*\(?\s*(\d+)\s*%?\)?/i)
                  if (rateMatch) {
                    const parsedRate = parseInt(rateMatch[1])
                    if (parsedRate <= 100) {
                      vat_rate = normalizeVatRate(parsedRate)
                    } else {
                      vat_rate = 0.20
                    }
                  } else {
                    vat_rate = 0.20
                  }
                }
              }

              // Extract counterparty name
              let counterparty = paymentPurpose?.substring(0, 100) || documentNumber || 'Не указан'
              
              const companyMatch = paymentPurpose.match(/ООО\s+"([^"]+)"/) || 
                                  paymentPurpose.match(/(ООО|ЗАО|ОАО|ИП)\s+[^,]+/)
              if (companyMatch) {
                counterparty = companyMatch[0].trim()
              }

              const op: Operation = {
                id: `${file.name}-1c-${index}`,
                date: normalizeDate(dateStr),
                amount: Math.abs(documentAmount),
                vat_rate,
                vat_amount,
                counterparty: counterparty.substring(0, 100),
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
        } else {
          setError('Не удалось определить формат файла. Убедитесь, что файл содержит колонки: Date/Дата, СуммаДокумента или Сумма/СуммаНДС')
          return
        }

        console.log(`✅ Parsed ${operations.length} operations from 1C file`)
        setError(null)
        onParsed(operations)
      } catch (err) {
        console.error('Error parsing 1C file:', err)
        setError('Не удалось разобрать файл 1C. Проверьте формат и структуру колонок.')
      }
    }

    if (isCSV) {
      reader.readAsText(file, 'UTF-8')
    } else {
      reader.readAsArrayBuffer(file)
    }
  }

  return (
    <div className="flex flex-col items-center justify-center gap-3 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-purple-50 text-purple-500">
        <span className="text-xl">📊</span>
      </div>
      <div className="space-y-1 text-xs">
        <p className="font-medium text-slate-800">Загрузите файл из 1С</p>
        <p className="text-slate-500">CSV или Excel экспорт из 1С:Бухгалтерия</p>
      </div>
      <label className="inline-flex cursor-pointer items-center justify-center rounded-full border border-slate-300 bg-white px-4 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50">
        <span>Выбрать файл 1С</span>
        <input type="file" accept=".csv,.xls,.xlsx" onChange={handleChange} className="hidden" />
      </label>
      {error && <p className="text-xs text-red-500">{error}</p>}
      <div className="mt-2 text-xs text-slate-500 max-w-xs">
        <p>Ожидаемые колонки:</p>
        <ul className="list-disc list-inside text-left mt-1 space-y-0.5">
          <li>Date / Дата</li>
          <li>СуммаДокумента</li>
          <li>НазначениеПлатежа</li>
          <li>ВидОперации</li>
        </ul>
      </div>
    </div>
  )
}

function normalizeDate(value: unknown): string {
  if (value == null) return ''
  if (value instanceof Date) return value.toISOString()
  
  const str = String(value).trim()
  
  // Handle ISO format: 2014-08-22T12:00:00
  if (str.includes('T')) {
    const date = new Date(str)
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString()
    }
  }
  
  // Handle Russian date formats
  const ruDateMatch = str.match(/^(\d{1,2})[.\/](\d{1,2})[.\/](\d{2,4})$/)
  if (ruDateMatch) {
    const [, day, month, year] = ruDateMatch
    const fullYear = year.length === 2 ? 2000 + parseInt(year) : parseInt(year)
    const date = new Date(fullYear, parseInt(month) - 1, parseInt(day))
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString()
    }
  }
  
  // Try standard parsing
  const parsed = Date.parse(str)
  if (!Number.isNaN(parsed)) {
    return new Date(parsed).toISOString()
  }
  
  return ''
}

