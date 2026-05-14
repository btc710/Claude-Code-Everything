/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The dashboard's API routes `require()` local CommonJS sibling packages
  // (atlas-project-ledger, atlas-model-gateway) at runtime. We don't need
  // to bundle them in for `next build`; we keep them external so node can
  // resolve them via the workspace path at runtime on Vercel.
  experimental: {
    serverComponentsExternalPackages: ['atlas-project-ledger', 'atlas-model-gateway'],
  },
};

module.exports = nextConfig;
