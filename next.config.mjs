/** @type {import('next').NextConfig} */
const nextConfig = {
  // llms.txt is served from /public as a static asset; ensure no rewrite hijacks it.
  async headers() {
    return [
      {
        source: '/llms.txt',
        headers: [{ key: 'Content-Type', value: 'text/plain; charset=utf-8' }],
      },
    ];
  },
};

export default nextConfig;
