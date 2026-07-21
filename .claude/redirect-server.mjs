// Preview redirect server for the Foundry "tno" system.
//
// The Claude preview harness starts this via .claude/launch.json and expects an
// HTTP server on PORT (4173). Foundry VTT itself runs separately (default :30000).
// This tiny server just forwards the preview browser to the live Foundry instance
// so the preview pane opens Foundry rather than a dead port.
//
// Config via env:
//   PORT          port this server listens on            (default 4173)
//   FOUNDRY_PORT  port the running Foundry instance uses (default 30000)
//   FOUNDRY_HOST  host the running Foundry instance uses (default localhost)

import http from 'node:http';

const PORT = Number(process.env.PORT) || 4173;
const FOUNDRY_HOST = process.env.FOUNDRY_HOST || 'localhost';
const FOUNDRY_PORT = Number(process.env.FOUNDRY_PORT) || 30000;
const TARGET_ORIGIN = `http://${FOUNDRY_HOST}:${FOUNDRY_PORT}`;

const server = http.createServer((req, res) => {
  // Preserve the requested path + query so deep links still work.
  const location = `${TARGET_ORIGIN}${req.url || '/'}`;
  res.writeHead(302, { Location: location });
  res.end(`Redirecting to ${location}\n`);
});

server.on('error', (err) => {
  console.error(`[foundry-redirect] server error: ${err.message}`);
  process.exit(1);
});

server.listen(PORT, () => {
  console.log(`[foundry-redirect] listening on http://localhost:${PORT}`);
  console.log(`[foundry-redirect] redirecting all requests to ${TARGET_ORIGIN}`);
});
