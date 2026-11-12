# syntax=docker/dockerfile:1

# Two images from one Angular build:
# - `ssr` (menuly-web-ssr): Node server that renders guest menu pages;
# - the last stage (menuly-web): nginx with the static files, the API proxy,
#   and routing of tenant-subdomain pages to the SSR server.
# The build output is plain JS, so it is built once on the CI machine's
# platform and copied into each architecture's image.
FROM --platform=$BUILDPLATFORM node:26-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:26-alpine AS ssr
ENV NODE_ENV=production
ENV PORT=4000
# The API as the SSR server reaches it directly (compose service name).
ENV API_INTERNAL_URL=http://api:8080
# Domain tenant subdomains hang off. Empty: menuly.app.
ENV BASE_DOMAIN=
# Host names the server renders for, e.g. "*.menuly.app"; *.localhost is built in.
ENV NG_ALLOWED_HOSTS=
# nginx forwards the scheme Caddy saw (for absolute URLs in the page).
ENV NG_TRUST_PROXY_HEADERS=x-forwarded-proto
WORKDIR /app
COPY --from=build /app/dist/menuly/server ./server
USER node
EXPOSE 4000
CMD ["node", "--max-old-space-size=128", "server/server.mjs"]

FROM nginx:1.31-alpine
# Where /api/ is proxied to; the compose service name by default.
ENV API_UPSTREAM=http://api:8080
# Where tenant-subdomain pages are rendered (the `ssr` image).
ENV SSR_UPSTREAM=http://web-ssr:4000
# Domain tenant subdomains hang off, e.g. 1.2.3.4.nip.io. Empty: menuly.app (and *.localhost).
ENV BASE_DOMAIN=
COPY nginx/menuly.envsh /docker-entrypoint.d/15-menuly.envsh
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY nginx/menuly/common.inc.template /etc/nginx/templates/menuly/common.inc.template
# The stock welcome page would answer `/`; the app's shell is index.csr.html.
RUN rm /usr/share/nginx/html/index.html
COPY --from=build /app/dist/menuly/browser /usr/share/nginx/html
EXPOSE 80
