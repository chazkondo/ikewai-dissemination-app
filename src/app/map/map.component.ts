import { Component, OnInit, ViewChild, AfterViewInit, ViewChildren, QueryList, ElementRef, Renderer2, Input } from '@angular/core';
// import { LeafletModule } from '@asymmetrik/ngx-leaflet';
// import { LeafletDrawModule } from '@asymmetrik/ngx-leaflet-draw';
// import { Observable, of, BehaviorSubject,throwError } from 'rxjs';
// import { map, retry, catchError } from 'rxjs/operators';
// import { User } from '../_models/user'
// import { Metadata } from '../_models/metadata'
// import { latLng, tileLayer, Marker, icon } from 'leaflet';
import * as L from 'leaflet';
import 'leaflet.markercluster';
// //import 'leaflet.pm/dist/leaflet.pm.min.js';
// import { AppConfig } from '../_services/config.service';
// //import { AuthenticationService } from '../_services/authentication.service';
// //import { SpatialService } from '../_services/spatial.service'
// import { QueryHandlerService, QueryController, QueryResponse } from '../_services/query-handler.service';
// import { FilterHandle, FilterManagerService, Filter, FilterMode } from '../_services/filter-manager.service';
// import { mapToExpression } from '@angular/compiler/src/render3/view/util';
// import { HttpClient, HttpHeaders, HttpErrorResponse, HttpParams } from '@angular/common/http';
// import { ActivatedRoute } from "@angular/router";

@Component({
  selector: 'app-map',
  templateUrl: './map.component.html',
  styleUrls: ['./map.component.css']
})
export class MapComponent implements OnInit {

  @Input() mapReadyHandler: (map: L.Map) => void;
  @Input() mapOptions: L.MapOptions;
  @Input() drawOptions: any;

  map: L.Map

  constructor() {}

  ngOnInit(): void {
  }

  onMapReady(map: L.Map): void {
    this.map = map
    this.mapReadyHandler(map);
  }

  ngOnDestroy(): void {
    this.map.remove()
  }

}