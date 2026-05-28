import { readdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const previewDir = join(__dirname, 'preview');

const REPO = 'dimkadenisov/last-bell';
const BRANCH = 'main';
const LFS_BASE = `https://media.githubusercontent.com/media/${REPO}/${BRANCH}/clean`;

const photos = readdirSync(previewDir)
  .filter(f => /\.(jpe?g|png|webp|gif)$/i.test(f))
  .sort();

const html = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Photo Gallery</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #0f0f0f; color: #e0e0e0; font-family: system-ui, sans-serif; min-height: 100vh; }

    .header {
      padding: 24px 32px 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      flex-wrap: wrap;
      border-bottom: 1px solid #222;
    }
    .header h1 { font-size: 1.2rem; font-weight: 500; color: #aaa; }
    .header .count { font-size: 0.9rem; color: #555; }

    .btn {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 10px 20px;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      font-size: 0.9rem;
      font-weight: 500;
      transition: opacity 0.15s;
      text-decoration: none;
    }
    .btn:hover { opacity: 0.8; }
    .btn-primary { background: #fff; color: #0f0f0f; }
    .btn-ghost { background: #1e1e1e; color: #e0e0e0; border: 1px solid #333; }
    .btn:disabled { opacity: 0.4; cursor: not-allowed; }

    .progress-bar {
      display: none;
      width: 100%;
      height: 3px;
      background: #222;
    }
    .progress-bar.active { display: block; }
    .progress-fill {
      height: 100%;
      background: #fff;
      transition: width 0.1s;
      width: 0%;
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 4px;
      padding: 4px;
    }

    .thumb {
      aspect-ratio: 3/2;
      overflow: hidden;
      cursor: pointer;
      background: #1a1a1a;
      position: relative;
    }
    .thumb img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      transition: transform 0.2s, opacity 0.3s;
      opacity: 0;
    }
    .thumb img.loaded { opacity: 1; }
    .thumb:hover img { transform: scale(1.04); }

    /* Lightbox */
    .lb {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.95);
      z-index: 1000;
      flex-direction: column;
    }
    .lb.open { display: flex; }

    .lb-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 20px;
      gap: 12px;
      flex-shrink: 0;
    }
    .lb-counter { font-size: 0.85rem; color: #666; }
    .lb-filename { font-size: 0.85rem; color: #888; flex: 1; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .lb-actions { display: flex; gap: 8px; }

    .lb-body {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
      overflow: hidden;
    }
    .lb-img {
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
      user-select: none;
      transition: opacity 0.15s;
    }
    .lb-img.fading { opacity: 0; }

    .lb-arrow {
      position: absolute;
      top: 50%;
      transform: translateY(-50%);
      background: rgba(255,255,255,0.08);
      border: none;
      color: #fff;
      font-size: 1.5rem;
      width: 48px;
      height: 80px;
      cursor: pointer;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.15s;
    }
    .lb-arrow:hover { background: rgba(255,255,255,0.18); }
    .lb-arrow.prev { left: 12px; }
    .lb-arrow.next { right: 12px; }

    .icon { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
  </style>
</head>
<body>

<div class="header">
  <div>
    <h1>Photo Gallery</h1>
    <div class="count">${photos.length} photos</div>
  </div>
  <button class="btn btn-primary" id="dlAll" onclick="downloadAll()">
    <svg class="icon" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
    Скачать все (оригиналы)
  </button>
</div>

<div class="progress-bar" id="progressBar"><div class="progress-fill" id="progressFill"></div></div>

<div class="grid" id="grid"></div>

<!-- Lightbox -->
<div class="lb" id="lb">
  <div class="lb-top">
    <span class="lb-counter" id="lbCounter"></span>
    <span class="lb-filename" id="lbFilename"></span>
    <div class="lb-actions">
      <a class="btn btn-ghost" id="lbDl" download>
        <svg class="icon" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        Скачать оригинал
      </a>
      <button class="btn btn-ghost" onclick="closeLb()">✕</button>
    </div>
  </div>
  <div class="lb-body">
    <button class="lb-arrow prev" id="prevBtn" onclick="navigate(-1)">‹</button>
    <img class="lb-img" id="lbImg" alt="" />
    <button class="lb-arrow next" id="nextBtn" onclick="navigate(1)">›</button>
  </div>
</div>

<script>
const photos = ${JSON.stringify(photos)};
const LFS_BASE = '${LFS_BASE}';
let current = 0;

const grid = document.getElementById('grid');
photos.forEach((name, i) => {
  const div = document.createElement('div');
  div.className = 'thumb';
  div.onclick = () => openLb(i);
  const img = document.createElement('img');
  img.loading = 'lazy';
  img.alt = name;
  img.src = 'preview/' + name;
  img.onload = () => img.classList.add('loaded');
  img.onerror = () => img.classList.add('loaded');
  div.appendChild(img);
  grid.appendChild(div);
});

function openLb(i) {
  current = i;
  updateLb();
  document.getElementById('lb').classList.add('open');
}
function closeLb() {
  document.getElementById('lb').classList.remove('open');
}
function navigate(dir) {
  current = (current + dir + photos.length) % photos.length;
  const img = document.getElementById('lbImg');
  img.classList.add('fading');
  setTimeout(() => {
    updateLb();
    img.classList.remove('fading');
  }, 120);
}
function updateLb() {
  const name = photos[current];
  document.getElementById('lbImg').src = 'preview/' + name;
  document.getElementById('lbFilename').textContent = name;
  document.getElementById('lbCounter').textContent = (current + 1) + ' / ' + photos.length;
  const dl = document.getElementById('lbDl');
  dl.href = LFS_BASE + '/' + name;
  dl.download = name;
}

document.addEventListener('keydown', e => {
  const lb = document.getElementById('lb');
  if (!lb.classList.contains('open')) return;
  if (e.key === 'ArrowLeft') navigate(-1);
  else if (e.key === 'ArrowRight') navigate(1);
  else if (e.key === 'Escape') closeLb();
});

document.getElementById('lb').addEventListener('click', e => {
  if (e.target === e.currentTarget || e.target.classList.contains('lb-body')) closeLb();
});

async function downloadAll() {
  const btn = document.getElementById('dlAll');
  const bar = document.getElementById('progressBar');
  const fill = document.getElementById('progressFill');
  btn.disabled = true;
  btn.textContent = 'Загрузка...';
  bar.classList.add('active');

  const script = document.createElement('script');
  script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
  document.head.appendChild(script);
  await new Promise(r => { script.onload = r; });

  const zip = new JSZip();
  const folder = zip.folder('photos');
  let done = 0;

  await Promise.all(photos.map(async name => {
    try {
      const resp = await fetch(LFS_BASE + '/' + name);
      const blob = await resp.blob();
      folder.file(name, blob);
    } catch {}
    done++;
    fill.style.width = (done / photos.length * 100) + '%';
  }));

  fill.style.width = '100%';
  btn.textContent = 'Создание ZIP...';
  const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'photos.zip';
  a.click();
  URL.revokeObjectURL(url);

  btn.disabled = false;
  btn.innerHTML = '<svg class="icon" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Скачать все (оригиналы)';
  bar.classList.remove('active');
  fill.style.width = '0%';
}
</script>
</body>
</html>`;

writeFileSync(join(__dirname, 'index.html'), html);
console.log(`Generated index.html with ${photos.length} photos`);
