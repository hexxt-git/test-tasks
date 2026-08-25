import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { createHTTPHandler } from "@trpc/server/adapters/standalone";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: "trpc",
      async configureServer(server) {
        // Imported lazily so `vite build` does not open redis connections.
        const { appRouter } = await import("./src/trpc.ts");
        const handler = createHTTPHandler({ router: appRouter, basePath: "/" });
        server.middlewares.use("/trpc", handler);
      },
    },
  ],
});
