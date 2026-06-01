# Audeobox Videobox

Standalone Next.js + Remotion video editor and render service for Audeobox.

Videobox does not depend on the Audeobox FastAPI app, database, Redis, or the
main app container. The only Audeobox integration is RSS feed loading through
`/audeobox-feeds/*`, which nginx rewrites to the existing public
`/api/feeds/*` endpoints.

## Production Deploy

Docker and nginx deployment files live in `deploy/`.

```bash
cd /opt/videobox/deploy
cp .env.example .env
/usr/local/bin/docker compose up -d --build
```

Default ports:

- Web app: `127.0.0.1:3100`
- Render API: `127.0.0.1:3101`
- Public assets: `https://storage.googleapis.com/audeobox-cdn/videobox`

Install `deploy/nginx/videobox.audeobox.com.conf` into the production nginx
site config directory, create `/etc/nginx/videobox.htpasswd`, make sure the TLS
certificate paths match your server, then run:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

See `deploy/README.md` for the full checklist.
