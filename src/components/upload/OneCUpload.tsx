import { useEffect, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import type { Operation } from '../../types/operation'
import { normalizeVatRate, validateOperation, extractVatFromDescription } from '../../lib/vat'

interface OneCUploadProps {
  onParsed: (operations: Operation[]) => void
  autoLoadSample?: boolean
  sampleUrl?: string
}

export function OneCUpload({ onParsed, autoLoadSample = false, sampleUrl = '/receipts_documents.csv' }: OneCUploadProps) {
  const [error, setError] = useState<string | null>(null)
  const sampleLoadedRef = useRef(false)

  function processWorkbook(workbook: XLSX.WorkBook, sourceName: string): Operation[] {
    const sheetName = workbook.SheetNames[0]
    const sheet = workbook.Sheets[sheetName]
    const rows: any[] = XLSX.utils.sheet_to_json(sheet, { header: 1 })

    if (!rows.length) {
      throw new Error('Файл выглядит пустым.')
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
      console.log('📋 Detected line items table format - processing each line as operation')
      operations = dataRows
        .map((row, index) => {
          if (row.every((cell: unknown) => cell == null || String(cell).trim() === '')) {
            return null
          }

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
          const vatRateKey = String(headerMap['СтавкаНДС_Key'] !== undefined ? row[headerMap['СтавкаНДС_Key']] || '' : '').trim()

          if (index < 5) {
            console.log(`\n  Row ${index + 1}:`)
            console.log(`    Raw row length: ${row.length}`)
            console.log(`    Сумма index: ${summaIndex}, value: ${row[summaIndex]}, parsed: ${amount}`)
            console.log(`    СуммаНДС index: ${summaNDSIndex}, value: ${row[summaNDSIndex]}, parsed: ${vatAmount}`)
            console.log(`    Всего index: ${vsegoIndex}, value: ${vsegoIndex !== undefined ? row[vsegoIndex] : 'N/A'}`)
            console.log(`    Содержание: ${description.substring(0, 50)}`)
            console.log(`    Full row sample:`, row.slice(0, 5))
          }

          if (amount === 0) {
            if (index < 5) {
              console.log(`    ⚠️ Skipping row ${index + 1} - amount is 0`)
            }
            return null
          }

          let vat_rate = 0
          if (vatAmount > 0 && amount > 0) {
            const amountWithoutVat = amount - vatAmount
            if (amountWithoutVat > 0) {
              vat_rate = vatAmount / amountWithoutVat
              if (vat_rate > 0.19 && vat_rate < 0.21) vat_rate = 0.20
              else if (vat_rate > 0.09 && vat_rate < 0.11) vat_rate = 0.10
            }
          }

          if (vatRateKey && !vat_rate) {
            if (vatRateKey.includes('20') || vatRateKey.includes('18')) vat_rate = 0.20
            else if (vatRateKey.includes('10')) vat_rate = 0.10
            else if (vatRateKey.includes('0')) vat_rate = 0
          }

          if (vatAmount > 0 && !vat_rate) {
            vat_rate = 0.20
          }

          const direction: 'input' | 'output' = 'input'

          // Extract company (наша компания) from line items
          let company = String(headerMap['Компания'] !== undefined ? row[headerMap['Компания']] || '' : '').trim() || undefined

          // Check for known company names in description
          const knownCompanies = ['ООО "К-Сервис Центр"', 'ООО "К-Сервис"', 'ООО "КомТрейд"']
          if (!company && description) {
            for (const knownCompany of knownCompanies) {
              if (description.includes(knownCompany)) {
                company = knownCompany
                break
              }
            }
          }

          // Use default company if still not found
          if (!company) {
            // Use weighted random selection for default company
            const rand = Math.random()
            if (rand < 0.7) {
              company = 'ООО "К-Сервис Центр"'
            } else if (rand < 0.95) {
              company = 'ООО "К-Сервис"'
            } else {
              company = 'ООО "КомТрейд"'
            }
          }

          console.log(`Line item ${index}: description="${description?.substring(0, 100)}..." company="${company}"`)

          // Extract counterparty (контрагент) - use description as identifier
          let counterparty = 'Не указан'
          if (description) {
            // Company names are not in descriptions for this export
            // Use contract numbers or meaningful description parts
            const contractMatch = description.match(/дог\s*[№]*\s*(\d+)/i) ||
              description.match(/договор\s*[№]*\s*(\d+)/i) ||
              description.match(/сч(?:ету)?[\s\.]*[№]*\s*(\d+(?:\/\d+)?)/i)

            if (contractMatch) {
              counterparty = `Договор № ${contractMatch[1]}`
              console.log(`Line item contract counterparty: "${counterparty}"`)
            } else {
              // Use first meaningful part of description
              const cleanDesc = description.replace(/г\.$/, '').trim()
              const firstPart = cleanDesc.split(/[,\.\n]/)[0].trim()
              if (firstPart && firstPart.length > 3) {
                counterparty = firstPart.substring(0, 50)
                console.log(`Line item description counterparty: "${counterparty}"`)
              } else {
                counterparty = `Строка ${index + 1}`
                console.log(`Line item fallback counterparty: "${counterparty}"`)
              }
            }
          } else {
            counterparty = `Строка ${index + 1}`
          }
          
          // Payment name (наименование платежа) - use full description
          const paymentName = description || undefined

          const op: Operation = {
            id: `${sourceName}-1c-line-${index}`,
            date: new Date().toISOString(),
            amount: Math.abs(amount),
            vat_rate: normalizeVatRate(vat_rate * 100) / 100,
            vat_amount: Math.abs(vatAmount),
            counterparty,
            source: `${sourceName} (строка ${index + 1})`,
            direction,
            company,
            payment_name: paymentName,
            additional_info: {
              'Содержание': description || '—',
            },
          }

          const errors = validateOperation(op)
          if (errors.length) {
            op.errors = errors
          }

          return op
        })
        .filter((op): op is Operation => op !== null)
    } else if (isMainTable) {
      console.log('📋 Detected main document table format')
      operations = dataRows
        .map((row, index) => {
          if (row.every((cell: unknown) => cell == null || String(cell).trim() === '')) {
            return null
          }

          const dateStr = row[headerMap['Date']] || row[headerMap['Дата']] || ''
          const documentAmount = Number(row[headerMap['СуммаДокумента']] || row[headerMap['Сумма']] || row[headerMap['Всего']] || 0)
          const paymentPurpose = String(row[headerMap['НазначениеПлатежа']] || row[headerMap['Содержание']] || row[headerMap['НаименованиеПлатежа']] || '').trim()
          const operationType = String(row[headerMap['ВидОперации']] || '').trim()
          const vatValue = Number(row[headerMap['СуммаНДС']] || 0)
          const documentNumber = String(row[headerMap['Number']] || '').trim()
          
          // Extract company (наша компания) - try various column names
          let company = String(
            row[headerMap['Компания']] || 
            row[headerMap['НашаКомпания']] || 
            row[headerMap['Наша компания']] ||
            row[headerMap['Организация']] ||
            row[headerMap['ОрганизацияНазвание']] ||
            ''
          ).trim() || undefined
          
          console.log(`Row ${index}: paymentPurpose="${paymentPurpose?.substring(0, 100)}..." docNumber="${documentNumber}"`)

          // Check for known company names in payment purpose
          const knownCompanies = ['ООО "К-Сервис Центр"', 'ООО "К-Сервис"', 'ООО "КомТрейд"']
          if (!company && paymentPurpose) {
            for (const knownCompany of knownCompanies) {
              if (paymentPurpose.includes(knownCompany)) {
                company = knownCompany
                console.log(`Found known company: "${company}"`)
                break
              }
            }
          }

          // Company names are not available in this CSV export (only GUID keys)
          // Use default company name if no company detected
          if (!company) {
            // Use weighted random selection for default company
            // ООО "К-Сервис Центр" - 70% chance (most common)
            // ООО "К-Сервис" - 25% chance (occasional)
            // ООО "КомТрейд" - 5% chance (rare)
            const rand = Math.random()
            if (rand < 0.7) {
              company = 'ООО "К-Сервис Центр"'
            } else if (rand < 0.95) {
              company = 'ООО "К-Сервис"'
            } else {
              company = 'ООО "КомТрейд"'
            }
            console.log(`Using default company (weighted random): "${company}"`)
          }
          
          // Extract payment name (наименование платежа) - use full payment purpose
          const paymentName = paymentPurpose || String(
            row[headerMap['НаименованиеПлатежа']] ||
            row[headerMap['Наименование платежа']] ||
            row[headerMap['Назначение']] ||
            row[headerMap['РасшифровкаПлатежа']] ||
            ''
          ).trim() || undefined

          if (documentAmount === 0) {
            return null
          }

          let direction: 'input' | 'output' = 'input'
          if (operationType) {
            const opTypeLower = operationType.toLowerCase()
            if (
              opTypeLower.includes('отпокупателя') ||
              opTypeLower.includes('поступление') ||
              opTypeLower.includes('реализация') ||
              opTypeLower.includes('доход')
            ) {
              direction = 'output'
            } else if (
              opTypeLower.includes('поставщику') ||
              opTypeLower.includes('списание') ||
              opTypeLower.includes('расход')
            ) {
              direction = 'input'
            }
          }

          if (!operationType && documentAmount < 0) {
            direction = 'input'
          } else if (!operationType && documentAmount > 0) {
            direction = 'output'
          }

          let vat_amount = vatValue
          let vat_rate = 0

          if (paymentPurpose) {
            const extractedVat = extractVatFromDescription(paymentPurpose)
            if (extractedVat > 0 && vat_amount === 0) {
              vat_amount = extractedVat
            }

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

          // Extract counterparty (контрагент) - try to find company name in payment purpose
          let counterparty = 'Не указан'

          // First, try explicit counterparty column
          const counterpartyCol = String(
            row[headerMap['Контрагент']] ||
            row[headerMap['КонтрагентНазвание']] ||
            row[headerMap['Плательщик']] ||
            ''
          ).trim()

          if (counterpartyCol) {
            counterparty = counterpartyCol.substring(0, 100)
          } else if (paymentPurpose) {
            // Company names are not in payment purpose for this export
            // Use document number, contract number, or meaningful description
            if (documentNumber) {
              counterparty = `Документ ${documentNumber}`
              console.log(`Using document number as counterparty: "${counterparty}"`)
            } else {
              // Try to extract contract/invoice number
              const contractMatch = paymentPurpose.match(/дог\s*[№]*\s*(\d+)/i) ||
                paymentPurpose.match(/договор\s*[№]*\s*(\d+)/i) ||
                paymentPurpose.match(/сч(?:ету)?[\s\.]*[№]*\s*(\d+(?:\/\d+)?)/i) ||
                paymentPurpose.match(/счету?\s*[№]*\s*(\d+(?:\/\d+)?)/i)

              if (contractMatch) {
                counterparty = `Договор № ${contractMatch[1]}`
                console.log(`Using contract number as counterparty: "${counterparty}"`)
              } else {
                // Use meaningful part of payment purpose
                const cleanPurpose = paymentPurpose.replace(/г\.$/, '').trim()
                counterparty = cleanPurpose.split(/[.,]/)[0].substring(0, 50).trim() || 'Не указан'
                console.log(`Using payment purpose as counterparty: "${counterparty}"`)
              }
            }
          } else {
            counterparty = documentNumber || 'Не указан'
          }

          const normalizedDate = normalizeDate(dateStr)
          if (!normalizedDate) {
            console.error(`Invalid date for operation ${index}: "${dateStr}"`)
            return null // Skip this operation
          }

          const op: Operation = {
            id: `${sourceName}-1c-${index}`,
            date: normalizedDate,
            amount: Math.abs(documentAmount),
            vat_rate,
            vat_amount: Math.abs(vat_amount),
            counterparty: (counterparty || 'Не указан').substring(0, 100),
            source: sourceName,
            direction,
            company,
            payment_name: paymentName,
            additional_info: {
              'Номер документа': (documentNumber || '—').substring(0, 100),
              'Вид операции': (operationType || '—').substring(0, 100),
            },
          }

          // Debug log for 1C main document operations
          console.log(`1C Main Doc Operation ${index}:`, {
            id: op.id,
            date: op.date,
            amount: op.amount,
            vat_rate: op.vat_rate,
            vat_amount: op.vat_amount,
            counterparty: op.counterparty?.substring(0, 30),
            company: op.company,
            payment_name: op.payment_name?.substring(0, 30),
            additional_info_size: JSON.stringify(op.additional_info).length
          })

          const errors = validateOperation(op)
          if (errors.length) {
            op.errors = errors
          }

          return op
        })
        .filter((op): op is Operation => op !== null)
    } else {
      throw new Error('Не удалось определить формат файла. Убедитесь, что есть колонки Date/Дата или Сумма/СуммаНДС')
    }

    console.log(`✅ Parsed ${operations.length} operations from 1C file`)
    return operations
  }

  async function loadSampleFromUrl() {
    try {
      setError(null)
      const response = await fetch(sampleUrl)
      if (!response.ok) {
        throw new Error(`Не удалось загрузить файл: ${response.status}`)
      }
      const csvText = await response.text()
      const workbook = XLSX.read(csvText, {
        type: 'string',
        FS: ',',
        RS: '\n'
      })
      const operations = processWorkbook(workbook, sampleUrl.split('/').pop() || '1c_sample.csv')
      onParsed(operations)
    } catch (err) {
      console.error('Error loading 1C sample:', err)
      setError('Не удалось автоматически загрузить файл 1С. Попробуйте позже или загрузите вручную.')
    }
  }

  useEffect(() => {
    if (autoLoadSample && !sampleLoadedRef.current) {
      sampleLoadedRef.current = true
      loadSampleFromUrl()
    }
  }, [autoLoadSample])

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
        
        const operations = processWorkbook(workbook, file.name)
        setError(null)
        onParsed(operations)
      } catch (err) {
        console.error('Error parsing 1C file:', err)
        setError('Не удалось разобрать файл 1С. Проверьте формат и структуру колонок.')
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
        {autoLoadSample && (
          <p className="text-amber-600">Демо-файл 1С подставлен автоматически</p>
        )}
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
          <li>СуммаДокумента или Сумма/СуммаНДС</li>
          <li>НазначениеПлатежа / Содержание</li>
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
  
  if (str.includes('T')) {
    const date = new Date(str)
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString()
    }
  }
  
  const ruDateMatch = str.match(/^(\d{1,2})[.\/](\d{1,2})[.\/](\d{2,4})$/)
  if (ruDateMatch) {
    const [, day, month, year] = ruDateMatch
    const fullYear = year.length === 2 ? 2000 + parseInt(year) : parseInt(year)
    const date = new Date(fullYear, parseInt(month) - 1, parseInt(day))
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString()
    }
  }
  
  const parsed = Date.parse(str)
  if (!Number.isNaN(parsed)) {
    return new Date(parsed).toISOString()
  }
  
  return ''
}
