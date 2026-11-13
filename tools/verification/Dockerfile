ARG BASE_IMAGE
FROM ${BASE_IMAGE}
ENV COREPACK_HOME=/opt/corepack
WORKDIR /opt/deps
COPY . .
RUN corepack enable && corepack prepare pnpm@11.13.1 --activate \
    && pnpm install --frozen-lockfile --ignore-scripts
RUN --network=none pnpm rebuild \
    && chmod -R a+rX /opt/deps /opt/corepack
USER 1000:1000
ENTRYPOINT ["node", "/source/tree/tools/verification/inside.mjs"]
