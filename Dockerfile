FROM node:22-alpine
WORKDIR /app
COPY agent.js package.json ./
ENV PORT=8080
EXPOSE 8080
CMD ["node", "agent.js"]
