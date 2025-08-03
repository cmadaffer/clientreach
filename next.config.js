/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      // Redirect any legacy/duplicate connect routes to the single canonical page
      { source: '/connect', destination: '/connect-freshbooks', permanent: true },
      { source: '/connect-freshbooks-2', destination: '/connect-freshbooks', permanent: true },
      { source: '/freshbooks', destination: '/connect-freshbooks', permanent: true },
    ];
  },
};

module.exports = nextConfig;
