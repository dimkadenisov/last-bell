#!/bin/bash

echo "═════════════════════════════════════════════════"
echo "   WATERMARK REMOVER - Puppeteer Automation"
echo "═════════════════════════════════════════════════"
echo ""

# Переходим в папку проекта
cd "$(dirname "$0")"

# Проверяем npm
if ! command -v npm &> /dev/null; then
    echo "❌ npm не найден!"
    echo "Установите Node.js с https://nodejs.org"
    exit 1
fi

echo "✓ npm найден"

# Проверяем зависимости
if [ ! -d "node_modules" ]; then
    echo ""
    echo "📦 Установка зависимостей (это может занять минуту)..."
    npm install
fi

echo ""
echo "🚀 Запускаю скрипт..."
echo ""

# Запускаем скрипт
node watermark-remover.js
