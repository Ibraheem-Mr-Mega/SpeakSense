FROM node:24-bookworm-slim
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates dbus-daemon dbus-bin gnome-keyring tini \
    && rm -rf /var/lib/apt/lists/* \
    && rm -f /etc/machine-id /var/lib/dbus/machine-id \
    && ln -s /home/node/.machine-id /etc/machine-id
WORKDIR /app/native/presage
RUN npm install --global pnpm@11.25.0
COPY native/presage/package.json native/presage/pnpm-lock.yaml native/presage/pnpm-workspace.yaml ./
RUN pnpm install --prod --frozen-lockfile
COPY --chown=node:node native/presage/server.mjs native/presage/service.mjs ./
COPY --chown=node:node lib/camera/metrics.ts /app/lib/camera/metrics.ts
COPY --chown=node:node --chmod=755 native/presage/entrypoint.sh ./
USER node
ENV CAMERA_HOSTED=true PORT=8789
EXPOSE 8789
ENTRYPOINT ["tini", "-g", "--", "/app/native/presage/entrypoint.sh"]
CMD ["node", "server.mjs"]
