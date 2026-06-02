/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['@node-rs/argon2'],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'firebasestorage.googleapis.com' },
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' }
    ]
  }
}

export default nextConfig
