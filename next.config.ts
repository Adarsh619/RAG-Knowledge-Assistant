import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
    ] }];
  },
  // Serverless bundles contain only traced files: ship the prepared MiniLM files with
  // the API routes, and only the linux-x64 ONNX runtime (the whole package is 288 MB).
  // onnxruntime-node loads its native binding from a runtime-built path the tracer cannot see.
  outputFileTracingIncludes: {
    "/api/**/*": ["./.setup-cache/transformers/Xenova/**/*", "./node_modules/onnxruntime-node/**/*"],
  },
  outputFileTracingExcludes: {
    "/api/**/*": [
      "./.setup-cache/transformers/onnx-community/**",
      "./node_modules/onnxruntime-node/bin/napi-v6/darwin/**",
      "./node_modules/onnxruntime-node/bin/napi-v6/win32/**",
      "./node_modules/onnxruntime-node/bin/napi-v6/linux/arm64/**",
      // GPU providers fetched by the Linux postinstall (~273 MB); serverless functions are CPU-only.
      "./node_modules/onnxruntime-node/bin/napi-v6/linux/x64/libonnxruntime_providers_cuda.so",
      "./node_modules/onnxruntime-node/bin/napi-v6/linux/x64/libonnxruntime_providers_tensorrt.so",
    ],
  },
  serverExternalPackages: [
    "pdf-parse",
    "@napi-rs/canvas",
    "@huggingface/transformers",
    "onnxruntime-node",
    "sharp",
  ],
};

export default nextConfig;
