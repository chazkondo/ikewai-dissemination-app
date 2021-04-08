import { Component, OnInit, Input, ViewChild, AfterViewInit, ViewChildren, QueryList, ElementRef, Renderer2} from '@angular/core';
import { LeafletModule } from '@asymmetrik/ngx-leaflet';
import { LeafletDrawModule } from '@asymmetrik/ngx-leaflet-draw';
import { Observable, of, BehaviorSubject,throwError, ReplaySubject, Subject } from 'rxjs';
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
import { ActivatedRoute } from "@angular/router";
import { environment } from '../../environments/environment';

@Component({
  selector: 'app-data-view',
  templateUrl: './data-view.component.html',
  styleUrls: ['./data-view.component.css']
})
export class DataViewComponent implements OnInit {
  @Input() public dd:string;

  static readonly DEFAULT_RESULTS = 10;

  @ViewChildren("entries") entries: QueryList<ElementRef>;

  highlightEntries: ElementRef[] = [];
  base_url : String;
  metadata: Metadata[];
  filterData: Metadata[];
  selectedMetadata: Metadata;
  assoc_metadata: Metadata[];
  assoc_locations: Metadata[];
  assoc_variables: Metadata[];
  selectedAssocMetadata: Metadata[];
  selectedVariable: Metadata;
  show_var_modal: boolean;
  currentUser: User;
  result: Array<Object>;

  defaultFilterSource: Observable<Metadata[]>;
  defaultFilterHandle: FilterHandle;


  map: L.Map;

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
    zoom: 6,
    center: latLng(20.5, -157.917480),
    attributionControl: false
  };

  drawnItems: L.FeatureGroup = new L.FeatureGroup;

  drawOptions = {
    position: 'topleft',
    draw: {
      polyline: false,
      rectangle: false,
      polygon: false,
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

    this.mapLoaded = true;


    //this.metadata =[];
    this.map = map;

    /*let legendControl: L.Control = new L.Control({position: "bottomleft"});
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
    */
    let iconCreateFunction = (group: string): (cluster: any) => L.DivIcon => {
      return (cluster: any) => {
        console.log(cluster);
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
        return new L.DivIcon({
          html: '<div><span>' + childCount + '</span></div>',
          className: markerClass,
          iconSize: [32, 32],
          iconAnchor: [16, 16]
        });
      }
    };

    this.dataGroups = {
      sites: L.markerClusterGroup({
        singleMarkerMode: false,
        iconCreateFunction: iconCreateFunction("sites")
      }),
      wells: L.markerClusterGroup({
        singleMarkerMode: false,
        iconCreateFunction: iconCreateFunction("wells")
      }),
      waterQualitySites: L.markerClusterGroup({
        singleMarkerMode: false,
        iconCreateFunction: iconCreateFunction("waterQualitySites")
      })
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

    let bounds = null;
    let cancelMove = false;
    let cancelMoveF = () => {
      cancelMove = true;
      map.off("zoomstart", cancelMoveF);
      map.off("movestart", cancelMoveF);
    }
    map.on("zoomstart", cancelMoveF);
    map.on("movestart", cancelMoveF);
    this.datastream.subscribe((datum: Metadata) => {
      let geojson = this.handleMetadata(datum);
      if(geojson !== null) {
        if(bounds) {
          bounds.extend(geojson.getBounds());
        }
        else {
          bounds = geojson.getBounds();
        }

      }
    }, () => {}, () => {
      if(bounds && !cancelMove) {
        this.map.flyToBounds(bounds);
      }

    });
    //push all preloaded data to the main datastream for handling
    this.datastreamPreload.subscribe((metadata: Metadata) => {
      //datastream was completed during preload if null tail, complete datastream
      if(metadata === null) {
        this.datastream.complete();
      }
      //otherwise push next item
      else {
        this.datastream.next(metadata);
      }

    });
    //reset preload datastream
    this.datastreamPreload.complete();
    this.datastreamPreload = new ReplaySubject<Metadata>();
  }


  handleMetadata(datum: Metadata): L.GeoJSON {
    console.log(datum)
    let geojson: L.GeoJSON = null;
    if(datum.name == 'Site' || datum.name == 'Well' || datum.name == 'Water_Quality_Site') {
      this.assoc_locations.push(datum)
      let group = NameGroupMap[datum.name];
      geojson = L.geoJSON(datum.value.loc, {
        style: this.getStyleByGroup(group),
        pointToLayer: (feature, latlng) => {
          let icon = this.getIconByGroup(group);
          return L.marker(latlng, {icon: icon});
        },
        onEachFeature: (feature, layer) => {



          console.log(feature);
          let header = L.DomUtil.create("h6");
          let wrapper = L.DomUtil.create("div");
          let details = L.DomUtil.create("div");
          let location = L.DomUtil.create("div");
          let download = L.DomUtil.create("div");
          //cast to any, weird typing error
          if(<any>feature.type == "Point") {
            location.innerHTML = "Latitude: " + datum.value.latitude + "<br/>Longitude: " + datum.value.longitude;
          }
          else {
            let bounds = L.geoJSON(feature).getBounds();
            location.innerHTML = "Location Boundary:";
            location.innerHTML += "<br/>North: " + bounds.getNorth();
            location.innerHTML += "<br/>East: " + bounds.getEast();
            location.innerHTML += "<br/>South: " + bounds.getSouth();
            location.innerHTML += "<br/>West: " + bounds.getWest();
          }


          // let goto = L.DomUtil.create("span", "entry-link");

          //details.innerText = JSON.stringify(datum.value);
          header.innerText=datum.name.replace(/_/g, ' ');
          if(datum.name == "Water_Quality_Site" || datum.name == "Site") {
            //assume all have a name
            details.innerHTML = "Name: " + datum.value.name;
            if(datum.value.MonitoringLocationIdentifier) {
              details.innerHTML += "<br/>ID: " + datum.value.MonitoringLocationIdentifier;
            }
            if(datum.value.ProviderName) {
              details.innerHTML += "<br/>Provider: " + datum.value.ProviderName;
            }
            if(datum.value.description) {
              details.innerHTML += "<br/>Description: " + datum.value.description;
            }
            //latitude longitude should always be there
            // details.innerHTML += "<br/>Latitude: " + datum.value.latitude + "<br/>Longitude: " + datum.value.longitude;
            if(datum.value.siteUrl) {
              details.innerHTML += "<br/><a target='_blank' href='" + datum.value.siteUrl + "'>More Details</a>";
            }

            if(datum.value.resultCount && datum.value.resultCount > 0) {
              download.innerHTML = "<br/><a class='btn btn-success' href='https://www.waterqualitydata.us/Result/search?siteid=" + datum.value.MonitoringLocationIdentifier + "&mimeType=csv&zip=yes&sorted=no' target='_blank' > Download " + datum.value.resultCount + " Measurements</a>"
            }
          }
          if(datum.name == "Well") {
            details.innerHTML = "Name: " + datum.value.well_name
            if(datum.value.wid) {
              details.innerHTML += "<br/>ID: " + datum.value.wid;
            }
            if(datum.value.use) {
              details.innerHTML += "<br/>Use: " + datum.value.use;
            }
            if(datum.value.driller) {
              details.innerHTML += "<br/>Driller: " + datum.value.driller;
            }
            if(datum.value.yr_drilled) {
              details.innerHTML += "<br/>Year Drilled: " + datum.value.yr_drilled;
            }
            if(datum.value.surveyor) {
              details.innerHTML += "<br/>Surveyor: " + datum.value.surveyor;
            }
            if(datum.value.casing_dia) {
              details.innerHTML += "<br/>Casing Diameter: " + datum.value.casing_dia;
            }
            if(datum.value.well_depth) {
              details.innerHTML += "<br/>Depth: " + datum.value.well_depth;
            }
            // details.innerHTML += "<br/>Latitude: " + datum.value.latitude;
            // details.innerHTML += "<br/>Longitude: " + datum.value.longitude;

            for(let i = 0; i < datum._links.associationIds.length; i++) {
              if(datum._links.associationIds[i].href.indexOf('ikewai-annotated') !== -1) {
                download.innerHTML ='<a href="javascript:void(0);" class="btn btn-success" (click)="downloadClick(\''+datum._links.associationIds[i].href+'\')">Download '+datum._links.associationIds[i].href.split('/').slice(-1)[0]+'</a>'
              }
            }
          }
          // goto.innerText = "Go to Entry";

          let popup: L.Popup = new L.Popup();
          wrapper.append(header);
          wrapper.append(details);
          wrapper.append(location);
          wrapper.append(download);
          // wrapper.append(goto);
          //console.log(wrapper);

          //let linkDiv = wrapper.getElementsByClassName("entry-link");

          // let gotoWrapper = () => {
          //   console.log("click");
          //   //this.gotoEntry(index);
          // }
          // linkDiv[0].addEventListener("click", gotoWrapper);
          popup.setContent(wrapper);
          layer.bindPopup(popup);



          if(this.dataGroups[group] != undefined) {
            this.dataGroups[group].addLayer(layer);
          }
        }
      });

    }
    if(datum.name == 'Variable'){
      this.assoc_variables.push(datum)
    }
    return geojson
    //     this.assoc_metadata.push(datum)
    //     this.selectedAssocMetadata = this.assoc_metadata;
  }


  constructor(private renderer: Renderer2, private queryHandler: QueryHandlerService, private filters: FilterManagerService, private http: HttpClient,private route: ActivatedRoute) {
    //currentUser: localStorage.getItem('currentUser');


  }

  mapLoaded = false;
  datastreamPreload: ReplaySubject<Metadata> = new ReplaySubject<Metadata>();
  datastream: Subject<Metadata> = new Subject<Metadata>();
  selectDataDescriptor(data_descriptor) {
    //reset everything
    //easiest to just deselect and flush event loop to destroy and reinit map

    this.deselectDataDescriptor();
    setTimeout(() => {
      console.log(data_descriptor);
      this.selectedMetadata = data_descriptor;
      //reset any drawn items
      this.drawnItems.clearLayers();

      let datastream: QueryController = this.queryHandler.fetchAssociateMetadata(data_descriptor.uuid, data_descriptor.associationIds);
      datastream.getQueryObserver().subscribe((response: QueryResponse) => {
        console.log("got data!");
        console.log(response);
        //if no initial data will yield null response
        if(!response) {
          return;
        }
        let data: Metadata[] = response.data;
        //data;
        if(data == null) {
          return;
        }
        this.selectedAssocMetadata = data;
        this.assoc_locations = [];
        this.assoc_variables = [];

        // let iconCreateFunction = (group: string): (cluster: any) => L.DivIcon => {

        //   return (cluster: any) => {
        //     let childCount = cluster.getChildCount();
        //     let markerClass = "marker-cluster ";
        //     let clusterSize = "marker-cluster-";
        //     if(childCount < 10) {
        //       clusterSize += "small";
        //     }
        //     else if(childCount < 100) {
        //       clusterSize += "medium";
        //     }
        //     else {
        //       clusterSize += "large";
        //     }
        //     markerClass += clusterSize + "-" + group;

        //     return new L.DivIcon({ html: '<div><span>' + childCount + '</span></div>',
        //     className: markerClass, iconSize: new L.Point(40, 40)});
        //   }
        // };

        // this.dataGroups = {
        //   sites: L.markerClusterGroup({iconCreateFunction: iconCreateFunction("sites")}),
        //   wells: L.markerClusterGroup({iconCreateFunction: iconCreateFunction("wells")}),
        //   waterQualitySites: L.markerClusterGroup({iconCreateFunction: iconCreateFunction("waterQualitySites")})
        // };
        Object.keys(this.dataGroups).forEach((key) => {
          let dataGroup = this.dataGroups[key];
          dataGroup.clearLayers();
        });
        console.log(data);
        for(let metadata of data) {
          if(this.mapLoaded) {
            //push metadata to datastream
            this.datastream.next(metadata);
          }
          else {
            //push metadata to preload data stream
            this.datastreamPreload.next(metadata);
          }

        }
      }, () => {}, () => {
        if(this.mapLoaded) {
          //push metadata to datastream
          this.datastream.complete();
          //if (this.route.snapshot.queryParams['dd'] == data_descriptor.uuid) {
            //document.getElementById(data_descriptor.uuid).click();
          //}
        }
        else {
          this.datastreamPreload.next(null);
        }
      });

      //this.selectedAssocMetadata = assoc_metadata
    }, 0);

  }


  deselectDataDescriptor(){
    this.selectedMetadata = null;
    //cleanup resources and signal map not loaded
    this.mapLoaded = false;
    this.datastream.complete();
    this.datastream = new Subject<Metadata>();
  }

  downloadClick(metadatum_href){
      this.createPostit(metadatum_href).subscribe(result => {
        this.result =result
        console.log(result.body.result._links.self.href)
        window.open(result.body.result._links.self.href, "_blank");

      })

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
    }
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

ngAfterViewInit() {
  //this.map = this.mapElement.nativeElement

}



ngOnInit() {
  //should change this to get observable from filter manager
  //this.queryHandler.initFilterListener(this.filters.filterMonitor);
  this.defaultFilterHandle = this.filters.registerFilter();
  this.initSearch();
  this.assoc_metadata=[];
  this.assoc_locations=[];
  this.assoc_variables=[];
  //console.log(this.route.snapshot.queryParams['dd']);
  console.log(this.dd)
  this.show_var_modal = false;
  this.base_url = environment.baseUrl;

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

public initSearch() {

  // tslint:disable-next-line:no-console

  this.metadata= [];

  let dataStream: QueryController = this.queryHandler.allSearch();
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

  dataStream.getQueryObserver().subscribe((response: QueryResponse) => {
    //if no initial data will yield null response
    if(!response) {
      return;
    }
    let data = response.data;
    //data;

    if(data == null) {
      return;
    }
    //console.log(data);



    let indices = Object.keys(data);
    let i: number;
    for(i = 0; i < indices.length; i++) {
      let index = Number(indices[i]);
      let datum = data[index];
    //  if((datum.name=="Water_Quality_Site" && datum.value.resultCount > 0)) || datum._links.associationIds.length > 0){
        this.metadata.push(datum)
        if (this.dd == datum.uuid) {
          //console.log(datum.uuid.toString())
          //document.getElementById(datum.uuid.toString()).click();
          this.selectDataDescriptor(datum)
        }
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
            if(datum.name == "Water_Quality_Site"){
              details.innerHTML = "<br/>Name: "+datum.value.name+"<br/>ID: "+datum.value.MonitoringLocationIdentifier+"<br/>Provider: "+datum.value.ProviderName+"<br/>"+datum.value.description+"<br/>Latitude: "+datum.value.latitude+"<br/>Longitude: "+datum.value.longitude+"<br/><a target='_blank' href='"+datum.value.siteUrl+"'>More Details</a>";
              if(datum.value.resultCount > 0){
                download.innerHTML = "<br/><a class='btn btn-success' href='https://www.waterqualitydata.us/Result/search?siteid="+datum.value.MonitoringLocationIdentifier+"&mimeType=csv&zip=yes&sorted=no' target='_blank' > Download "+datum.value.resultCount+" Measurements</a></br>"
              }
            }
            if(datum.name == "Well") {
              details.innerHTML = "<br/>Name: "+datum.value.well_name+"<br/>ID: "+datum.value.wid+"<br/>Use: "+datum.value.use+"<br/>Driller: "+datum.value.driller+"<br/>Year Drilled: "+datum.value.yr_drilled+"<br/>Surveyor: "+datum.value.surveyor+"<br/>Casing Diameter: "+datum.value.casing_dia+"<br/>Depth: "+datum.value.well_depth+"<br/>Latitude: "+datum.value.latitude+"<br/>Longitude: "+datum.value.longitude;

              let j:number;
              for(j = 0; j < datum._links.associationIds.length; j++) {
                if(datum._links.associationIds[j].href.indexOf('ikewai-annotated')!== -1){
                //  download.innerHTML ='<a href="javascript:void(0);" class="btn btn-success" (click)="downloadClick(\''+datum._links.associationIds[j].href+'\')">Download '+datum._links.associationIds[j].href.split('/').slice(-1)[0]+'</a>'
                }
              }
            }
            //goto.innerText = "Go to Entry";

            let popup: L.Popup = new L.Popup();
            wrapper.append(header)
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

  dataStream.getQueryObserver().subscribe((response: QueryResponse) => {
    //if no initial data will yield null response
    if(!response) {
      return;
    }
    let data = response.data;
    //data;

    if(data == null) {
      return;
    }
    //console.log(data);



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
            if(datum.name == "Water_Quality_Site"){
              details.innerHTML = "<br/>Name: "+datum.value.name+"<br/>ID: "+datum.value.MonitoringLocationIdentifier+"<br/>Provider: "+datum.value.ProviderName+"<br/>"+datum.value.description+"<br/>Latitude: "+datum.value.latitude+"<br/>Longitude: "+datum.value.longitude+"<br/><a target='_blank' href='"+datum.value.siteUrl+"'>More Details</a>";
              if(datum.value.resultCount > 0){
                download.innerHTML = "<br/><a class='btn btn-success' href='https://www.waterqualitydata.us/Result/search?siteid="+datum.value.MonitoringLocationIdentifier+"&mimeType=csv&zip=yes&sorted=no' target='_blank' > Download "+datum.value.resultCount+" Measurements</a></br>"
              }
            }
            if(datum.name == "Well"){
              details.innerHTML = "<br/>Name: "+datum.value.well_name+"<br/>ID: "+datum.value.wid+"<br/>Use: "+datum.value.use+"<br/>Driller: "+datum.value.driller+"<br/>Year Drilled: "+datum.value.yr_drilled+"<br/>Surveyor: "+datum.value.surveyor+"<br/>Casing Diameter: "+datum.value.casing_dia+"<br/>Depth: "+datum.value.well_depth+"<br/>Latitude: "+datum.value.latitude+"<br/>Longitude: "+datum.value.longitude;

              let j:number;
              for(j = 0; j < datum._links.associationIds.length; j++) {
                if(datum._links.associationIds[j].href.indexOf('ikewai-annotated')!== -1){
                //  download.innerHTML ='<a href="javascript:void(0);" class="btn btn-success" (click)="downloadClick(\''+datum._links.associationIds[j].href+'\')">Download '+datum._links.associationIds[j].href.split('/').slice(-1)[0]+'</a>'
                }
              }
            }
            //goto.innerText = "Go to Entry";

            let popup: L.Popup = new L.Popup();
            wrapper.append(header)
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


downloadSelectedMetadata(format) {
  var element = document.createElement('a');
  var jsonobj = {}
  jsonobj = this.selectedMetadata.value
  jsonobj['uuid'] = this.selectedMetadata.uuid
  jsonobj['files'] = []
  this.selectedMetadata._links.associationIds.filter(assoc =>{
    if (assoc.title == 'file'){
      if (assoc.href.includes('ikewai-annotated-data')){
        jsonobj['files'].push(assoc.href.replace('media','download/public'))
      }
    }
  })
  var location_array = []
  this.assoc_locations.filter(location => {
    location_array.push(location.value)
  })
  jsonobj['locations']=location_array
  var var_array = []
  this.assoc_variables.filter(variable => {
    var_array.push(variable.value)
  })
  jsonobj['variables'] = var_array
  if (format == 'JSON'){
    element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(JSON.stringify(jsonobj, null, ' ')));
    element.setAttribute('download', 'metadata.json');
  }
  else{
    element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(jsonobj.toString()));
    element.setAttribute('download', 'metadata.txt');
  }

  element.style.display = 'none';
  element.target = '_blank'
  document.body.appendChild(element);

  element.click();

  document.body.removeChild(element);
}

closeVarInfo(){
  this.show_var_modal = false
}

showVariableInfo(new_var){
  //var element = document.getElementById('var-content');
  //element.innerHTML  = "hello"
  //document.getElementById('varModal').hidden = false;
  this.show_var_modal = true
  this.selectedVariable = new_var
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
        // iconRetinaUrl: 'assets/markers/marker-icon-2x-green.png',
        shadowUrl: "assets/marker-shadow.png",
        iconSize: [20, 32],
        iconAnchor: [10, 32]

      });
      break;
    }
    case "sites": {
      icon = new L.Icon({
        iconUrl: 'assets/markers/marker-icon-red.png',
        // iconRetinaUrl: 'assets/markers/marker-icon-2x-red.png',
        shadowUrl: "assets/marker-shadow.png",
        iconSize: [20, 32],
        iconAnchor: [10, 32]
      });
      break;
    }
    case "wells": {
      icon = new L.Icon({
        iconUrl: 'assets/marker-icon.png',
        // iconRetinaUrl: 'assets/marker-icon-2x.png',
        shadowUrl: "assets/marker-shadow.png",
        iconSize: [20, 32],
        iconAnchor: [10, 32]
      });
      break;
    }
  }
  return icon;
}



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
