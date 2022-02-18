import { Injectable, Output } from '@angular/core';
import { Observable, Subject, BehaviorSubject, merge } from 'rxjs';
import { SpatialService } from './spatial.service';
import { QueryCacheService, DataRange, CacheEntryOptions, InsertData } from './query-cache.service';
import { Metadata } from '../_models/metadata';
import { HttpErrorResponse } from '@angular/common/http';
import { FilterHandle, Filter, FilterManagerService, MonitorEvent, MonitorCase } from './filter-manager.service';
import { takeUntil } from 'rxjs/operators';
//import { HandleGenerator } from "../_models/handleGenerator"

@Injectable({
  providedIn: 'root'
})
export class QueryHandlerService {

  //static readonly DEFAULT_PAGE = 10;
  static readonly MIN_QUERY = 100;
  //limit to half API max, seems to be more responsive if not maxing out
  static readonly MAX_QUERY = 5000;
  static readonly MAX_RESULTS = 100000;

  static readonly ENABLE_FAST_QUERY = true;

  static readonly RAMP_FUNCT = QueryHandlerService.ENABLE_FAST_QUERY ? function *(start: number) {
    let acc = start;
    let size = QueryHandlerService.MIN_QUERY;
    while(acc <= this.MAX_RESULTS) {
      yield size;
      size = Math.min(size * 2, QueryHandlerService.MAX_QUERY);
      acc += size;
    }
  } : function *(start) {
    let acc = start;
    while(acc <= this.MAX_RESULTS) {
      yield 10000;
      acc += 10000;
    }
  };

  //allows duplicate queries to use same data source instead of resubmitting query
  querySubjectMap: QuerySubjectMap;

  constructor(private spatial: SpatialService, private cache: QueryCacheService, private filters: FilterManagerService) {
    this.querySubjectMap = {};
  }

  // initFilterListener(filterMonitor: Observable<MonitorEvent>) {
  //   filterMonitor.subscribe((event: MonitorEvent) => {
  //     //console.log(event);
  //     switch(event.case) {
  //       case MonitorCase.CREATED: {
  //         this.dataPorts[event.handle] = new DataPort();
  //         //console.log(this.dataPorts[0]);
  //         break;
  //       }
  //       case MonitorCase.DESTROYED: {
  //         delete this.dataPorts[event.handle];
  //         break;
  //       }
  //     }
  //   });
  // }

  // getFilterObserver(filterHandle: FilterHandle): Observable<Metadata[]> {
  //   let port = this.dataPorts[filterHandle];
  //   //console.log(filterHandle);
  //   //console.log(this.dataPorts);
  //   if(port == undefined) {
  //     throw new Error("Invalid filter handle: the filter handle does not have an associated data port");
  //   }
  //   return port.source.asObservable();
  // }


  private query = function *(query: string, startPoint: number) {
    let ramp = QueryHandlerService.RAMP_FUNCT(startPoint);
    let rampState = ramp.next();
    let limit = rampState.value;
    let complete = rampState.done;

    let offset = startPoint;
    let canceled = false;

    while(!canceled && !complete) {
      //console.log(this.spatial);
      //inject true to cancel the current query if new query comes
      canceled = yield this.spatial.search(query, limit, offset).then((data) => {
        //if less data returned than requested, then the query should be complete
        complete = data.length != limit;
        let status: RequestStatus = {
          status: 200,
          error: false,
          loadedResults: offset + data.length,
          finished: complete
        }
        return {
          status: status,
          data: data
        };
      }, (e: HttpErrorResponse) => {
        console.log(e);
        //errored out, set complete (shouldn't continue)
        complete = true;
        let status: RequestStatus = {
          status: e.status,
          error: true,
          message: e.message,
          loadedResults: offset,
          finished: false
        }
        return {
          status: status,
          data: null
        }
      });

      offset += limit;

      rampState = ramp.next();
      limit = rampState.value;
      complete = complete || rampState.done;
    }
    //if cancelled emit extra value for canceller to consume;
    if(canceled) {
      yield true;
    }
    return complete;
  }

  // private cancelQuery() {
  //   if(this.queryState.queryGen != null) {
  //     //inject signal to cancel into query generator, shouldn't matter if already complete
  //     this.queryState.queryGen.next(true);
  //   }
  //   this.queryState.masterDataSubController.next();
  // }



  // //extension searches only garentee up to QueryHandlerService.MAX_QUERY results (may be able to return more if query broken up)
  // //assumed that extension queries are limited
  // //no filtering support, results cached with specified ttl or 5 minutes if not specified
  // valueSearchExtension(keys: string[], options?: HeuristicOptions) {
  //   let query = "";
  //   if(options != undefined) {
  //     let low = Math.max(0, options.rootIndex - options.searchRange);
  //   }

  //   this.spatial.search(query, QueryHandlerService.MAX_QUERY, 0) {

  //   }
  // }

  // spatialSearchExtension(geometry: any, options?: HeuristicOptions) {

  // }

  // handleExtensionQuery() {

  // }

  //filters handled by filtermanager, filters should be registered here and data ports are handled there
  //handle requests here, emit requests through filtermanager data ports

  //add support for sorting and filters

  //for any data retrieval method, return a promise, if data not cached:
  //verify that the query has been properly submitted and throw error if not
  //use the statusPort to signal new data received and check if requested data available
  //return null if first entry out of range or
  //error if query errors out
  //assumes that any data from current query should be cached (overflow will be cut off if excessively large)
  //need to add overflow indicator to status

  // cancelQuery(handle: QueryHandle): boolean {
  //   let subjects = this.subjectMap[handle];
  //   let canceled = false;
  //   if(subjects != undefined) {
  //     let i;
  //     for(i = 0; i < subjects.length; i++) {
  //       subjects[i].complete();
  //     }
  //     canceled = true;
  //   }
  //   return canceled;
  // }

  valueSearch(keys: string[]): void {
    throw new Error("valueSearch not implemented");
  }

  //!!! doesn't work with multiple queries as is, each query will report when it's finished and its own internal accumulator
  //!!! should subscribe to each subquery, then rebroadcast as a single query
  //should also go back to having a central cancel subject for each query unit that subqueries listen to to make cancelation more streamlined

  //handle features separately to optimize cache catches for subset queries
  spatialSearch(features: any[]): QueryController {
    // let res: QueryResults = {
    //   handle: this.handleGen.getHandle(),
    //   dataStream: new Observable<QueryResponse>()
    // };
    let subjects = [];
    let i;
    for(i = 0; i < features.length; i++) {
      //need to do something to handle too long queries
      let query = "{'$and':[{'name':{'$in':['Well']}},{'value.loc': {$geoWithin: {'$geometry':" + JSON.stringify(features[i].geometry).replace(/"/g,'\'') + "}}}]}";
      subjects.push(this.handleQuery(query));
    }

    return new QueryController(subjects);
  }

  //deal with case where same query running multiple times before complete
  private handleQuery(query: string): BehaviorSubject<QueryResponse> {
    let dataStream = new BehaviorSubject<QueryResponse>({status: null, data: []});
    let stored: DataRange<Metadata> = <DataRange<Metadata>>this.cache.fetchData(query);
    let offset;
    let complete;
    if(stored == null) {
      offset = 0;
      complete = false;
      //no entry so create entry
      this.cache.createEntry<Metadata>(query);
    }
    else {
      //issue with retreival, should always pull from first item with no specified range
      if(stored.range[0] != 0) {
        throw new Error("Unexpected error occured in cache retreival: data retreived did not start at 0");
      }
      offset = stored.range[1];
      complete = stored.complete;
      let response: QueryResponse = {
        status: {
          status: 200,
          error: false,
          loadedResults: stored.data.length,
          finished: stored.complete
        },
        data: stored.data
      }
      dataStream.next(response);
    }

    //if cache has all the data already no need to execute a query
    if(!complete) {
      let dataController = this.querySubjectMap[query];
      //check if query already executing
      if(dataController == undefined) {
        dataController = {
          data: this.requestDriver(query, offset),
          observers: 0
        };
        this.querySubjectMap[query] = dataController;
      }

      //increment the number of observers
      dataController.observers++;
      //indicate if query completed
      let complete = false;

      //mirror dataController's data to this instance's dataStream
      let controllerSub = dataController.data.subscribe((data: QueryResponse) => {
        dataStream.next(data);
      }, (error: any) => {
        complete = true;
        //is this the right syntax? Documentation is weird, shouldn't ever happen anyway
        dataStream.error(error);
      }, () => {
        complete = true;
        dataStream.complete();
      });

      let cleanup = () => {
        //if canceled or errored then unsubscribe, otherwise no need
        if(!complete) {
          controllerSub.unsubscribe();
        }

        if(--dataController.observers == 0) {
          //if canceled or errored and last observer, cancel the query's data stream (no need to get the rest of the data, no one's using it)
          //if complete then the data stream has already been completed/errored out
          if(!complete) {
            dataController.data.complete();
          }
          //no more observers, delete mapping
          delete this.querySubjectMap[query];
        }

      }

      //when dataStream completes or errors out run cleanup
      dataStream.subscribe(null, cleanup, cleanup);

    }

    return dataStream;
  }

  //drives database request for query
  //assumes that cache data timeout set to a sufficiently long time so data doesn't expire during retreival (and that timeout reset conditions are set reasonably so data before offset isn't removed)
  //if these conditions aren't met then the cache will throw an error on insertion (if preceding data has been cleared)
  private requestDriver(query: string, offset: number): Subject<QueryResponse> {
    let dataStream = new Subject<QueryResponse>();
    let qGen = this.query(query, offset);

    let queryHandle = qGen.next().value;
    let cancel = () => {
      qGen.next(true);
    }
    //query may be cancelled by calling complete() on dataStream, listen for this and cancel
    let canceller = dataStream.subscribe(null, null, cancel);

    let completeDataStream = () => {
      //unsubscribe from canceller so not trying to cancel completed query
      canceller.unsubscribe();
      //complete dataStream
      dataStream.complete();
    }

    //if hasnt been started start the query driver and listen in
    //query driver only ends if no more listeners

    let handler = (response: QueryResponse): void => {
      //query succeeded, cache data and continue
      if(!response.status.error) {
        //insert data into cache\
        let data: InsertData<Metadata> = {
          data: response.data,
          complete: response.status.finished
        }
        this.cache.setData(query, data, offset);
        offset += data.data.length;
        let next = qGen.next();
        if(next.value == undefined) {
          throw new Error("An unexpected error has occured while handling the query: handler called after generator completed");
        }
        //generator complete or canceled
        if(next.done) {
          //if completed, push data
          if(next.value) {
            dataStream.next(response);
            completeDataStream();
          }
          //if canceled then don't push data, subject has been completed
        }
        //otherwise still more data to be had, push data and keep going
        else {
          //push data to stream
          dataStream.next(response);
          //execute next subquery
          this.recursivePromise(next.value, handler);
        }
      }
      //query failed
      else {
        //get next generator value to check if dataStream has already been canceled
        let next = qGen.next();
        if(next.value == undefined) {
          throw new Error("An unexpected error has occured while handling the query: handler called after generator completed");
        }
        //generator has not completed or it has completed but not been canceled, push error to dataStream and complete
        if(!next.done || next.value) {
          dataStream.next(response);
          completeDataStream();
        }
        //otherwise dataStream has been canceled already, just ignore and exit
      }
    }

    this.recursivePromise(queryHandle, handler);

    return dataStream;
  }

  private recursivePromise(promise: Promise<any>, handler: (data) => void): void {
    promise.then((data) => {
      handler(data);
    });
  }



//   //returns all data as received through observable
//   //need to push all previous data when initially subscribed, shouldn't push to all subscriptions, so tracked for each call separately rather than from respective data port (don't want to push data cumulatively)
//   getDataStreamObserver(filterHandle: FilterHandle): Observable<IndexMetadataMap> {
//     //subscribe to status port and request data already available, then ranges after every tiem received
//     let source = new Subject<IndexMetadataMap>();
//     let subManager = new Subject();
//     let last = 0;
//     this.statusPort
//     .pipe(takeUntil(merge(subManager, this.queryState.masterDataSubController)))
//     .subscribe((status: RequestStatus) => {
//       if(status != null && status.loadedResults > 0) {
//         console.log(last, status.loadedResults)
//         //how to handle query errors?
//         let data = this.cache.retreiveData(filterHandle, this.queryState.query, [last, null]);
//         last += Object.keys(data).length;

//         source.next(data);
//       }
//     },
//     null,
//     () => {
//       source.complete();
//     });
//     return source.asObservable();
//   }

//   //getDataCountObserver(filterHandle: FilterHandle)

}


// interface QueryInfo {
//   query: string,
//   queryGen: IterableIterator<any>
// }

// interface SubjectMap {
//   [handle: number]: BehaviorSubject<QueryResults>[]
// }

// class QueryController {
//   private driverQuery: QueryInfo;
//   private extensionQueries: QueryInfo[];
//   private masterSubController: Subject<void>;

//   constructor() {
//     this.driverQuery = null;
//     this.extensionQueries = [];
//     this.masterSubController = new Subject();
//   }

//   extend(query: QueryInfo) {
//     this.extensionQueries.push(query);
//   }

//   getMasterSubController(): Observable<void> {
//     return this.masterSubController.asObservable();
//   }

//   private cancel() {
//     [this.driverQuery, ...this.extensionQueries].forEach((query) => {
//       query.queryGen.next(true);
//     });
//     this.masterSubController.next();
//   }
// }

interface DataObserverController {
  data: Subject<QueryResponse>
  observers: number
}

interface QuerySubjectMap {
  [query: string]: DataObserverController
}

export class QueryController {
  private querySubjects: BehaviorSubject<QueryResponse>[];
  private queryOutput: Subject<QueryResponse>;

  constructor(querySubjects: BehaviorSubject<QueryResponse>[]) {
    this.querySubjects = querySubjects;
    this.queryOutput = new Subject<QueryResponse>();
    let completed = 0;
    let loadedResults = 0
    let i;
    for(i = 0; i < querySubjects.length; i++) {
      querySubjects[i].subscribe((response: QueryResponse) => {
        //ignore initial value pushed if no cache data
        if(response.status != null) {
          if(response.data != null) {
            loadedResults += response.data.length;
          }
          let outStatus: RequestStatus = {
            status: response.status.status,
            error: response.status.error,
            message: response.status.message,
            loadedResults: loadedResults,
            finished: false
          };
          let outResponse: QueryResponse = {
            status: outStatus,
            data: response.data
          };

          if(response.status.finished) {
            completed++;
          }
          //if all completed set query status to finished
          if(completed == querySubjects.length) {
            outStatus.finished = true;
          }
          this.queryOutput.next(outResponse);
          //check if failed and cancel query if it did (stop if any part of query fails)
          if(response.status.error) {
            this.cancel();
          }
        }
      }, () => {
        //something went wrong, throw error in output and cancel query
        this.queryOutput.error("An error has occurred while retreiving data");
        //remove this subscription from subscription list since already completed (stop cleanup from being performed on cancel)
        this.querySubjects[i] = null;
        this.cancel();
      }, () => {
        //remove this subscription from subscription list since already completed (stop cleanup from being performed on cancel)
        this.querySubjects[i] = null;
      });
    }
  }

  getQueryObserver(): Observable<QueryResponse> {
    return this.queryOutput.asObservable();
  }

  cancel() {
    let i;
    for(i = 0; i < this.querySubjects.length; i++) {
      let sub = this.querySubjects[i];
      //if null then already completed, complete any still running subscriptions
      if(sub != null) {
        sub.complete();
      }
    }
    //complete output stream
    this.queryOutput.complete();
  }
}

// export interface HeuristicOptions {
//   rootIndex: number,
//   searchRange: number
// }

export interface QueryResponse {
  status: RequestStatus,
  data: Metadata[]
}

// //data port holds stateful information on position of last returned data, chunk size, etc and observer for subscribing to data stream of requested data on the filter
// class DataPort {
//   source: BehaviorSubject<Metadata[]>;
//   count: BehaviorSubject<number>;
//   chunkSize: number;
//   //store last promise, wait until after this data is returned to get next chunk
//   lastRequest: Promise<[number, number]>;

//   constructor() {
//     this.source = new BehaviorSubject<Metadata[]>(null);
//     this.lastRequest = null;
//   }
// }

// interface ChunkController {
//   last: [number, number],
//   current: [number, number]
// }

export interface RequestStatus {
  status: number;
  error: boolean;
  message?: string;
  loadedResults: number;
  finished: boolean;
}
