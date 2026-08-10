/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    // BACKEND_URL is the backend's own public URL once deployed (e.g. the
    // Hostinger Node.js Web App for the API, https://api.yourdomain.com).
    // Locally this defaults to the backend running on :4000. Because
    // Next.js still runs a real Node server in production (not a static
    // export), this rewrite keeps proxying server-side after deploy too —
    // the browser only ever talks to the frontend's own origin.
    const backend = process.env.BACKEND_URL || "http://localhost:4000";
    return [{ source: "/api/:path*", destination: `${backend}/:path*` }];
  },
};
module.exports = nextConfig;

