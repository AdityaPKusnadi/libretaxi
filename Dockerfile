FROM node:18-alpine

RUN apk add --no-cache \
    libaio \
    wget \
    unzip \
    python3 \
    make \
    g++

RUN mkdir -p /opt/oracle && cd /opt/oracle \
    && wget -q https://download.oracle.com/otn_software/linux/instantclient/2114000/instantclient-basiclite-linux.x64-21.14.0.0.0dbru.zip \
    && unzip instantclient-basiclite-linux.x64-21.14.0.0.0dbru.zip \
    && rm instantclient-basiclite-linux.x64-21.14.0.0.0dbru.zip

ENV LD_LIBRARY_PATH=/opt/oracle/instantclient_21_14

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install --legacy-peer-deps

COPY . .

CMD ["npm", "run", "telegram"]
