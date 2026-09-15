FROM node:alpine

WORKDIR /usr/src/app

COPY . .

RUN npm install -g corepack@latest && corepack enable && corepack prepare --activate

RUN pnpm install

CMD ["pnpm", "test"]