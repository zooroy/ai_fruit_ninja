import { defineConfig } from "vite";

export default defineConfig(({ mode }) => ({
  base: mode === "production" ? "/ai_fruit_ninja/" : "/",
}));
