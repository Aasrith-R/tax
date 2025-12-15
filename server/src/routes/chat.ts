import express from 'express'
import multer from 'multer'
import { authenticateToken } from '../middleware/auth.js'

const router = express.Router()

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
})

// Handle multiple file uploads
const uploadFields = upload.fields([
  { name: 'attachment_0', maxCount: 1 },
  { name: 'attachment_1', maxCount: 1 },
  { name: 'attachment_2', maxCount: 1 },
  { name: 'attachment_3', maxCount: 1 },
  { name: 'attachment_4', maxCount: 1 },
])

router.post('/', authenticateToken, uploadFields, async (req, res, next) => {
  try {
    const { message, reportId, operations } = req.body
    
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message is required' })
    }

    // Extract attachments from request
    const files = req.files as { [fieldname: string]: Express.Multer.File[] }
    const attachments: Array<{
      name: string
      type: string
      buffer: Buffer
    }> = []

    if (files) {
      Object.keys(files).forEach((key) => {
        const fileArray = files[key]
        if (fileArray && fileArray.length > 0) {
          const file = fileArray[0]
          const index = key.replace('attachment_', '')
          const attachmentName = req.body[`attachment_${index}_name`] || file.originalname
          const attachmentType = req.body[`attachment_${index}_type`] || file.mimetype
          
          attachments.push({
            name: attachmentName,
            type: attachmentType,
            buffer: file.buffer,
          })
        }
      })
    }

    // Parse operations if provided
    let operationsData = null
    if (operations) {
      try {
        operationsData = typeof operations === 'string' ? JSON.parse(operations) : operations
      } catch (e) {
        console.warn('Failed to parse operations:', e)
      }
    }

    // TODO: Integrate with AI service (OpenAI, Anthropic, etc.)
    // For now, return a mock response
    const response = await generateAIResponse({
      message,
      attachments,
      reportId,
      operations: operationsData,
      userId: (req as any).user.id,
    })

    res.json({ content: response })
  } catch (error) {
    next(error)
  }
})

interface GenerateResponseParams {
  message: string
  attachments: Array<{ name: string; type: string; buffer: Buffer }>
  reportId?: string
  operations?: any[]
  userId: string
}

async function generateAIResponse(params: GenerateResponseParams): Promise<string> {
  const { message, attachments, reportId, operations } = params

  // TODO: Implement actual AI integration
  // This is a placeholder that demonstrates the structure
  
  let contextInfo = ''
  
  if (reportId) {
    contextInfo += `\nКонтекст: Отчет ${reportId}`
  }
  
  if (operations && operations.length > 0) {
    const totalOperations = operations.length
    const inputVat = operations
      .filter((op: any) => op.direction === 'input')
      .reduce((sum: number, op: any) => sum + (op.vatAmount || 0), 0)
    const outputVat = operations
      .filter((op: any) => op.direction === 'output')
      .reduce((sum: number, op: any) => sum + (op.vatAmount || 0), 0)
    
    contextInfo += `\nОпераций в контексте: ${totalOperations}`
    contextInfo += `\nВходящий НДС: ${inputVat.toLocaleString('ru-RU')} ₽`
    contextInfo += `\nИсходящий НДС: ${outputVat.toLocaleString('ru-RU')} ₽`
  }
  
  if (attachments.length > 0) {
    contextInfo += `\nПрикреплено файлов: ${attachments.length}`
    attachments.forEach((att, idx) => {
      contextInfo += `\n  ${idx + 1}. ${att.name} (${att.type})`
    })
  }

  // Mock response - replace with actual AI call
  const mockResponse = `Я получил ваш вопрос: "${message}"${contextInfo ? '\n\n' + contextInfo : ''}

Пока что это демонстрационный ответ. Для полноценной работы необходимо:
1. Настроить API ключ для AI сервиса (OpenAI, Anthropic, и т.д.)
2. Реализовать обработку прикрепленных файлов (PDF, Word, Excel)
3. Интегрировать анализ данных из ваших отчетов

Вопрос будет обработан с учетом:
${reportId ? `- Отчета ${reportId}` : ''}
${operations && operations.length > 0 ? `- ${operations.length} операций из базы данных` : ''}
${attachments.length > 0 ? `- ${attachments.length} прикрепленных файлов` : ''}`

  return mockResponse
}

export { router as chatRouter }

