FROM node:15.9.0-alpine3.10

WORKDIR /app
RUN npm install -g @angular/cli
COPY ./src /app/src
COPY ./angular.json /app/angular.json
COPY ./tsconfig.json /app/tsconfig.json
COPY ./tslint.json /app/tslint.json
COPY ./package.json /app/package.json
COPY ./package-lock.json /app/package-lock.json

ENV HOST=0.0.0.0
RUN npm install
