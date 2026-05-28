import "dotenv/config";
import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";
import axios from "axios";

const WIT_AI_KEY = process.env.WIT_AI_KEY;

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

async function waitForSelectorWithCaptchaCheck(page, selector, timeout = 30000) {
  const deadline = Date.now() + timeout;
  while (true) {
    const found = await page.$(selector);
    if (found) return;
    if (Date.now() > deadline) throw new Error(`Timeout waiting for selector: ${selector}`);
    if (await isCaptchaVisible(page)) await waitIfCaptcha(page);
    await new Promise((r) => setTimeout(r, 1000));
  }
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

async function solveCaptchaAudio(page) {
  // Find the bframe iframe element in the page
  const bframeElement = await page.$('iframe[src*="bframe"]');
  if (!bframeElement) return false;

  // Get the frame object for the bframe
  const frames = page.frames();
  const bframe = frames.find((f) => f.url().includes("bframe"));
  if (!bframe) return false;

  try {
    // Click the audio button inside the challenge
    const audioBtn = await bframe.waitForSelector("#recaptcha-audio-button", { timeout: 5000 });
    await audioBtn.click();

    // Get the audio source URL
    const audioSrc = await bframe.waitForFunction(
      () => document.querySelector(".rc-audiochallenge-tdownload-link")?.href,
      { timeout: 10000 },
    );
    const audioUrl = await audioSrc.jsonValue();
    if (!audioUrl) return false;

    // Fetch the audio and send to Wit.ai
    const audioResp = await axios.get(audioUrl, { responseType: "arraybuffer" });
    const witResp = await axios.post(
      "https://api.wit.ai/speech?v=20220622",
      audioResp.data,
      { headers: { Authorization: `Bearer ${WIT_AI_KEY}`, "Content-Type": "audio/mpeg3" } },
    );
    const raw = typeof witResp.data === "string" ? witResp.data : JSON.stringify(witResp.data);
    const parsed = JSON.parse(raw.split("\r\n").at(-1) || "{}");
    const text = parsed?.text;
    if (!text) return false;

    console.log(`  🔊 Wit.ai: "${text}"`);

    // Type the answer and submit
    const input = await bframe.waitForSelector("#audio-response", { timeout: 5000 });
    await input.type(text);
    const verifyBtn = await bframe.$('#recaptcha-verify-button');
    await verifyBtn.click();

    // Wait for challenge to disappear
    await new Promise((r) => setTimeout(r, 3000));
    return !await isCaptchaVisible(page);
  } catch (e) {
    console.log(`  ⚠️  Аудио-решение не удалось: ${e.message}`);
    return false;
  }
}

async function waitIfCaptcha(page) {
  if (!await isCaptchaVisible(page)) return;
  console.log("  ⚠️  Капча! Пытаюсь решить через аудио...");
  const solved = await solveCaptchaAudio(page);
  if (solved) {
    console.log("  ✅ Капча решена автоматически!");
    return;
  }
  throw new Error("Капча не решена автоматически, пропускаю");
}

async function waitForResponseWithCaptchaCheck(page, responsePromise) {
  let done = false;
  responsePromise.then(() => { done = true; }).catch(() => { done = true; });
  while (!done) {
    if (await isCaptchaVisible(page)) await waitIfCaptcha(page);
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

    // Switch to English if site opened in another language
    const isEnglish = await page.evaluate(() => !document.querySelector('[class*="LanguageSwitcher"]') ||
      document.querySelector('[class*="LanguageSwitcher__ButtonDropdown"]')?.textContent.trim() === "English"
    );
    if (!isEnglish) {
      await page.click('[class*="LanguageSwitcher__ButtonDropdown"]');
      await new Promise((r) => setTimeout(r, 1000));
      await page.evaluate(() => {
        [...document.querySelectorAll("a,button,li,span")].find((el) => el.textContent.trim() === "English")?.click();
      });
      await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 10000 }).catch(() => {});
    }

    await waitIfCaptcha(page);

    console.log("  📤 Загружаю файл...");
    await page.waitForSelector('[data-test-id="upload-btn"], #UploadImage__HomePage', { timeout: 10000 });
    await page.click('[data-test-id="upload-btn"], #UploadImage__HomePage');

    const fileInput = await page.waitForSelector("#uploadImage", { timeout: 5000 });
    await fileInput.uploadFile(photoPath);

    console.log("  ⏳ Жду перехода на /upload...");
    await page.waitForFunction(() => window.location.pathname.endsWith("/upload"), {
      timeout: 3 * 60 * 1000,
    });
    await waitIfCaptcha(page);

    console.log("  🚀 Запускаю обработку...");
    await waitForSelectorWithCaptchaCheck(page, '[class*="OutputCard__TransformButton"]', 5 * 60 * 1000);

    const apiResponse = page.waitForResponse(
      (res) => res.url().includes("api.watermarkremover.io/service/public/transformation/v1.0/predictions/wm/remove"),
      { timeout: 10 * 60 * 1000 },
    );
    apiResponse.catch(() => {});

    await page.click('[class*="OutputCard__TransformButton"]');

    console.log("  ⏳ Жду ответа API...");
    await waitForResponseWithCaptchaCheck(page, apiResponse);
    await waitIfCaptcha(page);

    await waitForSelectorWithCaptchaCheck(page, '[data-test-id="download-btn"]', 2 * 60 * 1000);
    await page.click('[data-test-id="download-btn"]');

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
    return error.message.includes("Капча") ? "captcha" : false;
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
  let captchaStreak = 0;

  try {
    while (true) {
      const i = cursor++;
      if (i >= photos.length) break;
      const result = await processPhoto(browser, photos[i], i + 1, photos.length);
      if (result === true) {
        successCount++;
        captchaStreak = 0;
      } else if (result === "captcha") {
        captchaStreak++;
        if (captchaStreak >= 3) {
          console.log("  🕐 3 капчи подряд — жду 5 минут...");
          await new Promise((r) => setTimeout(r, 5 * 60 * 1000));
          captchaStreak = 0;
        }
      } else {
        captchaStreak = 0;
      }
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
