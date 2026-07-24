FROM node:22-bookworm-slim
WORKDIR /app
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd -r apex && useradd -r -g apex -m -d /home/apex apex \
  && chown -R apex:apex /app
COPY package*.json ./
RUN npm install --omit=dev && chown -R apex:apex /app/node_modules
COPY . .
RUN npx prisma generate
USER apex
EXPOSE 3000
CMD ["node", "server.js"]

