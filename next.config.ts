/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['@node-rs/argon2', 'firebase-admin'],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'firebasestorage.googleapis.com' },
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' }
    ]
  }
}
  ,
  async headers() {
    return [{
      source: "/(.*)",
      headers: [{ key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" }]
    }]
  }
}
export default nextConfig
