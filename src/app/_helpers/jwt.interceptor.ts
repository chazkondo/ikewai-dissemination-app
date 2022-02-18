import { Injectable } from '@angular/core';
import { HttpRequest, HttpHandler, HttpEvent, HttpInterceptor } from '@angular/common/http';
import { Observable } from 'rxjs';

import { AuthenticationService } from '../_services/authentication.service';

@Injectable()
export class JwtInterceptor implements HttpInterceptor {
    constructor(private authenticationService: AuthenticationService) { }

    intercept(request: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
        // add authorization header with jwt token if available
        //let currentUser = this.authenticationService.currentUserValue;
        //if (AppConfig.settings.aad.accessToken) {
            request = request.clone({
                setHeaders: {
                    Authorization: `Bearer a448d5376b956dcc5589516ddefcf7bc`
                }
            });
      //  }

        return next.handle(request);
    }
}
