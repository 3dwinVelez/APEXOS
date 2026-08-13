FROM node:22-alpine
WORKDIR /app
RUN addgroup -S apex && adduser -S -G apex apex
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_WS_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL
COPY package*.json ./
RUN npm install && chown -R apex:apex /app
COPY . .
RUN npm run build
USER apex
EXPOSE 3001
CMD ["npm", "run", "start"]

