const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = 8080;
const HOST = "0.0.0.0";
const ROOT = __dirname;

const MIME_TYPES = {
  ".html": "text/html; charset=UTF-8",
  ".js": "application/javascript; charset=UTF-8",
  ".mjs": "application/javascript; charset=UTF-8",
  ".css": "text/css; charset=UTF-8",
  ".json": "application/json; charset=UTF-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2"
};

const server = http.createServer((req, res) => {
  const urlPath = req.url.split("?")[0];
  let safePath = path.normalize(urlPath).replace(/^(\.\.[\/\\])+/, "");
  let filePath = path.join(ROOT, safePath);

  if (filePath.endsWith("/") || (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory())) {
    filePath = path.join(filePath, "index.html");
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      const notFoundPath = path.join(ROOT, "404.html");
      if (fs.existsSync(notFoundPath)) {
        res.writeHead(404, { "Content-Type": "text/html; charset=UTF-8" });
        fs.createReadStream(notFoundPath).pipe(res);
      } else {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("404 Not Found");
      }
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";

    res.writeHead(200, {
      "Content-Type": contentType,
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-cache"
    });

    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Choice Auditorium Server listening on http://localhost:${PORT} and http://127.0.0.1:${PORT}`);
});
