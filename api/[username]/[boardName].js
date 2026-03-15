const fs = require("fs");
const path = require("path");
const https = require("https");

function triggerCrawl(username, board) {
  const data = JSON.stringify({
    ref: "main",
    inputs: { username, board }
  });

  const options = {
    hostname: "api.github.com",
    path: "/repos/SsangG77/pinterest-board-random-img/actions/workflows/crawl.yml/dispatches",
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.GITHUB_TOKEN}`,
      "Accept": "application/vnd.github.v3+json",
      "User-Agent": "pinterest-server",
      "Content-Type": "application/json",
      "Content-Length": data.length
    }
  };

  const req = https.request(options);
  req.write(data);
  req.end();
}

module.exports = (req, res) => {
  const { username, boardName } = req.query;

  const cacheFile = path.join(process.cwd(), "cache.json");
  let cache = { data: [] };
  try {
    cache = JSON.parse(fs.readFileSync(cacheFile));
  } catch {
    return res.status(500).send("Cache not found.");
  }

  const board = cache.data.find(d => d.user === username && d.board === boardName);

  if (!board?.images?.length) {
    triggerCrawl(username, boardName);
    return res.status(202).send("Board not cached. Crawling started. Try again in a few minutes.");
  }

  const randomUrl = board.images[Math.floor(Math.random() * board.images.length)];
  res.redirect(randomUrl);
};
