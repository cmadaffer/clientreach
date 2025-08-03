/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      { source: '/connect', destination: '/connect-freshbooks', permanent: true },
      { source: '/connect-freshbooks-2', destination: '/connect-freshbooks', permanent: true },
    ];
  },
};
module.exports = nextConfig;
