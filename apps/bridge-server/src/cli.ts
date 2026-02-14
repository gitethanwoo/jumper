#!/usr/bin/env node

export {};

const DEFAULT_RELAY_URL = "wss://relay.jumper.sh";

function printHelp(): void {
  process.stdout.write(
    [
      "jumper-app",
      "",
      "Starts the Jumper bridge server for the iOS app.",
      "",
      "Environment variables:",
      "  PORT         HTTP/WebSocket port (default: 8787)",
      "  HOST         Bind host (default: 0.0.0.0)",
      "  PUBLIC_HOST  Public host:port shown in connect instructions",
      `  RELAY_URL    Relay websocket URL (default: ${DEFAULT_RELAY_URL})`,
      "",
      "Examples:",
      "  npx jumper-app",
      "  PORT=9000 npx jumper-app",
      "  RELAY_URL= npx jumper-app",
      "",
    ].join("\n")
  );
}

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  printHelp();
  process.exit(0);
}

if (!process.env.RELAY_URL) {
  process.env.RELAY_URL = DEFAULT_RELAY_URL;
}

await import("./index.js");
