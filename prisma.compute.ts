import { defineComputeConfig } from "@prisma/compute-sdk/config";

export default defineComputeConfig({
  app: {
    name: "pharmaflow-ai",
    framework: "custom",
    httpPort: 4003,
    build: {
      command: "cd server && npm install && npm run build && npm run bundle",
      outputDirectory: "server/dist",
      entrypoint: "index.js",
    },
  },
});
