FROM node:22.23.5-bookworm-slim@sha256:e9f565d32859f0cbfb52125eafe8be39390f24dac302dc3cdf566e8ba3ab21ee
WORKDIR /app
COPY --chown=node:node frontend-server.mjs ./
COPY --chown=node:node dist/ ./dist/
USER node
EXPOSE 8080
CMD ["node", "frontend-server.mjs"]
