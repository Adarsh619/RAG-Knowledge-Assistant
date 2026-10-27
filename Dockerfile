# Groundwork for a free Hugging Face Docker Space (CPU basic: 2 vCPU, 16 GB RAM).
# One process: Next.js serves the app and runs MiniLM embeddings plus the
# embedded Qwen3 generator in-process. No Ollama, GPU or paid API is used.
FROM node:24-bookworm-slim

# CPU-only inference: skip onnxruntime-node's optional CUDA download.
ENV ONNXRUNTIME_NODE_INSTALL=skip \
    NEXT_TELEMETRY_DISABLED=1

# Hugging Face runs containers as user ID 1000; the node image's "node" user has it.
WORKDIR /app
RUN chown node:node /app
USER node

# Install exactly the locked dependencies (dev tools are needed for the build).
COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY --chown=node:node . .

# Bake pinned model weights into the image. The app never downloads models at runtime.
ARG LOCAL_MODEL_ID=qwen3-0.6b
RUN LOCAL_MODEL_ID="$LOCAL_MODEL_ID" npm run models:prepare

# Next.js inlines NEXT_PUBLIC_ values into browser code at build time, so they
# must be present here. Both are publishable values, never a service-role key.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
RUN test -n "$NEXT_PUBLIC_SUPABASE_URL" && test -n "$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" \
    || (echo "Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY as Space variables." && exit 1)
# Dev dependencies stay installed: `next start` needs TypeScript to read next.config.ts.
RUN NEXT_PUBLIC_SUPABASE_URL="$NEXT_PUBLIC_SUPABASE_URL" \
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" \
    npm run build

# Safe defaults for the hosted demo; Space variables override them at runtime.
ENV NODE_ENV=production \
    LLM_MODE=local \
    LOCAL_RUNTIME=embedded \
    LOCAL_MODEL_ID=$LOCAL_MODEL_ID \
    GENERATION_TIMEOUT_MS=180000 \
    PUBLIC_DEMO=true

# Hugging Face routes HTTPS traffic to this port. 0.0.0.0 is inside the container only.
EXPOSE 7860
CMD ["node_modules/.bin/next", "start", "-H", "0.0.0.0", "-p", "7860"]
