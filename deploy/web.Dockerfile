FROM node:22-bookworm-slim AS build

WORKDIR /workspace/videobox

ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . ./

ARG NEXT_PUBLIC_ASSET_BASE_URL=https://storage.googleapis.com/audeobox-cdn/videobox
ARG NEXT_PUBLIC_RENDER_API_BASE=/api/render
ARG NEXT_PUBLIC_FEED_BASE_URL=/audeobox-feeds

ENV NEXT_PUBLIC_ASSET_BASE_URL=${NEXT_PUBLIC_ASSET_BASE_URL} \
    NEXT_PUBLIC_RENDER_API_BASE=${NEXT_PUBLIC_RENDER_API_BASE} \
    NEXT_PUBLIC_FEED_BASE_URL=${NEXT_PUBLIC_FEED_BASE_URL}

RUN npm run build

FROM nginx:1.25-alpine

COPY deploy/nginx-web.conf /etc/nginx/conf.d/default.conf
COPY --from=build /workspace/videobox/out /usr/share/nginx/html

EXPOSE 3000

CMD ["nginx", "-g", "daemon off;"]
