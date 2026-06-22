import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = fileURLToPath(new URL(".", import.meta.url));
const clientDir = resolve(rootDir, "dist/client");
const worker = (await import(pathToFileURL(resolve(rootDir, "dist/server/index.js")).href)).default;
const port = Number(process.env.PORT ?? 3000);

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function getStaticFile(pathname) {
  const decoded = decodeURIComponent(pathname);
  const normalized = normalize(decoded).replace(/^(\.\.[/\\])+/, "");
  const filePath = resolve(join(clientDir, normalized));
  if (!filePath.startsWith(clientDir) || !existsSync(filePath) || !statSync(filePath).isFile()) {
    return null;
  }
  return filePath;
}

function sendStaticFile(res, filePath) {
  res.statusCode = 200;
  res.setHeader("content-type", contentTypes[extname(filePath)] ?? "application/octet-stream");
  createReadStream(filePath).pipe(res);
}

async function sendWorkerResponse(req, res) {
  const host = req.headers.host ?? `localhost:${port}`;
  const url = new URL(req.url ?? "/", `https://${host}`);
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) {
      for (const item of value) headers.append(key, item);
    } else if (value) {
      headers.set(key, value);
    }
  }

  const request = new Request(url, {
    method: req.method,
    headers,
    body: req.method === "GET" || req.method === "HEAD" ? undefined : req,
    duplex: req.method === "GET" || req.method === "HEAD" ? undefined : "half",
  });
  const response = await worker.fetch(request, process.env, {
    waitUntil() {},
    passThroughOnException() {},
  });

  res.statusCode = response.status;
  response.headers.forEach((value, key) => res.setHeader(key, value));
  if (!response.body) {
    res.end();
    return;
  }
  const body = Buffer.from(await response.arrayBuffer());
  res.end(body);
}

createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url ?? "/", `https://${req.headers.host ?? "localhost"}`).pathname;
    const staticFile = getStaticFile(pathname);
    if (staticFile) {
      sendStaticFile(res, staticFile);
      return;
    }
    await sendWorkerResponse(req, res);
  } catch (error) {
    console.error(error);
    res.statusCode = 500;
    res.end("Internal Server Error");
  }
}).listen(port, "0.0.0.0", () => {
  console.log(`Cine Estrella listening on ${port}`);
});
