import express from 'express'
import multer from 'multer'
import { PrismaClient } from '@prisma/client'
import { authenticateToken } from '../middleware/auth.js'

const router = express.Router()
const prisma = new PrismaClient()

// DeepSeek API configuration
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || ''
const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions'
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat'

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
    const { message, reportId, operations, chatId } = req.body
    
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

    // Get userId from authenticated request
    const userId = (req as any).userId
    if (!userId) {
      return res.status(401).json({ error: 'Пользователь не авторизован' })
    }

    // Get or create chat
    let chat
    if (chatId) {
      chat = await prisma.chat.findFirst({
        where: { id: chatId, userId },
      })
      if (!chat) {
        return res.status(404).json({ error: 'Чат не найден' })
      }
    } else {
      // Create new chat with first message as title
      const title = message.length > 50 ? message.substring(0, 50) + '...' : message
      chat = await prisma.chat.create({
        data: {
          userId,
          title,
        },
      })
    }

    // Save user message
    await prisma.chatMessage.create({
      data: {
        chatId: chat.id,
        role: 'user',
        content: message,
      },
    })

    const response = await generateAIResponse({
      message,
      attachments,
      reportId,
      operations: operationsData,
      userId,
    })

    // Save assistant response
    await prisma.chatMessage.create({
      data: {
        chatId: chat.id,
        role: 'assistant',
        content: response,
      },
    })

    res.json({ content: response, chatId: chat.id })
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

  try {
    // Build context for the AI
    let systemContext = `Ты - помощник по налоговому учету и НДС в России. Помогаешь пользователям с вопросами о налогах, отчетности и работе с 1С.
Отвечай на русском языке, профессионально и понятно.`

    let userContext = message
    
    // Add report context
  if (reportId) {
      systemContext += `\n\nКонтекст: Пользователь работает с отчетом ${reportId}`
  }
  
    // Add operations context
  if (operations && operations.length > 0) {
    const totalOperations = operations.length
    const inputVat = operations
      .filter((op: any) => op.direction === 'input')
      .reduce((sum: number, op: any) => sum + (op.vatAmount || 0), 0)
    const outputVat = operations
      .filter((op: any) => op.direction === 'output')
      .reduce((sum: number, op: any) => sum + (op.vatAmount || 0), 0)
      const netVat = outputVat - inputVat
      
      systemContext += `\n\nДанные из отчета:
- Всего операций: ${totalOperations}
- Входящий НДС (к вычету): ${inputVat.toLocaleString('ru-RU')} ₽
- Исходящий НДС (к уплате): ${outputVat.toLocaleString('ru-RU')} ₽
- К доплате в бюджет: ${netVat.toLocaleString('ru-RU')} ₽`
  }
  
    // Add attachments info
  if (attachments.length > 0) {
      systemContext += `\n\nПрикреплено файлов: ${attachments.length}`
    attachments.forEach((att, idx) => {
        systemContext += `\n  ${idx + 1}. ${att.name} (${att.type})`
    })
      // Note: File processing can be added later if needed
    }

    // Call DeepSeek API (OpenAI-compatible format)
    const response = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        messages: [
          { role: 'system', content: systemContext },
          { role: 'user', content: userContext },
        ],
        stream: false,
      }),
    })

    if (!response.ok) {
      const errorData = await response.text()
      throw new Error(`DeepSeek API error: ${response.status} ${response.statusText} - ${errorData}`)
    }

    const data = await response.json() as any
    const text = data.choices?.[0]?.message?.content || 'Извините, не удалось получить ответ от AI.'

    return text
  } catch (error: any) {
    console.error('DeepSeek API error:', error)
    
    // Fallback response if API fails
    return `Извините, произошла ошибка при обработке запроса: ${error.message || 'Неизвестная ошибка'}. Пожалуйста, попробуйте еще раз.`
  }
}

// Get all chats for user
router.get('/', authenticateToken, async (req, res, next) => {
  try {
    const userId = (req as any).userId
    if (!userId) {
      return res.status(401).json({ error: 'Пользователь не авторизован' })
    }

    const chats = await prisma.chat.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      include: {
        _count: {
          select: { messages: true },
        },
      },
    })

    res.json({ chats })
  } catch (error) {
    next(error)
  }
})

// Get specific chat with messages
router.get('/:id', authenticateToken, async (req, res, next) => {
  try {
    const userId = (req as any).userId
    const chatId = req.params.id

    if (!userId) {
      return res.status(401).json({ error: 'Пользователь не авторизован' })
    }

    const chat = await prisma.chat.findFirst({
      where: { id: chatId, userId },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    })

    if (!chat) {
      return res.status(404).json({ error: 'Чат не найден' })
    }

    res.json({ chat })
  } catch (error) {
    next(error)
  }
})

// Delete chat
router.delete('/:id', authenticateToken, async (req, res, next) => {
  try {
    const userId = (req as any).userId
    const chatId = req.params.id

    if (!userId) {
      return res.status(401).json({ error: 'Пользователь не авторизован' })
    }

    const chat = await prisma.chat.findFirst({
      where: { id: chatId, userId },
    })

    if (!chat) {
      return res.status(404).json({ error: 'Чат не найден' })
    }

    await prisma.chat.delete({
      where: { id: chatId },
    })

    res.json({ message: 'Чат удален' })
  } catch (error) {
    next(error)
  }
})

export { router as chatRouter }

