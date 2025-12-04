# Инструкция по установке и настройке

## Требования

- Node.js 18+ 
- PostgreSQL 12+
- npm или yarn

## Установка

### 1. Установка зависимостей фронтенда

```bash
npm install
```

### 2. Установка зависимостей бэкенда

```bash
cd server
npm install
```

### 3. Настройка базы данных

1. Создайте PostgreSQL базу данных:
```sql
CREATE DATABASE tax_db;
```

2. Настройте переменные окружения для бэкенда:
```bash
cd server
cp .env.example .env
```

3. Отредактируйте `server/.env`:
```
DATABASE_URL="postgresql://user:password@localhost:5432/tax_db?schema=public"
JWT_SECRET="your-secret-key-change-in-production-min-32-chars"
PORT=3001
NODE_ENV=development
FRONTEND_URL="http://localhost:5173"
```

### 4. Запуск миграций Prisma

```bash
cd server
npm run prisma:generate
npm run prisma:migrate
```

При первом запуске миграции создастся файл миграции. Подтвердите создание.

### 5. Запуск приложения

**Терминал 1 - Бэкенд:**
```bash
cd server
npm run dev
```

**Терминал 2 - Фронтенд:**
```bash
npm run dev
```

Приложение будет доступно:
- Фронтенд: http://localhost:5173
- Бэкенд API: http://localhost:3001

## Первый запуск

1. Откройте http://localhost:5173
2. Зарегистрируйте нового пользователя
3. Создайте первый отчет, загрузив файл Excel/CSV
4. Сохраните отчет с названием
5. Управляйте статусами отчетов (Готов / Требует просмотра)

## Структура проекта

```
tax/
├── src/                    # Фронтенд (React + TypeScript)
│   ├── components/         # React компоненты
│   ├── services/           # API клиент
│   ├── lib/                # Бизнес-логика (НЕ МЕНЯТЬ algorithm.js)
│   └── types/              # TypeScript типы
├── server/                 # Бэкенд (Express + Prisma)
│   ├── src/
│   │   ├── routes/         # API маршруты
│   │   └── middleware/     # Middleware
│   └── prisma/
│       └── schema.prisma   # Схема базы данных
└── dist/                   # Собранный фронтенд
```

## Важные замечания

- **НЕ МЕНЯТЬ** файлы в `src/lib/vat.ts` - это алгоритм расчета НДС
- Все отчеты сохраняются в базе данных и привязаны к пользователю
- Статусы отчетов: `REQUIRES_REVIEW` (по умолчанию) и `READY`
- JWT токены действительны 7 дней

## Производственное развертывание

1. Установите переменные окружения для production
2. Соберите фронтенд: `npm run build`
3. Соберите бэкенд: `cd server && npm run build`
4. Запустите бэкенд: `cd server && npm start`
5. Настройте веб-сервер (nginx) для раздачи статики из `dist/`

