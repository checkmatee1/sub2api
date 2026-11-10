# Pinned upstream source and archive digest; local patches are fail-closed.
FROM oven/bun:1.2.19-alpine AS build
WORKDIR /app
ADD --checksum=sha256:60a3ec892e9b1d314f69b7e7df2e17e715099789d7d69cc6ce7612b8b77b2436 https://codeload.github.com/ericc-ch/copilot-api/tar.gz/0ea08febdd7e3e055b03dd298bf57e669500b5c1 /tmp/copilot-api.tar.gz
RUN tar -xzf /tmp/copilot-api.tar.gz --strip-components=1 -C /app && rm /tmp/copilot-api.tar.gz
COPY harden.mjs /tmp/harden.mjs
COPY responses.ts /app/src/routes/responses/route.ts
RUN bun /tmp/harden.mjs && bun install --frozen-lockfile --ignore-scripts && bun run build

FROM oven/bun:1.2.19-alpine
WORKDIR /app
COPY --from=build /app/package.json /app/bun.lock ./
RUN bun install --frozen-lockfile --production --ignore-scripts --no-cache
COPY --from=build /app/dist ./dist
COPY --from=build /app/LICENSE ./COPILOT_API_LICENSE
ENV NODE_ENV=production
EXPOSE 4141
ENTRYPOINT ["bun", "run", "dist/main.js"]
