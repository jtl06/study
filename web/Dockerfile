FROM node:22-bookworm-slim

WORKDIR /app

ARG TARGETARCH
ARG WASMER_VERSION=7.1.0
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && case "$TARGETARCH" in \
      amd64) WASMER_ARCH="amd64"; WASMER_SHA="61a6ad0f972ee0afbb7907ab90f1120e15d2e219ec1ce08999f2864e0b8c340f" ;; \
      arm64) WASMER_ARCH="aarch64"; WASMER_SHA="b9177f79be73e3912ef0bfda9e56db7540ed09dd22dc293f27b564ab150e5c79" ;; \
      *) echo "Unsupported architecture: $TARGETARCH"; exit 1 ;; \
    esac \
    && curl -fsSL "https://github.com/wasmerio/wasmer/releases/download/v${WASMER_VERSION}/wasmer-linux-${WASMER_ARCH}.tar.gz" -o /tmp/wasmer.tar.gz \
    && echo "${WASMER_SHA}  /tmp/wasmer.tar.gz" | sha256sum -c - \
    && tar -xzf /tmp/wasmer.tar.gz -C /usr/local \
    && ldconfig \
    && wasmer --version \
    && rm -f /tmp/wasmer.tar.gz \
    && apt-get purge -y --auto-remove curl \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run railway:build

ENV NODE_ENV=production
ENV PORT=3000
ENV WASMER_DIR=/app/.wasmer

EXPOSE 3000

CMD ["npm", "run", "railway:start"]
