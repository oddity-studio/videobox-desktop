# Videobox Deployment

This directory is the self-contained Docker and nginx deployment bundle for
`videobox.audeobox.com`.

## Docker

```bash
cd /opt/videobox/deploy
cp .env.example .env
/usr/local/bin/docker compose up -d --build
```

The compose file builds two containers:

- `videobox_web`: static Next export served by nginx on `127.0.0.1:3100`
- `videobox_render`: Express + Remotion + Chromium renderer on `127.0.0.1:3101`

Render outputs are written to the persistent Docker volume `videobox_renders`.
Jobs remain in memory for v1, so an app restart clears job status.

## Nginx

Copy the production site config and create a basic auth password file:

```bash
sudo cp nginx/videobox.audeobox.com.conf /etc/nginx/sites-available/videobox.audeobox.com.conf
sudo ln -s /etc/nginx/sites-available/videobox.audeobox.com.conf /etc/nginx/sites-enabled/videobox.audeobox.com.conf
sudo sh -c 'printf "videobox:%s\n" "$(openssl passwd -apr1)" > /etc/nginx/videobox.htpasswd'
sudo nginx -t && sudo systemctl reload nginx
```

If your server uses `/etc/nginx/conf.d/` instead of `sites-available`, copy the
file there instead.

The nginx config expects certificates at:

```text
/etc/letsencrypt/live/videobox.audeobox.com/fullchain.pem
/etc/letsencrypt/live/videobox.audeobox.com/privkey.pem
```

Issue or copy the certificate before reloading nginx, or adjust the paths in the
config to match your existing wildcard certificate.

## Routing

- `/` proxies to `videobox_web`
- `/api/render/*` proxies to `videobox_render`
- `/audeobox-feeds/*` proxies to `https://www.audeobox.com/api/feeds/*`

If Videobox is deployed on the same private network as Audeobox FastAPI, you can
replace the feed proxy upstream with the internal FastAPI address.

## Health Checks

```bash
curl -f http://127.0.0.1:3100/
curl -f http://127.0.0.1:3101/health
/usr/local/bin/docker compose ps
```
