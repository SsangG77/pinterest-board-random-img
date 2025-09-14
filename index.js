const express = require("express");
const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");

const app = express();
const port = process.env.PORT || 3000;

const CACHE_DIR = path.join(__dirname, "cache");
if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR);

// 캐시 파일 경로
function getCachePath(username, boardName) {
  return path.join(CACHE_DIR, `${username}_${boardName}.json`);
}

// 캐시 로드
function loadCache(username, boardName) {
  const file = getCachePath(username, boardName);
  if (!fs.existsSync(file)) return [];
  try {
    const data = fs.readFileSync(file);
    return JSON.parse(data).images || [];
  } catch {
    return [];
  }
}

// 캐시 저장
function saveCache(username, boardName, images) {
  const file = getCachePath(username, boardName);
  try {
    fs.writeFileSync(file, JSON.stringify({ images }, null, 2));
  } catch (err) {
    console.error("Cache save error:", err.message);
  }
}

// Puppeteer로 보드 전체 이미지 수집
async function scrapeAllBoardImages(username, boardName) {
  const boardUrl = `https://www.pinterest.com/${username}/${boardName}/`;
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  const page = await browser.newPage();
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115 Safari/537.36"
  );
  await page.goto(boardUrl, { waitUntil: "networkidle2" });

  const imageUrls = new Set();
  let prevCount = 0;

  while (true) {
    const newImages = await page.evaluate(() =>
      Array.from(document.querySelectorAll("img"))
        .map(img => img.src || img.srcset || img.getAttribute("data-src"))
        .filter(Boolean)
    );
    newImages.forEach(url => imageUrls.add(url));

    if (imageUrls.size === prevCount) break;
    prevCount = imageUrls.size;

    await page.evaluate("window.scrollTo(0, document.body.scrollHeight)");
    await page.waitForTimeout(2500);
  }

  await browser.close();
  return Array.from(imageUrls);
}

// 캐시 업데이트
async function updateCache(username, boardName) {
  const cachedImages = loadCache(username, boardName);
  const scrapedImages = await scrapeAllBoardImages(username, boardName);
  const newImages = scrapedImages.filter(url => !cachedImages.includes(url));
  if (newImages.length > 0) {
    const updated = cachedImages.concat(newImages);
    saveCache(username, boardName, updated);
    return updated;
  }
  return cachedImages;
}

// API: 랜덤 이미지 반환
app.get("/:username/:boardName", async (req, res) => {
  const { username, boardName } = req.params;
  let images = loadCache(username, boardName);

  if (images.length === 0) {
    console.log("Cache empty. Scraping full board...");
    images = await scrapeAllBoardImages(username, boardName);
    if (images.length === 0) return res.status(404).send("No images found.");
    saveCache(username, boardName, images);
  } else {
    images = await updateCache(username, boardName);
  }

  const randomImage = images[Math.floor(Math.random() * images.length)];
  res.redirect(randomImage);
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
