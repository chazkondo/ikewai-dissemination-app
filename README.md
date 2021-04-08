# Ike Wai Dataset Web Component


To setup you have to determine where the bundle will be deployed then modify the environments/environment.prod.ts file and update the location of the baseUlr and assetBaseUrl to point to the locations it will be deployed

To build use:
```
ng build --prod --output-hashing=none
```

Then concatenate files into a single .js file if desired (otherwise you have to include them each)
```
cat dist/ng-agave-login/{polyfills,runtime,main}.js > custom-element.js
```

Copy the dist/ng-agave-login folder contents to the deployment location on the server


In the webpage you want to embed this component you add:
```
<link rel="stylesheet" href="/deploymentPath/styles.css">
<link href="https://stackpath.bootstrapcdn.com/font-awesome/4.7.0/css/font-awesome.min.css" rel="stylesheet">
<app-dataview dd="CHANGE TO ID OF DATA DESCRIPTOR DATASET"></app-dataview>
<script src="/wp-content/ddViewer/custom-element.js"></script>
```

NOTE the sytle.css path needs to match you deployment (you might also add this to the head of the page or overall application) the "app-dataview" html component needs the "dd" property updated to whichever data descriptor dataset uuid you want to render.


## Development with Docker

Build

```
docker build -t ikebrowse .
```

Then you can run using:
```
docker run -p 4200:4200 --name browse ikebrowse ng serve --host=0.0.0.0
```
note the serve command and "host" parameter

If you want to serve latest code repo without rebuilding you can use something like:

```
docker run -p 4200:4200 --name browse -v fullpath/to/src:/app/src ikebrowse ng serve --host=0.0.0.0
```

for production build you can createa  "dist" directory and mount it in the container and build:
```
docker run -p 4200:4200 --name browse -v fullpath/to/src:/app/src -v fullpath/to/dist:/app/dist ikebrowse ng build --prod
```


## Development server without Docker

Run `ng serve` for a dev server. Navigate to `http://localhost:4200/`. The app will automatically reload if you change any of the source files.




## Code scaffolding

Run `ng generate component component-name` to generate a new component. You can also use `ng generate directive|pipe|service|class|guard|interface|enum|module`.

## Build

Run `ng build` to build the project. The build artifacts will be stored in the `dist/` directory. Use the `--prod` flag for a production build.

## Running unit tests

Run `ng test` to execute the unit tests via [Karma](https://karma-runner.github.io).

## Running end-to-end tests

Run `ng e2e` to execute the end-to-end tests via [Protractor](http://www.protractortest.org/).

## Further help

To get more help on the Angular CLI use `ng help` or go check out the [Angular CLI README](https://github.com/angular/angular-cli/blob/master/README.md).
