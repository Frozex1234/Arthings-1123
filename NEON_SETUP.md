# Neon Postgres Setup Guide

Це найпростіший спосіб запустити ваш DBAlpha проект з безкоштовною бі​зою даних Neon, яка працює з будь-якого ПК.

## 🚀 Швидкий старт (5 хвилин)

### 1. Зареєструйтесь на Neon
Перейдіть на https://neon.tech і створіть акаунт

### 2. Створіть новий проект
- Натисніть **"New Project"**
- Виберіть PostgreSQL
- Виберіть регіон найближче до ваше локації
- Натисніть **"Create Project"**

### 3. Скопіюйте Connection String
На сторінці проекту:
- Перейдіть в **"Connection strings"**
- Скопіюйте **Prisma** connection string (починається з `postgresql://`)

### 4. Оновіть .env файл
```dotenv
# Database Configuration (Neon Postgres)
DATABASE_URL="postgresql://neon_user:password@ep-xyz.neon.tech/dbname?sslmode=require"

# Session Configuration
# Згенеруйте власний секрет: openssl rand -hex 32
# Ніколи не використовуйте це значення повторно і не комітьте його.
SESSION_SECRET=

# Server Configuration
PORT=3000
NODE_ENV=development

# Admin Configuration
ADMIN_EMAIL=admin@arthings.com
```

**Важливо:** Обов'язково залиште `?sslmode=require` в кінці URL!

### 5. Встановіть залежності
```bash
npm install
```

### 6. Запустіть міграції
```bash
npm run db:push
```

### 7. Засіяйте базу даних
```bash
npm run db:seed
```

### 8. Запустіть сервер
```bash
npm run dev
```

Готово! 🎉

## 📊 Використання Neon

### Переглянути дані в Neon Console
1. Перейдіть на https://console.neon.tech
2. Виберіть свій проект
3. Клікніть **"SQL Editor"**
4. Напишіть SQL запити

### Переглянути дані в Prisma Studio (локально)
```bash
npm run db:studio
```

Це відкриє веб-інтерфейс з усіма таблицями.

## 🔐 Безпека

### Захистіть DATABASE_URL

**На локальному ПК:**
- `.env` файл вже в `.gitignore` - не комітьте його!

**Якщо плануєте деплоїти (наприклад на Railway, Vercel):**
```bash
# Railway
railway variables set DATABASE_URL="ваша-url-з-neon"

# Vercel
vercel env add DATABASE_URL
```

## 🆘 Розв'язання проблем

### Помилка: "Connection refused"
**Рішення:**
- Перевірте DATABASE_URL в `.env`
- Переконайтеся, що IP вашого ПК не заблокований (Neon дозволяє усім за замовчуванням)
- Спробуйте `npm run db:push` ще раз

### Помилка: "sslmode required"
**Рішення:**
- Додайте `?sslmode=require` в кінець DATABASE_URL

### Не можете підключитися з іншого ПК?
**Рішення:**
1. В Neon Console → Project Settings
2. Переконайтеся, що не встановлено IP обмеження
3. Скопіюйте Connection String з того ж ПК

## 📝 Команди для роботи

```bash
# Переглянути поточну схему
npm run db:studio

# Запустити вже створені міграції
npm run db:migrate

# Скинути базу (ВИДАЛИТЬ ВСІ ДАНІ!)
npm run db:reset

# Генерувати Prisma Client
npm run db:generate
```

## 🌍 Використання з іншого ПК

Neon дозволяє легко працювати з декількох ПК:

### На ПК #1 (現在)
```bash
npm install
npm run db:push
npm run db:seed
```

### На ПК #2 (новий ПК)
1. Клонуйте репозиторій: `git clone <repo>`
2. Встановіть залежності: `npm install`
3. Скопіюйте `.env` файл з ПК #1
4. Запустіть: `npm run dev`

**Готово!** Обидва ПК виконуватимуть з однієї бази даних Neon.

## 📈 Обновлення CONNECTION STRING

Якщо змінився пароль або CONNECTION STRING:
1. Перейдіть на console.neon.tech
2. Project → Connection strings
3. Скопіюйте нову Prisma URL
4. Оновіть DATABASE_URL в `.env`

## 💰 План Neon

**Free Plan (достатньо для розробки):**
- 3 GB місцеві
- Невimited connections
- Активер гаснет через 7 днів неактивності (але легко розбудити)

**Pro Plan:**
- За необхідності можна оновити ($14/місяць)

## 📞 Підтримка

- Neon Docs: https://neon.tech/docs
- Neon Support: https://neon.tech/support
- Prisma Docs: https://www.prisma.io/docs

## ✅ Контрольний список

- [ ] Зареєстровані на Neon
- [ ] Створений проект на Neon
- [ ] CONNECTION STRING скопійована в `.env`
- [ ] `npm install` виконаний
- [ ] `npm run db:push` виконаний
- [ ] `npm run db:seed` виконаний
- [ ] `npm run dev` запущений
- [ ] Сервер запущений на http://localhost:3000

Все готово! 🎉
