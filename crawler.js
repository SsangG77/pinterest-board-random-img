const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");

const CACHE_FILE = path.join(__dirname, "cache.json");

function loadCacheFile() {
  if (!fs.existsSync(CACHE_FILE)) return { data: [] };
  try {
    return JSON.parse(fs.readFileSync(CACHE_FILE));
  } catch {
    return { data: [] };
  }
}

function saveCache(username, board, images) {
  const cache = loadCacheFile();
  const idx = cache.data.findIndex(d => d.user === username && d.board === board);
  if (idx >= 0) {
    cache.data[idx].images = images;
  } else {
    cache.data.push({ user: username, board, images });
  }
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
  console.log(`[Save] ${username}/${board}: ${images.length} images`);
}

async function scrapeBoard(username, board) {
  const url = `https://www.pinterest.com/${username}/${board}/`;
  console.log(`[Scrape] ${username}/${board} ...`);

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });
  const page = await browser.newPage();
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/115 Safari/537.36"
  );

  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  await new Promise(r => setTimeout(r, 5000));

  // 스크롤하면서 DOM의 img srcset에서 originals URL 수집
  // 가상 스크롤이라 지나간 img는 사라지므로 매 스크롤마다 수집
  const imageUrls = new Set();
  let noNewCount = 0;

  while (noNewCount < 5) {
    // 현재 DOM에 있는 핀 이미지에서 originals URL 추출
    const current = await page.evaluate(() => {
      const urls = [];
      document.querySelectorAll('img[srcset*="i.pinimg.com"]').forEach(img => {
        const srcset = img.getAttribute("srcset") || "";
        const match = srcset.match(/https:\/\/i\.pinimg\.com\/originals\/[^\s"]+/);
        if (match) urls.push(match[0]);
      });
      return urls;
    });

    const prev = imageUrls.size;
    current.forEach(u => imageUrls.add(u));

    if (imageUrls.size === prev) {
      noNewCount++;
    } else {
      noNewCount = 0;
      console.log(`  ${imageUrls.size} images...`);
    }

    await page.evaluate("window.scrollTo(0, document.body.scrollHeight)");
    await new Promise(r => setTimeout(r, 3000));
  }

  await browser.close();
  console.log(`[Done] ${username}/${board}: ${imageUrls.size} images`);
  return Array.from(imageUrls);
}

module.exports = { scrapeBoard, saveCache, loadCacheFile };
