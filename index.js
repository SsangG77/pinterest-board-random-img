const express = require("express");
const fs = require("fs");
const path = require("path");
const { scrapeBoard, saveCache, loadCacheFile } = require("./crawler");

const app = express();
const port = process.env.PORT || 3000;

function findBoard(username, boardName) {
  const cache = loadCacheFile();
  return cache.data.find(d => d.user === username && d.board === boardName);
}

// 중복 크롤링 방지
const crawling = new Set();

app.get("/:username/:boardName", async (req, res) => {
  const { username, boardName } = req.params;
  const board = findBoard(username, boardName);

  if (board?.images?.length) {
    const randomUrl = board.images[Math.floor(Math.random() * board.images.length)];
    return res.redirect(randomUrl);
  }

  // 캐시 없음: 크롤링 후 첫 이미지 응답
  console.log(`[REQ] New board ${username}/${boardName}`);

  try {
    const urls = await scrapeBoard(username, boardName);
    if (urls.length === 0) return res.status(404).send("No images found.");

    res.redirect(urls[0]);
    saveCache(username, boardName, urls);
  } catch (err) {
    res.status(500).send("Scraping failed: " + err.message);
  }
});

// ── 주기적 크롤링: cache.json에 등록된 보드 전체 갱신 ──

const CRAWL_DAYS = 30;

async function crawlAllBoards() {
  const cache = loadCacheFile();
  if (cache.data.length === 0) return;

  console.log(`[Cron] Crawling ${cache.data.length} board(s)...`);
  for (const { user, board } of cache.data) {
    const key = `${user}/${board}`;
    if (crawling.has(key)) continue;
    crawling.add(key);
    try {
      const urls = await scrapeBoard(user, board);
      if (urls.length > 0) saveCache(user, board, urls);
    } catch (err) {
      console.error(`[Cron] Error ${key}: ${err.message}`);
    } finally {
      crawling.delete(key);
    }
  }
  console.log(`[Cron] Done.`);
}

app.listen(port, () => {
  console.log(`Server running at port ${port}`);

  const cacheFile = path.join(__dirname, "cache.json");
  let shouldCrawl = true;
  try {
    const stat = fs.statSync(cacheFile);
    const daysSince = (Date.now() - stat.mtimeMs) / (24 * 60 * 60 * 1000);
    if (daysSince < CRAWL_DAYS) shouldCrawl = false;
  } catch {}
  if (shouldCrawl) crawlAllBoards();

  setInterval(() => {
    try {
      const stat = fs.statSync(cacheFile);
      const daysSince = (Date.now() - stat.mtimeMs) / (24 * 60 * 60 * 1000);
      if (daysSince >= CRAWL_DAYS) crawlAllBoards();
    } catch {
      crawlAllBoards();
    }
  }, 24 * 60 * 60 * 1000);
});
