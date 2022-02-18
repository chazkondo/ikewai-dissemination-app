import { Component, OnInit, ViewChild, AfterViewInit, ViewChildren, QueryList, ElementRef, Renderer2, SecurityContext } from '@angular/core';
import { LeafletModule } from '@asymmetrik/ngx-leaflet';
import { LeafletDrawModule } from '@asymmetrik/ngx-leaflet-draw';
import { Observable, of, BehaviorSubject,throwError } from 'rxjs';
import { map, retry, catchError } from 'rxjs/operators';
import { User } from '../_models/user'
import { Metadata } from '../_models/metadata'
import { latLng, tileLayer, Marker, icon } from 'leaflet';
import * as L from 'leaflet';
import 'leaflet.markercluster';
//import 'leaflet.pm/dist/leaflet.pm.min.js';
import { AppConfig } from '../_services/config.service';
//import { AuthenticationService } from '../_services/authentication.service';
//import { SpatialService } from '../_services/spatial.service'
import { QueryHandlerService, QueryController, QueryResponse } from '../_services/query-handler.service';
import { FilterHandle, FilterManagerService, Filter, FilterMode } from '../_services/filter-manager.service';
import { mapToExpression } from '@angular/compiler/src/render3/view/util';
import { HttpClient, HttpHeaders, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Subject } from 'rxjs';
import { DomSanitizer } from '@angular/platform-browser';

declare var jQuery: any;

@Component({
  selector: 'app-map',
  templateUrl: './map.component.html',
  styleUrls: ['./map.component.css']
})
export class MapComponent implements OnInit, AfterViewInit {

  dtOptions: DataTables.Settings = {};

  dtTrigger: Subject<any> = new Subject<any>();
  static readonly DEFAULT_RESULTS = 10;

  @ViewChildren("entries") entries: QueryList<ElementRef>;

  highlightEntries: ElementRef[] = [];

  metadata: Metadata[];
  filterData: Metadata[];
  selectedMetadata: Metadata;
  currentUser: User;
  result: Array<Object>;

  defaultFilterSource: Observable<Metadata[]>;
  defaultFilterHandle: FilterHandle;

  map: L.Map;
  mapZoomed: L.Map; // small map for modal screen
  mapZoomedLatLng: any; // tracks the current LatLon for the small map for modal screen
  mapZoomedCircle: any; // tracks the drawn circle on the small map for modal screen 
  
  dataGroups: {
    sites: L.FeatureGroup,
    wells: L.FeatureGroup,
    waterQualitySites: L.FeatureGroup
  }

  options: L.MapOptions = {
    layers: [
      //tileLayer('http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '...' })
      tileLayer('http://www.google.com/maps/vt?lyrs=y@189&gl=en&x={x}&y={y}&z={z}', { maxZoom: 18, attribution: '...' })
    ],
    zoom:10,
    center: latLng(21.48,-157.91040),
    attributionControl: false
  };
      //center: latLng(20.5, -157.917480),

  optionsZoomed: L.MapOptions = {
    layers: [
      tileLayer('http://www.google.com/maps/vt?lyrs=y@189&gl=en&x={x}&y={y}&z={z}', { maxZoom: 18, attribution: '...' })
    ],
    zoom:12,
    center: latLng(21.48,-157.91040),
    attributionControl: false,
    zoomControl: false,
    scrollWheelZoom: false,
    doubleClickZoom: false,
    zoomDelta: 0,
    dragging: false
  };

  drawnItems: L.FeatureGroup = new L.FeatureGroup;

  drawOptions = {
    position: 'topleft',
    draw: {
       polyline: false,
       circle: false,
       marker: false,
       circlemarker: false
    },
    edit: {
      featureGroup: this.drawnItems
    }
  };

  controlOptions = {
    attributionControl: false
  };

  onMapReady(map: L.Map) {
    this.metadata =[];
    this.map = map;

    let legendControl: L.Control = new L.Control({position: "bottomleft"});
    legendControl.onAdd = (map) => {
      let legend = L.DomUtil.create("div", "legend");
      legend.innerHTML = '<div class="grid">'
      +'<div class="bl">Legend</div>'
      +'<div class="ht">Cluster Size</div>'

      +'<div class="s1">2-9</div>'
      +'<div class="s2">10-100</div>'
      +'<div class="s3">100+</div>'
      +'<div class="t1">Wells</div>'


      +'<div class="c1"><div class="color-circle color-1"></div></div>'
      +'<div class="c2"><div class="color-circle color-2"></div></div>'
      +'<div class="c3"><div class="color-circle color-3"></div></div>'

      +'</div>'
      return legend;
    }
    legendControl.addTo(this.map);

    let iconCreateFunction = (group: string): (cluster: any) => L.DivIcon => {

      return (cluster: any) => {
        let childCount = cluster.getChildCount();
        let markerClass = "marker-cluster ";
        let clusterSize = "marker-cluster-"
        if(childCount < 10) {
          clusterSize += "small";
        }
        else if(childCount < 100) {
          clusterSize += "medium";
        }
        else {
          clusterSize += "large";
        }
        markerClass += clusterSize + "-" + group;

        return new L.DivIcon({ html: '<div><span>' + childCount + '</span></div>',
        className: markerClass, iconSize: new L.Point(40, 40)});
      }
    };

    this.dataGroups = {
      sites: L.markerClusterGroup({iconCreateFunction: iconCreateFunction("sites"), disableClusteringAtZoom:4}),
      wells: L.markerClusterGroup({iconCreateFunction: iconCreateFunction("wells"), disableClusteringAtZoom:12}),
      waterQualitySites: L.markerClusterGroup({iconCreateFunction: iconCreateFunction("waterQualitySites")})
    };

    let controlGroups: any = {};

    Object.keys(this.dataGroups).forEach((key) => {
      let dataGroup = this.dataGroups[key];
      dataGroup.addTo(this.map);
      console.log(key);
      controlGroups[GroupLabelMap[key]] = dataGroup;
    });

    L.control.layers(null, controlGroups).addTo(this.map);
    this.drawnItems.addTo(this.map);

    //testing
    // this.defaultFilterSource.subscribe((data: Metadata[]) => {
    //   if(data == null) {
    //     return;
    //   }
    //   let i;
    //   for(i = 0; i < data.length; i++) {
    //     let datum = data[i];
    //     //console.log(datum.value.loc);
    //     let geojson = L.geoJSON(datum.value.loc);
    //     let group = NameGroupMap[datum.name];
    //     console.log(datum.name);
    //     // console.log(this.dataGroups[group]);
    //     this.dataGroups[group].addLayer(geojson);
    //   }
    // });
  }

  onMapZoomedReady(mapZoomed: L.Map) {
    // small map for modal screen
    this.mapZoomed = mapZoomed;
    if (this.mapZoomedLatLng) {
      // if Lat Lon is cached, then the map hasn't been drawn for the clicked on location
      this.drawMapZoomedPoint();
    }
  }

  constructor(private renderer: Renderer2, private queryHandler: QueryHandlerService, private filters: FilterManagerService, private http: HttpClient, private sanitizer: DomSanitizer) {
    //currentUser: localStorage.getItem('currentUser');


  }

  downloadClick(metadatum_href){
    let downloadString = metadatum_href.replace("media","download/public")
    console.log(downloadString)
    window.open(downloadString, "_blank");
  }
  
  createPostit(file_url): Observable<any>{
    let url = AppConfig.settings.aad.tenant + "/postits/v2/?url=" + encodeURI(file_url) + "&method=GET&lifetime=600&maxUses=1";
    let head = new HttpHeaders()
    .set("Content-Type", "application/x-www-form-urlencoded");
    let bodyString = JSON.stringify({});
    let params: HttpParams = new HttpParams()
    .append("method", "POST")
    let options = {
      headers: head,
      observe: <any>"response",
      //params: params
    };
    console.log(url);

    return this.http.post<any>(url,{}, options).pipe(map((response: any) => response))
  }

  tableSearch(term: string) {
    if(!term) {
      this.filterData = this.metadata;
    } else {
      this.filterData = this.metadata.filter(x =>
        {for(var obj in x.value){
          if(x.value[obj] != null){
            if(typeof(x.value[obj]) == "string"){
              if(x.value[obj].trim().toLowerCase().includes(term.trim().toLowerCase())){
                return true;
              }
            }
          }
        }}
      );
      this.dtTrigger.next()
    }
  }

  ngAfterViewInit() {
    //this.map = this.mapElement.nativeElement
    this.findData()
  }


  ngOnInit() {
    this.dtOptions = {
      pagingType: 'full_numbers',
      pageLength: 2
    };
    //should change this to get observable from filter manager
    //this.queryHandler.initFilterListener(this.filters.filterMonitor);
    this.defaultFilterHandle = this.filters.registerFilter();

    //this.findData()
    //console.log(this.defaultFilterHandle);
    //this.defaultFilterSource = this.queryHandler.getFilterObserver(this.defaultFilterHandle);
    // this.defaultFilterSource.subscribe((data: Metadata[]) => {
    //   console.log(data);
    //   //this.testData = data;
    // });
    //set marker images to generated image location to work around 404 bug
    // Marker.prototype.options.icon.options.iconUrl = "assets/markers/marker-icon-red.png";
    // Marker.prototype.options.icon.options.shadowUrl = "assets/marker-shadow.png";
    // Marker.prototype.options.icon.options.iconRetinaUrl = "assets/marker-icon-2x.png";
  }
  public onMove(e: any){

        console.log('Move Event!');
        this.findData()
  }

  public findData() {
    this.metadata= [];
    this.filterData=[];
    let bounds =  this.map.getBounds();//  e.layer.getBounds();
    let box = {
              "type": "Feature",
              "geometry": {
                  "type": "Polygon",
                  "coordinates": [[
                      [bounds.getSouthWest().lng, bounds.getNorthEast().lat],
                      [bounds.getNorthEast().lng, bounds.getNorthEast().lat],
                      [bounds.getNorthEast().lng, bounds.getSouthWest().lat],
                      [bounds.getSouthWest().lng, bounds.getSouthWest().lat],
                      [bounds.getSouthWest().lng, bounds.getNorthEast().lat]
                  ]]
              }
          }
    let customCircleMarker = L.CircleMarker.extend({
         options: {
            datum: {},
         }
      });
      let customMarker = L.Marker.extend({
           options: {
              datum: {},
           }
        });
    console.log(JSON.stringify(box))
    //this.map.fitBounds(bounds);
    Object.keys(this.dataGroups).forEach((key) => {
      let dataGroup = this.dataGroups[key];
      dataGroup.clearLayers();
    });

    let dataStream: QueryController = this.queryHandler.spatialSearch([box]);
    dataStream.getQueryObserver().subscribe((data: any) => {
      data = data.data;
      if(data == null) {
        return;
      }
      let indices = Object.keys(data);
      let i: number;
      for(i = 0; i < indices.length; i++) {
        let index = Number(indices[i]);
        let datum = data[index];
      //  if((datum.name=="Water_Quality_Site" && datum.value.resultCount > 0)) || datum._links.associationIds.length > 0){
          this.metadata.push(datum)
          let group = NameGroupMap[datum.name];
          //console.log(datum.value.loc);
          let geod = datum.value.loc;
          //console.log(geod)
          let prop = {};
          prop['uuid'] = datum.uuid
          geod.properties = prop;
          let geojson = L.geoJSON(geod, {
            style: this.getStyleByGroup(group),
            pointToLayer: (feature, latlng) => {
              let icon = this.getIconByGroup(group);
              return  L.circleMarker(latlng, {radius:5,opacity: 1,fillOpacity: 0.9,color:'gray'})
              //return L.marker(latlng, {icon: icon});
            },
            onEachFeature: (feature, layer) => {
            //  let header = L.DomUtil.create("h6")
              let wrapper = L.DomUtil.create("div")
              let details = L.DomUtil.create("div");
              let download = L.DomUtil.create("div")
              let goto = L.DomUtil.create("span", "entry-link");

              //details.innerText = JSON.stringify(datum.value);
              //header.innerText=datum.name.replace(/_/g, ' ');
              if(datum.name == "Water_Quality_Site" && datum.value.resultCount > 0){
                details.innerHTML = "<br/>Name: "+datum.value.name+"<br/>ID: "+datum.value.MonitoringLocationIdentifier+"<br/>Provider: "+datum.value.ProviderName+"<br/>"+datum.value.description+"<br/>Latitude: "+datum.value.latitude+"<br/>Longitude: "+datum.value.longitude+"<br/><a target='_blank' href='"+datum.value.siteUrl+"'>More Details</a>";

                download.innerHTML = "<br/><a class='btn btn-success' href='https://www.waterqualitydata.us/Result/search?siteid="+datum.value.MonitoringLocationIdentifier+"&mimeType=csv&zip=yes&sorted=no' target='_blank' > Download "+datum.value.resultCount+" Measurements</a></br>"
              }
              if(datum.name == "Well"){
                details.innerHTML = "<br/>Name: "+datum.value.well_name+"<br/>ID: "
                                    +datum.value.wid+"<br/>Use: "+datum.value.use+
                                    '<br/><i>Click point to view more</i>'
                                    //"<br/>Driller: "+datum.value.driller+"<br/>Year Drilled: "
                                    //+datum.value.yr_drilled+"<br/>Surveyor: "+datum.value.surveyor+
                                    //"<br/>Casing Diameter: "+datum.value.casing_dia+"<br/>Depth: "
                                    //+datum.value.well_depth+"<br/>Latitude: "+datum.value.latitude
                                    //+"<br/>Longitude: "+datum.value.longitude+
                                    //'<br/><button class="btn btn-sm btn-primary" type="button" data-bs-toggle="modal" data-bs-target="#location-modal" onclick="document.getElementById('+"'"+datum.uuid+"'"+').click()">View</button>';

                let j:number;
                for(j = 0; j < datum._links.associationIds.length; j++) {
                  if(datum._links.associationIds[j].href.indexOf('ikewai-annotated')!== -1){
                  //  download.innerHTML ='<a href="javascript:void(0);" class="btn btn-success" (click)="downloadClick(\''+datum._links.associationIds[j].href+'\')">Download '+datum._links.associationIds[j].href.split('/').slice(-1)[0]+'</a>'
                  }
                }
              }
              let popup: L.Popup = new L.Popup({autoPan: false});
            //  wrapper.append(header)
              wrapper.append(details);
            //  wrapper.append(download);
            //  wrapper.append(goto);

            //  let linkDiv = wrapper.getElementsByClassName("entry-link");

              let gotoWrapper = () => {
                console.log("click");
                //this.gotoEntry(index);
              }
              //linkDiv[0].addEventListener("click", gotoWrapper);
              popup.setContent(wrapper);
              layer.bindPopup(popup);

              layer.on("mouseover", function () {
                  layer.openPopup();
                });
              layer.on('click',this.markerClick.bind(this));

              // function(){ {
              //   openModalDialog(datum);
              //   console.log(this.selectedMetadata);
              //   (function ($) {
              //       $('#location-dialog').modal('show');
              //       //$('#location-dialog').modal('show');
              //     })(jQuery);
                //document.getElementById('location-modal').style.display = 'block';
                //$("#location-modal").modal('show');
              //}})
              if(this.dataGroups[group] != undefined) {
                this.dataGroups[group].addLayer(layer);
              }
            }

          });
          this.filterData = this.metadata;
          this.dtTrigger.next();
      }
    });
  }
  
  public onDrawCreated(e: any) {

    // tslint:disable-next-line:no-console

    this.metadata= [];
    console.log('Draw Created Event!');
    this.drawnItems.clearLayers();
    this.drawnItems.addLayer(e.layer);
    let bounds = e.layer.getBounds();
    this.map.fitBounds(bounds);
    Object.keys(this.dataGroups).forEach((key) => {
      let dataGroup = this.dataGroups[key];
      dataGroup.clearLayers();
    });

    let dataStream: QueryController = this.queryHandler.spatialSearch([e.layer.toGeoJSON()]);
    //this.queryHandler.requestData(this.defaultFilterHandle, 0, MapComponent.DEFAULT_RESULTS).then((data) => console.log(data));
    // setTimeout(() => {
    //   this.queryHandler.next(this.defaultFilterHandle).then((data) => console.log(data));
    //   setTimeout(() => {
    //     this.queryHandler.previous(this.defaultFilterHandle).then((data) => console.log(data));
    //     this.queryHandler.previous(this.defaultFilterHandle).then((data) => console.log(data));
    //     setTimeout(() => {
    //       this.queryHandler.next(this.defaultFilterHandle).then((data) => console.log(data));
    //       this.queryHandler.next(this.defaultFilterHandle).then((data) => console.log(data));
    //     }, 2000);
    //   }, 2000);
    // }, 2000);

    //this.queryHandler.getDataStreamObserver(this.defaultFilterHandle).subscribe((data: IndexMetadataMap) => {

    dataStream.getQueryObserver().subscribe((data: any) => {
      data = data.data;
      //data;

      if(data == null) {
        return;
      }	  
      // console.log(data);

      let indices = Object.keys(data);
      let i: number;
      for(i = 0; i < indices.length; i++) {
        let index = Number(indices[i]);
        let datum = data[index];
      //  if((datum.name=="Water_Quality_Site" && datum.value.resultCount > 0)) || datum._links.associationIds.length > 0){
          this.metadata.push(datum)
          let group = NameGroupMap[datum.name];
          //console.log(datum.value.loc);
          let geojson = L.geoJSON(datum.value.loc, {
            style: this.getStyleByGroup(group),
            pointToLayer: (feature, latlng) => {
              let icon = this.getIconByGroup(group);
              return L.marker(latlng, {icon: icon});
            },
            onEachFeature: (feature, layer) => {
              let header = L.DomUtil.create("h6")
              let wrapper = L.DomUtil.create("div")
              let details = L.DomUtil.create("div");
              let download = L.DomUtil.create("div")
              let goto = L.DomUtil.create("span", "entry-link");

              //details.innerText = JSON.stringify(datum.value);
              header.innerText=datum.name.replace(/_/g, ' ');
              if(datum.name == "Water_Quality_Site" && datum.value.resultCount > 0){
                details.innerHTML = "<br/>Name: "+datum.value.name+"<br/>ID: "+datum.value.MonitoringLocationIdentifier+"<br/>Provider: "+datum.value.ProviderName+"<br/>"+datum.value.description+"<br/>Latitude: "+datum.value.latitude+"<br/>Longitude: "+datum.value.longitude+"<br/><a target='_blank' href='"+datum.value.siteUrl+"'>More Details</a>";

                download.innerHTML = "<br/><a class='btn btn-success' href='https://www.waterqualitydata.us/Result/search?siteid="+datum.value.MonitoringLocationIdentifier+"&mimeType=csv&zip=yes&sorted=no' target='_blank' > Download "+datum.value.resultCount+" Measurements</a></br>"
              }
              if(datum.name == "Well"){
                details.innerHTML = "<br/>Name: "+datum.value.well_name+"<br/>ID: "
                                    +datum.value.wid+"<br/>Use: "+datum.value.use+
                                    "<br/>Driller: "+datum.value.driller+"<br/>Year Drilled: "
                                    +datum.value.yr_drilled+"<br/>Surveyor: "+datum.value.surveyor+
                                    "<br/>Casing Diameter: "+datum.value.casing_dia+"<br/>Depth: "
                                    +datum.value.well_depth+"<br/>Latitude: "+datum.value.latitude
                                    +"<br/>Longitude: "+datum.value.longitude+
                                    '<br/><button class="btn btn-primary" type="button" data-bs-toggle="modal" data-bs-target="#location-modal" (click)="openModalDialog('+datum+')">View</button>';

                let j:number;
                for(j = 0; j < datum._links.associationIds.length; j++) {
                  if(datum._links.associationIds[j].href.indexOf('ikewai-annotated')!== -1){
                  //  download.innerHTML ='<a href="javascript:void(0);" class="btn btn-success" (click)="downloadClick(\''+datum._links.associationIds[j].href+'\')">Download '+datum._links.associationIds[j].href.split('/').slice(-1)[0]+'</a>'
                  }
                }
              }
              //goto.innerText = "Go to Entry";

              let popup: L.Popup = new L.Popup();
            //  wrapper.append(header)
              wrapper.append(details);
              wrapper.append(download);
              wrapper.append(goto);

              let linkDiv = wrapper.getElementsByClassName("entry-link");

              let gotoWrapper = () => {
                console.log("click");
                //this.gotoEntry(index);
              }
              linkDiv[0].addEventListener("click", gotoWrapper);
              popup.setContent(wrapper);
              layer.bindPopup(popup);
              if(this.dataGroups[group] != undefined) {
                this.dataGroups[group].addLayer(layer);
              }
            }

          });
          this.filterData = this.metadata;
          //

          //console.log(datum.name);
          // console.log(this.dataGroups[group]);
          //console.log(geojson);

//        }
      }
    });

    // setTimeout(() => {
    //   dataStream.cancel();
    // }, 2000);


  }

  getStyleByGroup(group: string): L.PathOptions {
    let style: L.PathOptions;
    switch(group) {
      case "waterQualitySites": {
        style = {
          "color": "#238B45",
          "weight": 3,
          "opacity": 0.3
        };
        break;
      }
      case "sites": {
        style = {
          "color": "#CB181D",
          "weight": 3,
          "opacity": 0.3
        };
        break;
      }
      case "wells": {
        style = {
          "color": "#2171B5",
          "weight": 3,
          "opacity": 0.3
        };
        break;
      }
    }
    return style;
  }

  private getIconByGroup(group: string): L.Icon {
    let icon: L.Icon;
    switch(group) {
      case "waterQualitySites": {
        icon = new L.Icon({
          iconUrl: 'assets/markers/marker-icon-green.png',
          iconRetinaUrl: 'assets/markers/marker-icon-2x-green.png',
          shadowUrl: "assets/marker-shadow.png"
        });
        break;
      }
      case "sites": {
        icon = new L.Icon({
          iconUrl: 'assets/markers/marker-icon-red.png',
          iconRetinaUrl: 'assets/markers/marker-icon-2x-red.png',
          shadowUrl: "assets/marker-shadow.png"
        });
        break;
      }
      case "wells": {
        icon = new L.Icon({
          iconUrl: 'assets/marker-icon.png',
          iconRetinaUrl: 'assets/marker-icon-2x.png',
          //shadowUrl: "assets/marker-shadow.png",
          iconSize:[15,25]
        });
        break;
      }
    }
    return icon;
  }


    markerClick(e)  {
      console.log("Marker CLICKed")
      console.log(e)
      let datum = e.sourceTarget.feature.geometry.properties;
      //console.log(this.selectedMetadata)
      
      document.getElementById('filterField').focus();
      if (!document.getElementById(datum.uuid)) {
      
        // if (document.getElementById('filterField').value) {
        //  document.getElementById('filterField').value = "";
        // }
      
      } else {
        document.getElementById('location-modal').style.display='block';
      }

      if (document.getElementById(datum.uuid)) {
        document.getElementById(datum.uuid).focus();
	    document.getElementById(datum.uuid).click();
      }
    }
	
    openModalDialog(site)  {
      console.log("HEYYYYYYYY")
      console.log(site)
      this.selectedMetadata = site;
      this.openMapZoomed(site); // small map on modal screen
      console.log(this.selectedMetadata)
    }
	
	openLinkedPopup(site) {
      var tempLL = L.latLng([site.value.latitude,site.value.longitude]);
	  let details = L.DomUtil.create("div");
      if (site.name == "Well") {
        details.innerHTML = "<br/>Name: "+site.value.well_name+"<br/>ID: "
                            +site.value.wid+"<br/>Use: "+site.value.use+
                            '<br/><i>Click point to view more</i>';
      }
      L.popup()
        .setLatLng(tempLL)
        .setContent(details)
        .openOn(this.map);
	}
    

    openMapZoomed(site) {
      // cache current Lat Lon. when map is ready it will call drawMapZoomedPoint (onMapZoomedReady())
      this.mapZoomedLatLng = L.latLng([site.value.latitude,site.value.longitude]);
      if (this.mapZoomed) {
        // because small map is on the modal screen, map may not be ready yet. only draw circle if map is ready
        this.drawMapZoomedPoint();
      }
    }
    
    drawMapZoomedPoint() {
      // move to the clicked location and draw a circle
      this.mapZoomed.setView(this.mapZoomedLatLng, 12);
      if (this.mapZoomedCircle) {
        // remove previous circle
        this.mapZoomed.removeLayer(this.mapZoomedCircle);
        this.mapZoomedCircle = null;
      }

      let icon = this.getIconByGroup("wells");
      // this.mapZoomedCircle = L.circleMarker(latlng, {radius:5,opacity: 1,fillOpacity: 0.9,color:'gray'})      
      // this.mapZoomedCircle = L.circle(this.mapZoomedLatLng, {fillOpacity: 1, radius: 100}).addTo(this.mapZoomed);
      this.mapZoomedCircle = L.marker(this.mapZoomedLatLng, {icon}).addTo(this.mapZoomed);

      // remove Lat Lon cache
      this.mapZoomedLatLng = null;
    }

    sanitizeLink(fileLink) {
      var tempDiv = document.getElementById('tempDiv');
      // if it's the same link, no need to sanitize
      if (fileLink != tempDiv.innerHTML) {
        // sanitize the given link. from http://shebang.mintern.net/foolproof-html-escaping-in-javascript/
        tempDiv.innerHTML = "";
        tempDiv.appendChild(document.createTextNode(fileLink));
        fileLink = tempDiv.innerHTML;
      }
      
      // test resource URLs:
      // return this.sanitizer.bypassSecurityTrustResourceUrl('https://view.officeapps.live.com/op/embed.aspx?src=http://www.hawaii.edu/elp/library/librarymaster-author-editor.xls');
      // return this.sanitizer.bypassSecurityTrustResourceUrl('/assets/nsf-logo.png');
      
      // to avoid the error that the text is not sanitized
      return this.sanitizer.bypassSecurityTrustResourceUrl(fileLink);
    }
    
    hideModal():void {
      // this interferes with the small map.
      // this.selectedMetadata = null;
      //$("#location-modal").modal('hide');
    }

  gotoEntry(index: number) {
    //event.stopPropagation();
    // this.queryHandler.requestData(this.defaultFilterHandle, index).then((range: [number, number]) => {
    //   //yield control to allow observable to update entry list
    //   setTimeout(() => {
    //     // console.log(index);
    //     // console.log(range);
    //     //determine position of data on page
    //     let entriesArr = this.entries.toArray();
    //     console.log(entriesArr);
    //     let pos = index - range[0];
    //     //remove highlighting from already highlighted entries
    //     let i;
    //     for(i = 0; i < this.highlightEntries.length; i++) {
    //       this.renderer.removeClass(this.highlightEntries[i].nativeElement, "highlight");
    //     }
    //     //reset list of highlighted entries
    //     this.highlightEntries = [];
    //     this.highlightEntries.push(entriesArr[pos]);
    //     //highlight the selected entry
    //     this.renderer.addClass(entriesArr[pos].nativeElement, "highlight");
    //   }, 0);

    // });
  }

//  spatialSearch(geometry: any){

//     var query = "{'$and':[{'name':'Landuse'},{'value.name':'dataset12042018'},{'value.loc': {$geoWithin: {'$geometry':"+JSON.stringify(geometry.geometry).replace(/"/g,'\'')+"}}}]}";
//     console.log(query)
//     let url = AppConfig.settings.aad.tenant+"/meta/v2/data?q="+encodeURI(query)+"&limit=100000&offset=0";
//        //.set("Authorization", "Bearer " + currentUser.access_token)
//     let head = new HttpHeaders()
//     .set("Content-Type", "application/x-www-form-urlencoded");
//     let options = {
//       headers: head
//     };
// console.log("stuff1")
//     this.http.get<any>(url, options).subscribe(responseData => console.log(responseData.result));
//     /*.pipe(
//      map((data) => {
//        console.log("more")
//        return data.result as Metadata[];
//      }),
//      catchError((e) => {
//        console.log()
//        return Observable.throw(new Error(e.message));
//      })
//    );*/
//    console.log("stuff2")
//    //return response;
//   }

}

enum NameGroupMap {
  Water_Quality_Site = "waterQualitySites",
  Site = "sites",
  Well = "wells"
}

enum GroupLabelMap {
  waterQualitySites = "Water Quality Sites",
  sites = "Sites",
  wells = "Wells"
}
