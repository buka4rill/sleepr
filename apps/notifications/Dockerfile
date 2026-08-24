FROM node:alpine AS development

WORKDIR /usr/src/app

COPY package.json ./
COPY pnpm-lock.yaml ./
COPY pnpm-workspace.yaml ./
COPY tsconfig.json tsconfig.json
COPY nest-cli.json nest-cli.json

RUN npm install -g corepack@latest && corepack enable && corepack prepare --activate

COPY apps/notifications apps/notifications
COPY libs libs

RUN pnpm install -r

RUN pnpm run build notifications

FROM node:alpine AS production

ARG NODE_ENV=production
ENV NODE_ENV=${NODE_ENV}

WORKDIR /usr/src/app

COPY package.json ./
COPY pnpm-lock.yaml ./
COPY pnpm-workspace.yaml ./
COPY apps/notifications/package.json apps/notifications/package.json
COPY libs/common/package.json libs/common/package.json

RUN npm install -g corepack@latest && corepack enable && corepack prepare --activate

RUN pnpm install --prod --filter sleepr --filter notifications...

COPY --from=development /usr/src/app/dist ./dist

CMD ["node", "dist/apps/notifications/main"]