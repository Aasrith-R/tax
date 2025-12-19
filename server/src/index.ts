import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { authRouter } from './routes/auth.js'
import { reportsRouter } from './routes/reports.js'
import { chatRouter } from './routes/chat.js'
import { errorHandler } from './middleware/errorHandler.js'

dotenv.config()

const app = express()
const PORT = Number(process.env.PORT) || 3000
const HOST = process.env.HOST || '0.0.0.0' // Listen on all interfaces

// Increase payload size limits for large 1C datasets
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ limit: '10mb', extended: true }))

// CORS configuration - allow multiple origins
const SERVER_IP = process.env.SERVER_IP || '5.35.85.16'
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  `http://${SERVER_IP}:5173`,
  `http://${SERVER_IP}:5174`,
  'https://nds.napoykmf.beget.tech',
  'http://nds.napoykmf.beget.tech',
  process.env.FRONTEND_URL
].filter(Boolean)

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true)
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true)
    } else {
      // For development, allow localhost and server IP
      if (origin.startsWith('http://localhost:') || 
          origin.startsWith('http://127.0.0.1:') ||
          origin.startsWith(`http://${SERVER_IP}:`)) {
        callback(null, true)
      } else {
        callback(new Error('Not allowed by CORS'))
      }
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}))
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Routes
app.use('/api/auth', authRouter)
app.use('/api/reports', reportsRouter)
app.use('/api/chat', chatRouter)

// Error handling
app.use(errorHandler)

app.listen(PORT, HOST, () => {
  console.log(`🚀 Server running on http://${HOST}:${PORT}`)
}).on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EPERM' || err.code === 'EACCES') {
    console.error(`❌ Cannot bind to port ${PORT}. Trying alternative port...`)
    // Try alternative port
    const altPort = PORT === 3000 ? 3001 : 3000
    app.listen(altPort, HOST, () => {
      console.log(`🚀 Server running on http://${HOST}:${altPort}`)
    }).on('error', (err2: NodeJS.ErrnoException) => {
      console.error(`❌ Cannot bind to port ${altPort} either.`)
      console.error('Error:', err2.message)
      console.error('\n💡 Solutions:')
      console.error('  1. Use a different port in .env: PORT=8080')
      console.error('  2. Check if port is already in use')
      console.error('  3. On shared hosting, you may need to use a proxy or socket')
      process.exit(1)
    })
  } else {
    console.error('Server error:', err)
    process.exit(1)
  }
})

