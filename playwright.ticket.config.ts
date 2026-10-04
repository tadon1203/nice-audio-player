import config from "./playwright.config";

config.webServer = {
  ...config.webServer,
  command: `"${process.execPath}" node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 5173 --strictPort`,
};

export default config;
