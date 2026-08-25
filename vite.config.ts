import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      // Subscriptions are SSE, which is plain streaming HTTP -- no websocket.
      "/trpc": {
        target: `http://localhost:${process.env.PORT ?? 5050}`,
        ws: false,
      },
    },
  },
});
