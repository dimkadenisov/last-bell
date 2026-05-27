# Watermark Remover - Puppeteer Automation

Автоматизированный скрипт для удаления водяных знаков с фотографий с помощью сайта https://www.watermarkremover.io

## 📋 Требования

- **Node.js** 16+ ([скачать](https://nodejs.org))
- **Google Chrome** браузер ([скачать](https://www.google.com/chrome))
- **npm** (обычно идёт с Node.js)

## 🚀 Использование

### 1. Установка зависимостей (первый раз)

```bash
cd photo
npm install
```

### 2. Запуск скрипта

```bash
node watermark-remover.js
```

## 🔧 Конфигурация

Скрипт автоматически найдёт Google Chrome на вашей системе.

Если Chrome установлена в нестандартном месте, используйте переменную окружения:

```bash
# macOS/Linux
export CHROME_PATH="/path/to/google-chrome"
node watermark-remover.js

# Windows PowerShell
$env:CHROME_PATH="C:\Program Files\Google\Chrome\Application\chrome.exe"
node watermark-remover.js
```

## 📁 Структура

```
photo/
├── DSC00892.jpg          # Исходные фотографии
├── DSC00896.jpg
├── DSC00914.jpg
├── ...
├── clean/                # Результаты (создаётся автоматически)
│   ├── clean_DSC00892.jpg
│   ├── clean_DSC00896.jpg
│   └── ...
├── watermark-remover.js  # Скрипт
└── package.json          # Зависимости
```

## 🔄 Как работает

1. Скрипт открывает браузер Chrome
2. Переходит на https://www.watermarkremover.io
3. Загружает первые 3 фотографии по одной
4. Для каждой фотографии:
   - Кликает Upload
   - Выбирает режим обработки (Auto Mode)
   - Кликает "Remove Watermark From Image"
   - Дожидается результата
   - Скачивает обработанное изображение в папку `clean/`

## ⚙️ Кастомизация

В скрипте можно изменить:

```javascript
// Количество фотографий для обработки (по умолчанию 3)
getPhotoFiles(3)  // Измените число на нужное

// Папка с фотографиями
const PHOTO_DIR = '/Users/fatality/Downloads/photo';

// Папка для результатов
const CLEAN_DIR = path.join(PHOTO_DIR, 'clean');
```

## 🐛 Решение проблем

### Chrome не найдена
- Установите Google Chrome с https://www.google.com/chrome
- Или установите переменную окружения `CHROME_PATH`

### Сайт не открывается
- Проверьте интернет соединение
- Сайт может быть недоступен или перегружен

### Файлы не скачиваются
- Проверьте что папка `clean/` доступна для записи
- Проверьте настройки браузера для скачиваний

## 📝 Лицензия

Для использования только с целью удаления своих водяных знаков из своих фотографий.

---

**Created with Puppeteer** 🤖
