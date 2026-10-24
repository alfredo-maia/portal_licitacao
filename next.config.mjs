import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  reactStrictMode: true,
  outputFileTracingRoot: __dirname,
  experimental: {
    optimizePackageImports: ["@carbon/react", "@carbon/icons-react"],
  },
  sassOptions: {
    quietDeps: true,
    silenceDeprecations: ["legacy-js-api", "import", "global-builtin"],
  },
};

export default nextConfig;
