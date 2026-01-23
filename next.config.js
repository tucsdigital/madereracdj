/** @type {import('next').NextConfig} */

const withNextra = require("nextra")({
  theme: "nextra-theme-docs",
  themeConfig: "./theme.config.jsx",
});
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Excluir paquetes del bundle del servidor (solo para API routes)
  serverComponentsExternalPackages: [
    "puppeteer",
    "puppeteer-core",
    "@sparticuz/chromium",
  ],
  webpack(config, { isServer }) {
    // Resolver paths para @/*
    if (!config.resolve.alias) {
      config.resolve.alias = {};
    }
    config.resolve.alias["@"] = require("path").resolve(__dirname, ".");

    // Excluir puppeteer y chromium del bundle del cliente
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        child_process: false,
        path: false,
        crypto: false,
      };
    }

    // Configurar externals para el servidor: excluir puppeteer del bundle
    if (isServer) {
      // Agregar externals para que webpack no procese estos módulos
      const originalExternals = config.externals;
      config.externals = [
        ...(Array.isArray(originalExternals) ? originalExternals : [originalExternals].filter(Boolean)),
        ({ request }, callback) => {
          if (
            request === "puppeteer" ||
            request === "puppeteer-core" ||
            request === "@sparticuz/chromium"
          ) {
            // Marcar como external: webpack no lo procesará, se cargará en runtime
            return callback(null, `commonjs ${request}`);
          }
          callback();
        },
      ];
      
      // Configurar webpack para que ignore completamente el archivo load-puppeteer.js
      // o al menos no procese sus require dinámicos
      config.module = config.module || {};
      config.module.exprContextCritical = false;
      config.module.unknownContextCritical = false;
    } else {
      // Cliente: ignorar completamente
      config.plugins = config.plugins || [];
      const webpack = require("webpack");
      config.plugins.push(
        new webpack.IgnorePlugin({
          resourceRegExp: /^(puppeteer|puppeteer-core|@sparticuz\/chromium)$/,
        })
      );
    }

    // Grab the existing rule that handles SVG imports
    const fileLoaderRule = config.module.rules.find((rule) =>
      rule.test?.test?.(".svg")
    );

    config.module.rules.push(
      // Reapply the existing rule, but only for svg imports ending in ?url
      {
        ...fileLoaderRule,
        test: /\.svg$/i,
        resourceQuery: /url/, // *.svg?url
      },
      // Convert all other *.svg imports to React components
      {
        test: /\.svg$/i,
        issuer: fileLoaderRule.issuer,
        resourceQuery: { not: [...fileLoaderRule.resourceQuery.not, /url/] }, // exclude if *.svg?url
        use: ["@svgr/webpack"],
      }
    );

    // Modify the file loader rule to ignore *.svg, since we have it handled now.
    fileLoaderRule.exclude = /\.svg$/i;

    return config;
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "api.lorem.space",
      },
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
      {
        protocol: "https",
        hostname: "a0.muscache.com",
      },
      {
        protocol: "https",
        hostname: "avatars.githubusercontent.com",
      },
    ],
  },
};

module.exports = withNextra(nextConfig);
