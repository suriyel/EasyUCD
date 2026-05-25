import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// 本地工具：前端 5173，开发时把 /api 代理到本地 Fastify 服务（3001）。
// `process.env.IS_PREACT` 是 Excalidraw 在 Vite 下的必需 define（否则运行时报错）。
export default defineConfig({
  plugins: [react()],
  define: {
    "process.env.IS_PREACT": JSON.stringify("false"),
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3001",
        changeOrigin: true,
      },
    },
  },
});
