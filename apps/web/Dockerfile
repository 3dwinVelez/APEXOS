FROM node:22-alpine
WORKDIR /app
RUN addgroup -S apex && adduser -S -G apex apex
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_WS_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/types/package.json packages/types/package.json
RUN npm ci && chown -R apex:apex /app
COPY . .
RUN npm --workspace apps/web run build && chown -R apex:apex /app/apps/web/.next
USER apex
EXPOSE 3001
CMD ["npm", "--workspace", "apps/web", "run", "start"]

