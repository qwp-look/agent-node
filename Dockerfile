FROM node:22-alpine
WORKDIR /app
COPY agent.js package.json ./
# infrlo 该应用的路由端口是 5000
ENV PORT=5000
EXPOSE 5000
CMD ["node", "agent.js"]
