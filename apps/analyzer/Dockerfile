FROM node:22-slim

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile

ENV NODE_ENV=production
EXPOSE 8081
CMD ["pnpm", "--filter", "@voxscore/analyzer", "start"]
