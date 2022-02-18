import { BrowserModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { LoginComponent } from './login/login.component';
import { HomeComponent } from './home/home.component';
import { MapComponent } from './map/map.component';

import { JwtInterceptor } from './_helpers/jwt.interceptor';
import { ErrorInterceptor } from './_helpers/error.interceptor';
import { ReactiveFormsModule } from '@angular/forms';
import { HttpClientModule, HTTP_INTERCEPTORS } from '@angular/common/http';
import { APP_INITIALIZER } from '@angular/core';
import { AppConfig } from './_services/config.service';

import { LeafletModule } from '@asymmetrik/ngx-leaflet';
import { LeafletDrawModule } from '@asymmetrik/ngx-leaflet-draw';
import { DataTablesModule } from "angular-datatables";

export function initializeApp(appConfig: AppConfig) {
  return () => appConfig.load();
}


@NgModule({
  declarations: [
    AppComponent,
    LoginComponent,
    HomeComponent,
    MapComponent
  ],
  imports: [
    BrowserModule,
    ReactiveFormsModule,
    HttpClientModule,
    AppRoutingModule,
    LeafletModule.forRoot(),
    LeafletDrawModule.forRoot(),
    DataTablesModule
  ],
  providers: [
      AppConfig,
      { provide: APP_INITIALIZER,
         useFactory: initializeApp,
         deps: [AppConfig], multi: true },
      { provide: HTTP_INTERCEPTORS, useClass: JwtInterceptor, multi: true },
      { provide: HTTP_INTERCEPTORS, useClass: ErrorInterceptor, multi: true },
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }
