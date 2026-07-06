FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates \
        chromium \
        fonts-liberation \
        libasound2 \
        libatk-bridge2.0-0 \
        libatk1.0-0 \
        libcairo2 \
        libcups2 \
        libdbus-1-3 \
        libdrm2 \
        libgbm1 \
        libgconf-2-4 \
        libnspr4 \
        libnss3 \
        libpango-1.0-0 \
        libx11-6 \
        libxcb1 \
        libxcomposite1 \
        libxdamage1 \
        libxext6 \
        libxfixes3 \
        libxkbcommon0 \
        libxrandr2 \
        libxrender1 \
        libxshmfence1 \
        libxss1 \
        wget \
        unzip \
    && rm -rf /var/lib/apt/lists/*

# Chromium >= ~142 crashes on this host's CPU with SIGILL ("trap invalid opcode"
# in dmesg) — the prebuilt binary uses an instruction this GCP Xeon lacks. The
# system `chromium` package (above) drifts to the latest on every rebuild and is
# kept ONLY for its shared-lib dependencies. The actual render browser is a
# pinned chrome-headless-shell known to run here (141 works; 142+ SIGILL).
ARG CHROME_VERSION=141.0.7390.54
RUN wget -q "https://storage.googleapis.com/chrome-for-testing-public/${CHROME_VERSION}/linux64/chrome-headless-shell-linux64.zip" -O /tmp/chs.zip \
    && mkdir -p /opt/chrome \
    && unzip -q /tmp/chs.zip -d /opt/chrome \
    && rm /tmp/chs.zip \
    && ln -sf /opt/chrome/chrome-headless-shell-linux64/chrome-headless-shell /usr/local/bin/chrome-headless-shell

WORKDIR /project

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . ./

RUN mkdir -p /renders \
    && chown -R node:node /project /renders

ENV NODE_ENV=production \
    PORT=3001 \
    PROJECT_DIR=/project \
    OUTPUT_DIR=/renders \
    BROWSER_EXECUTABLE=/usr/local/bin/chrome-headless-shell \
    REMOTION_CHROME_MODE=chrome-for-testing \
    HOME=/tmp

USER node

EXPOSE 3001

CMD ["node", "server/server.mjs"]
