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
    && rm -rf /var/lib/apt/lists/*

WORKDIR /project

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . ./

# Bake Chrome for Testing (full Chrome, all codecs) into the image at build
# time. The Debian chromium package (still installed above as an emergency
# fallback — point BROWSER_EXECUTABLE at /usr/bin/chromium to use it) can't
# present <video> frames in headless renders: Html5Video's frame-sync seek
# waits forever and delayRender times out. Chrome for Testing is the same
# browser the desktop app uses, so web and desktop renders behave
# identically. Downloading here (not at container start) keeps production
# startup network-free.
RUN node -e "require('@remotion/renderer').ensureBrowser({chromeMode:'chrome-for-testing'}).then(()=>console.log('chrome-for-testing ready'))"

RUN mkdir -p /renders \
    && chown -R node:node /project /renders

ENV NODE_ENV=production \
    PORT=3001 \
    PROJECT_DIR=/project \
    OUTPUT_DIR=/renders \
    CHROME_MODE=chrome-for-testing \
    HOME=/tmp

USER node

EXPOSE 3001

CMD ["node", "server/server.mjs"]
