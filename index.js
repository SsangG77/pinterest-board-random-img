const express = require("express");
const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");

const app = express();
const port = 3000;

const CACHE_DIR = path.join(__dirname, "cache");
if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR);

// Puppeteer로 모든 이미지 스크랩
async function scrapeAllBoardImages(username, boardName) {
  const boardUrl = `https://www.pinterest.com/${username}/${boardName}/`;
const browser = await puppeteer.launch({
  headless: true,
  executablePath: '/usr/bin/chromium', // Render 환경에 따라 다름
  args: ['--no-sandbox', '--disable-setuid-sandbox']
});




  const page = await browser.newPage();

  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/115 Safari/537.36"
  );

  await page.goto(boardUrl, { waitUntil: "networkidle2" });

  const imageUrls = new Set();
  let prevCount = 0;

  try {
    while (true) {
      // img src, srcset, data-src 등 모든 속성 확인
      const newImages = await page.evaluate(() => {
        return Array.from(document.querySelectorAll("img")).map(img =>
          img.src || img.srcset || img.getAttribute("data-src")
        ).filter(Boolean);
      });

      newImages.forEach(url => imageUrls.add(url));

      if (imageUrls.size === prevCount) break; // 더 이상 새로운 이미지 없으면 종료
      prevCount = imageUrls.size;

      await page.evaluate("window.scrollTo(0, document.body.scrollHeight)");
      await new Promise(resolve => setTimeout(resolve, 2500)); // 안정적 로딩 대기
    }
  } catch (err) {
    console.error("Scraping error:", err.message);
  } finally {
    await browser.close();
  }

  return Array.from(imageUrls);
}

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

// API: 랜덤 이미지 반환
app.get("/:username/:boardName", async (req, res) => {
  const { username, boardName } = req.params;

  let cachedImages = loadCache(username, boardName);

  if (cachedImages.length === 0) {
    try {
      console.log("Cache empty. Scraping full board...");
      cachedImages = await scrapeAllBoardImages(username, boardName);
      if (cachedImages.length === 0) return res.status(404).send("No images found.");
      saveCache(username, boardName, cachedImages);
    } catch (err) {
      return res.status(500).send("Failed to scrape board: " + err.message);
    }
  }

  const randomImage = cachedImages[Math.floor(Math.random() * cachedImages.length)];
  res.redirect(randomImage);
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
