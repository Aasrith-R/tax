import { useState, useRef, useEffect } from 'react'
import { chatApi, type ChatMessage as ApiChatMessage } from '../../services/api'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  attachments?: Attachment[]
  timestamp: Date
}

export interface Attachment {
  id: string
  name: string
  type: string
  size: number
  file: File
}

interface AIChatProps {
  chatId?: string
  reportId?: string
  operations?: any[]
  onChatSaved?: () => void
}

export function AIChat({ chatId, reportId, operations, onChatSaved }: AIChatProps) {
  const [currentChatId, setCurrentChatId] = useState<string | undefined>(chatId)
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: '1',
      role: 'assistant',
      content: 'Привет! Я ваш помощник по налоговому учету. Можете задать вопросы о ваших данных, например:\n\n• "Почему НДС к уплате вырос?"\n• "Покажи топ контрагентов"\n• "Проанализируй операции за последний месяц"\n\nТакже можете прикрепить файлы (PDF, Word, Excel, сканы) и спросить о них, например:\n\n• "Я прикрепил запрос пояснений из налоговой — составь ответ"\n• "Что нужно исправить в этом документе?"',
      timestamp: new Date(),
    },
  ])
  const [input, setInput] = useState('')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Load chat when chatId changes
  useEffect(() => {
    if (chatId) {
      loadChat(chatId)
      setCurrentChatId(chatId)
    } else {
      // Reset to welcome message
      setMessages([{
        id: '1',
        role: 'assistant',
        content: 'Привет! Я ваш помощник по налоговому учету. Можете задать вопросы о ваших данных, например:\n\n• "Почему НДС к уплате вырос?"\n• "Покажи топ контрагентов"\n• "Проанализируй операции за последний месяц"\n\nТакже можете прикрепить файлы (PDF, Word, Excel, сканы) и спросить о них, например:\n\n• "Я прикрепил запрос пояснений из налоговой — составь ответ"\n• "Что нужно исправить в этом документе?"',
        timestamp: new Date(),
      }])
      setCurrentChatId(undefined)
    }
  }, [chatId])

  const loadChat = async (id: string) => {
    try {
      const response = await chatApi.getById(id)
      const apiMessages = response.chat.messages
      const loadedMessages: ChatMessage[] = apiMessages.map((msg: ApiChatMessage) => ({
        id: msg.id,
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
        timestamp: new Date(msg.createdAt),
      }))
      setMessages(loadedMessages)
      setCurrentChatId(id)
    } catch (error) {
      console.error('Failed to load chat:', error)
    }
  }

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    const newAttachments: Attachment[] = files.map((file) => ({
      id: `${Date.now()}-${Math.random()}`,
      name: file.name,
      type: file.type,
      size: file.size,
      file,
    }))
    setAttachments([...attachments, ...newAttachments])
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const removeAttachment = (id: string) => {
    setAttachments(attachments.filter((a) => a.id !== id))
  }

  const handleSend = async () => {
    if (!input.trim() && attachments.length === 0) return

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: input,
      attachments: attachments.length > 0 ? [...attachments] : undefined,
      timestamp: new Date(),
    }

    setMessages([...messages, userMessage])
    setInput('')
    const currentAttachments = [...attachments]
    setAttachments([])
    setIsLoading(true)

    try {
      const response = await chatApi.sendMessage({
        message: input,
        attachments: currentAttachments,
        reportId,
        operations,
        chatId: currentChatId,
      })

      // Update chat ID if this is a new chat
      if (response.chatId && !currentChatId) {
        setCurrentChatId(response.chatId)
        if (onChatSaved) {
          onChatSaved()
        }
      }

      const assistantMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: response.content,
        timestamp: new Date(),
      }

      setMessages((prev) => [...prev, assistantMessage])
      
      // Notify parent that chat was saved/updated
      if (onChatSaved && response.chatId) {
        onChatSaved()
      }
    } catch (error) {
      const errorMessage: ChatMessage = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: `Ошибка: ${error instanceof Error ? error.message : 'Не удалось получить ответ от ИИ'}`,
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, errorMessage])
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} Б`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`
    return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`
  }

  return (
    <div className="flex h-full flex-col bg-white">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-lg px-4 py-2 ${
                message.role === 'user'
                  ? 'bg-sky-600 text-white'
                  : 'bg-slate-100 text-slate-900'
              }`}
            >
              {message.attachments && message.attachments.length > 0 && (
                <div className="mb-2 space-y-1">
                  {message.attachments.map((att) => (
                    <div
                      key={att.id}
                      className="text-xs opacity-90 flex items-center gap-1"
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
                        />
                      </svg>
                      {att.name} ({formatFileSize(att.size)})
                    </div>
                  ))}
                </div>
              )}
              <div className="whitespace-pre-wrap text-sm">{message.content}</div>
              <div
                className={`text-xs mt-1 ${
                  message.role === 'user' ? 'text-sky-100' : 'text-slate-500'
                }`}
              >
                {message.timestamp.toLocaleTimeString('ru-RU', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </div>
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-slate-100 rounded-lg px-4 py-2">
              <div className="flex items-center gap-2 text-slate-600">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-slate-600"></div>
                <span className="text-sm">ИИ думает...</span>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="border-t border-slate-200 p-4 bg-slate-50">
        {/* Attachments preview */}
        {attachments.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {attachments.map((att) => (
              <div
                key={att.id}
                className="flex items-center gap-2 bg-white rounded-lg px-3 py-1.5 text-xs border border-slate-200"
              >
                <svg
                  className="w-4 h-4 text-slate-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
                  />
                </svg>
                <span className="text-slate-700">{att.name}</span>
                <button
                  onClick={() => removeAttachment(att.id)}
                  className="text-slate-400 hover:text-red-500"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex-shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-600 hover:bg-slate-50 transition-colors"
            title="Прикрепить файл"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
              />
            </svg>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.jpg,.jpeg,.png,.txt"
            onChange={handleFileSelect}
            className="hidden"
          />
          <textarea
            value={input}
            onChange={(e) => {
              setInput(e.target.value)
              // Auto-resize
              e.target.style.height = 'auto'
              e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`
            }}
            onKeyPress={handleKeyPress}
            placeholder="Задайте вопрос или прикрепите файл..."
            className="flex-1 rounded-lg border border-slate-300 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 resize-none"
            rows={1}
            style={{ minHeight: '40px', maxHeight: '120px', overflowY: 'auto' }}
          />
          <button
            onClick={handleSend}
            disabled={isLoading || (!input.trim() && attachments.length === 0)}
            className="flex-shrink-0 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
              />
            </svg>
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Поддерживаются файлы: PDF, Word, Excel, CSV, изображения (JPG, PNG)
        </p>
      </div>
    </div>
  )
}

