FROM node:20-alpine AS build
WORKDIR /app
COPY package.json bun.lock* package-lock.json* ./
RUN npm install --frozen-lockfile || npm install
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 7899
CMD ["nginx", "-g", "daemon off;"]
