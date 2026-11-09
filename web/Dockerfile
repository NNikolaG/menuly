# syntax=docker/dockerfile:1

# The build output is plain static files, so it is built once on the CI
# machine's platform and copied into each architecture's nginx image.
FROM --platform=$BUILDPLATFORM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
# Where /api/ is proxied to; the compose service name by default.
ENV API_UPSTREAM=http://api:8080
# Domain tenant subdomains hang off, e.g. 1.2.3.4.nip.io. Empty: menuly.app / localhost.
ENV BASE_DOMAIN=
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist/menuly/browser /usr/share/nginx/html
EXPOSE 80
