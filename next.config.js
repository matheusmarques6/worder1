/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['undici', 'pdf-parse', 'mammoth'],
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'cdn.shopify.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'avatars.githubusercontent.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/**',
      },
      // CDN das imagens de e-mail (cdn.worder.email) — o host por onde
      // toda imagem da biblioteca sai. Lido do ambiente para não fixar
      // o domínio no código.
      ...(process.env.CDN_IMAGES_DOMAIN
        ? [{
            protocol: 'https',
            hostname: process.env.CDN_IMAGES_DOMAIN.replace(/^https?:\/\//i, '').replace(/\/+$/, ''),
            pathname: '/storage/**',
          }]
        : []),
    ],
  },
  // Em produção, remove todos os console.* exceto error/warn.
  // Isso limpa os 1.6k+ console.log dispersos sem precisar refatorar cada arquivo.
  compiler: {
    removeConsole:
      process.env.NODE_ENV === 'production'
        ? { exclude: ['error', 'warn'] }
        : false,
  },
}

module.exports = nextConfig
