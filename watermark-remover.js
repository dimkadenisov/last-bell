import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";

const BASE_DIR = "/Users/fatality/Downloads/photo";
const PHOTO_DIR = path.join(BASE_DIR, "wm");
const CLEAN_DIR = path.join(BASE_DIR, "clean");
const WEBSITE_URL = "https://www.watermarkremover.io";
const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const DEBUG_PORT = 9222;

function getPhotoFiles() {
  const doneNames = new Set(
    fs.readdirSync(CLEAN_DIR).map((f) => path.basename(f, path.extname(f))),
  );

  return fs
    .readdirSync(PHOTO_DIR)
    .filter((file) => {
      const ext = path.extname(file).toLowerCase();
      if (![".jpg", ".jpeg", ".png", ".gif"].includes(ext)) return false;
      return !doneNames.has(path.basename(file, ext));
    })
    .sort()
    .map((file) => path.join(PHOTO_DIR, file));
}

async function waitForButtonByText(page, text, timeout = 30000) {
  await page.waitForFunction(
    (t) => [...document.querySelectorAll("button")].some((b) => b.textContent.includes(t)),
    { timeout },
    text,
  );
}

async function clickButtonByText(page, text) {
  await page.evaluate(
    (t) => [...document.querySelectorAll("button")].find((b) => b.textContent.includes(t))?.click(),
    text,
  );
}

async function isCaptchaVisible(page) {
  try {
    return await page.evaluate(() => {
      const frame = document.querySelector('iframe[src*="bframe"]');
      if (!frame) return false;
      const rect = frame.getBoundingClientRect();
      const style = getComputedStyle(frame);
      return rect.width > 50 && rect.height > 50
        && style.visibility !== 'hidden'
        && style.display !== 'none'
        && style.opacity !== '0';
    });
  } catch {
    return false;
  }
}

async function waitIfCaptcha(page) {
  if (!await isCaptchaVisible(page)) return;
  console.log("  ⚠️  Капча! Решите её в браузере, скрипт продолжит автоматически...");
  while (await isCaptchaVisible(page)) {
    await new Promise((r) => setTimeout(r, 1500));
  }
  console.log("  ✅ Капча решена, продолжаю...");
}

async function waitForResponseWithCaptchaCheck(page, responsePromise) {
  let done = false;
  responsePromise.then(() => { done = true; }).catch(() => { done = true; });
  while (!done) {
    if (await isCaptchaVisible(page)) {
      console.log("  ⚠️  Капча! Решите её в браузере, скрипт продолжит автоматически...");
      while (await isCaptchaVisible(page)) await new Promise((r) => setTimeout(r, 1500));
      console.log("  ✅ Капча решена, продолжаю...");
    }
    if (!done) await new Promise((r) => setTimeout(r, 2000));
  }
  return responsePromise;
}

async function processPhoto(browser, photoPath, index, total) {
  const fileName = path.basename(photoPath);
  console.log(`\n[${index}/${total}] 📸 ${fileName}`);

  const page = await browser.newPage();
  const client = await page.target().createCDPSession();

  try {
    await page.setViewport({ width: 1800, height: 1169 });

    const tmpDir = path.join(CLEAN_DIR, `_tmp_${index}`);
    fs.mkdirSync(tmpDir, { recursive: true });
    await client.send("Page.setDownloadBehavior", {
      behavior: "allow",
      downloadPath: tmpDir,
    });

    console.log("  ⏳ Открываю сайт...");
    await page.goto(WEBSITE_URL, { waitUntil: "networkidle2", timeout: 30000 });

    const siteCookies = await page.cookies();
    if (siteCookies.length > 0) await page.deleteCookie(...siteCookies);
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    await page.reload({ waitUntil: "networkidle2", timeout: 30000 });

    await waitIfCaptcha(page);

    console.log("  📤 Загружаю файл...");
    await waitForButtonByText(page, "Upload", 10000);
    await clickButtonByText(page, "Upload");

    const fileInput = await page.waitForSelector("#uploadImage", { timeout: 5000 });
    await fileInput.uploadFile(photoPath);

    console.log("  ⏳ Жду перехода на /upload...");
    await page.waitForFunction(() => window.location.pathname === "/upload", {
      timeout: 3 * 60 * 1000,
    });
    await waitIfCaptcha(page);

    console.log("  🚀 Запускаю обработку...");
    await waitForButtonByText(page, "Remove Watermark From Image", 5 * 60 * 1000);

    const apiResponse = page.waitForResponse(
      (res) => res.url().includes("api.watermarkremover.io/service/public/transformation/v1.0/predictions/wm/remove"),
      { timeout: 10 * 60 * 1000 },
    );
    apiResponse.catch(() => {});

    await clickButtonByText(page, "Remove Watermark From Image");

    console.log("  ⏳ Жду ответа API...");
    await waitForResponseWithCaptchaCheck(page, apiResponse);
    await waitIfCaptcha(page);

    await waitForButtonByText(page, "Download Image", 2 * 60 * 1000);
    await clickButtonByText(page, "Download Image");

    console.log("  💾 Жду файл...");
    const deadline = Date.now() + 30000;
    let downloadedFile = null;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 500));
      const files = fs.readdirSync(tmpDir).filter((f) => !f.endsWith(".crdownload"));
      if (files.length > 0) { downloadedFile = files[0]; break; }
    }

    if (!downloadedFile) throw new Error("Файл не появился в папке");

    const ext = path.extname(downloadedFile);
    const outName = path.basename(photoPath, path.extname(photoPath)) + ext;
    fs.renameSync(path.join(tmpDir, downloadedFile), path.join(CLEAN_DIR, outName));
    fs.rmdirSync(tmpDir);

    console.log(`  ✅ Успешно: ${outName}`);
    return true;
  } catch (error) {
    console.error(`  ❌ Ошибка: ${error.message}`);
    return false;
  } finally {
    await page.close();
  }
}

async function main() {
  console.log("\n╔════════════════════════════════════════╗");
  console.log("║   Watermark Remover - Puppeteer        ║");
  console.log("╚════════════════════════════════════════╝\n");

  if (!fs.existsSync(CLEAN_DIR)) {
    fs.mkdirSync(CLEAN_DIR, { recursive: true });
  }

  const photos = getPhotoFiles();
  if (photos.length === 0) {
    console.log("❌ Фотографии не найдены");
    return;
  }

  console.log(`📊 Будет обработано: ${photos.length} фотографий\n`);
  const browser = await puppeteer.connect({
    browserURL: `http://localhost:${DEBUG_PORT}`,
    defaultViewport: null,
  });

  const randomDelay = () => new Promise((r) => setTimeout(r, 3000 + Math.random() * 4000));

  let successCount = 0;
  let cursor = 0;

  try {
    while (true) {
      const i = cursor++;
      if (i >= photos.length) break;
      const success = await processPhoto(browser, photos[i], i + 1, photos.length);
      if (success) successCount++;
      await randomDelay();
    }

    console.log(`\n╔════════════════════════════════════════╗`);
    console.log(`║ ✅ Обработано: ${successCount}/${photos.length}           ║`);
    console.log(`║ 📁 Результаты: clean/                 ║`);
    console.log(`╚════════════════════════════════════════╝\n`);
  } catch (error) {
    console.error("❌ Ошибка:", error.message);
    process.exit(1);
  } finally {
    await browser.disconnect();
  }
}

main();
