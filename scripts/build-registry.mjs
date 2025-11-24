// scripts/build-registry.mjs
import fs from "fs";
import path from "path";
import url from "url";

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFIG_PATH = path.join(__dirname, "..", "allowed-servers.json");
const OUT_DIR = path.join(__dirname, "..", "public"); // Pages root

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
  console.log("Wrote", filePath);
}

function loadConfig() {
  const raw = fs.readFileSync(CONFIG_PATH, "utf8");
  const json = JSON.parse(raw);
  if (!Array.isArray(json.servers)) {
    throw new Error("allowed-servers.json must have a `servers` array");
  }
  return json.servers;
}

function buildRegistryJson(serversConfig) {
  const nowIso = new Date().toISOString();

  const serverResponses = serversConfig.map((cfg) => {
    if (!cfg.id || !cfg.version) {
      throw new Error("Each server needs at least `id` and `version`");
    }

    const serverDetail = {
      name: cfg.id, // MUST match MCP server ID (e.g. "playwright-test")
      description: cfg.description || "",
      title: cfg.title || cfg.id,
      version: cfg.version,
    };

    const meta = {
      "io.modelcontextprotocol.registry/official": {
        status: "active",
        publishedAt: nowIso,
        updatedAt: nowIso,
        isLatest: true,
      },
    };

    return { server: serverDetail, _meta: meta };
  });

  const serverList = {
    servers: serverResponses,
    metadata: {
      nextCursor: null,
      count: serverResponses.length,
    },
  };

  return { serverResponses, serverList };
}

function emitVersionedTree(rootDir, serverResponses, serverList) {
  // /vX/servers (directory)
  const serversDir = path.join(rootDir, "servers");
  ensureDir(serversDir);

  // GET /vX/servers -> /vX/servers/ -> index.html
  writeJson(path.join(serversDir, "index.html"), serverList);

  for (const resp of serverResponses) {
    const { server } = resp;
    const id = encodeURIComponent(server.name);
    const version = encodeURIComponent(server.version);

    const versionsDir = path.join(
      serversDir,
      id,
      "versions"
    );

    // GET /vX/servers/{serverName}/versions/latest
    writeJson(path.join(versionsDir, "latest"), resp);

    // GET /vX/servers/{serverName}/versions/{version}
    writeJson(path.join(versionsDir, version), resp);
  }
}

function main() {
  console.log("Building MCP registry JSON…");

  const serversConfig = loadConfig();
  const { serverResponses, serverList } = buildRegistryJson(serversConfig);

  // Clean output dir
  fs.rmSync(OUT_DIR, { recursive: true, force: true });

  // v0.1 (spec-required)
  const v01Root = path.join(OUT_DIR, "v0.1");
  emitVersionedTree(v01Root, serverResponses, serverList);

  // v0 (compat shim)
  const v0Root = path.join(OUT_DIR, "v0");
  emitVersionedTree(v0Root, serverResponses, serverList);

  console.log("Done. Output in", OUT_DIR);
}

main();
