import { Injectable } from '@angular/core';
import { RequestStatus, QueryResponse } from './query-handler.service';
import { Observable, Subject, BehaviorSubject } from 'rxjs';
import { Metadata } from "../_models/metadata";
import { Filter } from "./filter-manager.service"

@Injectable({
  providedIn: 'root'
})
export class DataManagerService {

    constructor() { }


}

//how to handle filter integration?

//sorting and conditions need to be separated
//sorting should be global so all can use the same index
//conditions handled locally and evaluated on access without index (shouldn't impact performance too much, keeping indexes for any used condition combo could get very large)

//switch filter manager to sorting registry, key hierarchy for sorting field should be registered with the sorting function (one sorting function per key hierarchy)
//can add specialization tag to maintain generality, if for some reason need multiple sorting algorithms with the same key can add an optional tag to identify
//have something register the desired sorting algorithms for each key in metadata
//filters should have key/tag combo for any referenced sorter
//sorting registry entries should have an observable that emits when the sorter changed/deleted, data controller can listen and invalidate index if this happens (probably never used, but good to have)
//remember to add order to filter, sort forward or in reverse

//indexes generated on first access (can use webworkers for index generation to maintain responsiveness during generation)
export class DataController {

    private data: Metadata[];
    private defaultState: OutputState;
    private filterMap: Map<Filter, OutputState>;

    //allow an initial set of indexes to be created, data inserted in index as received
    constructor(defaultChunkSize: number, initIndexes) {
        this.defaultState = {
            chunkSize: defaultChunkSize,
            lastRequest: null,
            lastCall: null
        };
        this.filterMap = new Map();
    }

    //have a way to mark indexes as dirty if new data added
    //also track indexes that have been accessed frequently recently and update those automatically
    addData(data: Metadata[]) {
        data.concat(data);
    }

    //get last data request again (can be used if filter updated or more data received (added data may change ordering/invalidate index))
    refresh(filter: Filter): Promise<DataRequestWrapper> {
        //throw new Error("Refresh not implemented");

        let state = this.filterMap.get(filter);
        if(state == undefined) {
            state = this.initializeFilterState(filter);
        }
        return state.lastCall.then((call: CallData) => {
            return call.f(...call.params);
        });
    }

    private initializeFilterState(filter: Filter): OutputState {
        //copy default state data to new state
        let initFilter: OutputState = {
            chunkSize: this.defaultState.chunkSize,
            lastRequest: this.defaultState.lastRequest,
            lastCall: this.defaultState.lastCall
        }
        this.filterMap.set(filter, initFilter);
        return initFilter;
    }

    //stateless data request
    requestDataRange(filter: Filter, range: [number, number]): Promise<DataRequestWrapper> {
        return this.internalRequestDataRange(filter, range, true);
    }

    //use for determining if state's last call was set elsewhere, use when finish implementing refresh
    private internalRequestDataRange(filter: Filter, range: [number, number], setLastCall: boolean): Promise<DataRequestWrapper> {
        if(setLastCall) {
            let state = this.filterMap.get(filter);
            if(state == undefined) {
                state = this.initializeFilterState(filter);
            }
            state.lastCall = Promise.resolve({
                f: this.internalRequestDataRange,
                params: Array.from(arguments)
            });
        }

        if(range[1] == null) {
            range[1] = this.data.length;
        }
        //for now no sorting/indexing, so just get data and return an immediately resolved promise
        let data: Metadata[] = this.data.slice(range[0], range[1]);
        let retreivedRange: [number, number] = [range[0], range[0] + data.length];
        return Promise.resolve({
            range: retreivedRange,
            data: data
        });
    }

    //data manager shouldn't care about future changes, only its current state
    //have refresh data method that resends the last requested set of data, can be used to update state of sorted data when more data added, or if chunk incomplete
    //return promise so can generate index async if new sorter

    //should entry index by filter or default order? should have option for either? can make EntryDetails interface
    //make sure data refresh follows the request pattern, if requesting a specific item then make sure to lock focus on this item

    //stateful data request, retreives data in chunks
    requestChunk(filter: Filter, order: boolean, entry: number, chunkSize?: number): Promise<DataRequestWrapper> {
        let state = this.filterMap.get(filter);
        if(state == undefined) {
            state = this.initializeFilterState(filter);
        }
        if(chunkSize == undefined) {
            chunkSize = state.chunkSize;
        }
        else {
            state.chunkSize = chunkSize;
        }
        let lower = Math.floor(entry / chunkSize);
        let upper = lower + chunkSize;
        let dataPromise = this.internalRequestDataRange(filter, [lower, upper], false);
        state.lastRequest = dataPromise.then((data: DataRequestWrapper) => {
            return data.range;
        });
        state.lastCall = Promise.resolve({
            f: this.requestChunk,
            params: Array.from(arguments)
        });
        return dataPromise;
    }

    next(filter: Filter): Promise<DataRequestWrapper> {
        let state = this.filterMap.get(filter);
        if(state == undefined) {
            throw new Error("next called before stream initialized: requestData must be called before stateful next or previous to initialize data position");
        }

        let lastRequestResolver: DeferredPromiseResolver;
        let lastRequest: Promise<[number, number]> = new Promise<[number, number]>((resolve, reject) => {
            lastRequestResolver = {
                resolve: resolve,
                reject: reject
            }
        });
        state.lastRequest = lastRequest;
        
        let lastCallResolver: DeferredPromiseResolver;
        let lastCall: Promise<CallData> = new Promise<CallData>((resolve, reject) => {
            lastCallResolver = {
                resolve: resolve,
                reject: reject
            }
        });
        state.lastCall = lastCall;

        let dataPromise: Promise<DataRequestWrapper> = state.lastRequest.then((last: [number, number]) => {
            let lower = last[1];
            let upper = lower + state.chunkSize;
            let range: [number, number] = [lower, upper];
            lastRequestResolver.resolve(range);
            let params: [Filter, [number, number], boolean] = [filter, range, false]
            lastCallResolver.resolve({
                f: this.requestChunk,
                params: params                    
            })
            return this.internalRequestDataRange(filter, [lower, upper], false);
        });
        
        //no
        //state.lastCall = [this.next, arguments];
        return dataPromise;
    }

    previous(filter: Filter): Promise<DataRequestWrapper> {
        let state = this.filterMap.get(filter);
        if(state == undefined) {
            throw new Error("previous called before stream initialized: requestData must be called before stateful next or previous to initialize data position");
        }

        let lastRequestResolver: DeferredPromiseResolver;
        let lastRequest: Promise<[number, number]> = new Promise<[number, number]>((resolve, reject) => {
            lastRequestResolver = {
                resolve: resolve,
                reject: reject
            }
        });
        state.lastRequest = lastRequest;

        let lastCallResolver: DeferredPromiseResolver;
        let lastCall: Promise<CallData> = new Promise<CallData>((resolve, reject) => {
            lastCallResolver = {
                resolve: resolve,
                reject: reject
            }
        });
        state.lastCall = lastCall;

        let dataPromise: Promise<DataRequestWrapper> = state.lastRequest.then((last: [number, number]) => {
            let lower = Math.max(last[0] - state.chunkSize, 0);
            //realign to 0 if necessary (failsafe, should always be aligned with chunk size)
            let upper = lower + state.chunkSize;
            let range: [number, number] = [lower, upper];
            lastRequestResolver.resolve(range);
            let params: [Filter, [number, number], boolean] = [filter, range, false]
            lastCallResolver.resolve({
                f: this.requestChunk,
                params: params                    
            })
            return this.internalRequestDataRange(...params);
        });

        return dataPromise;
    }

    //use filter manager to define a set of sorters and their sorting functions globally
    //should only have one sorting function defined for each sorted element
    private sorterToString(sortKey: string[], tag?: string, delim?: string): string {
        if(delim == undefined) {
            delim = String.fromCharCode(0xff);
        }
        let s = "";
        let i: number;
        for(i = 0; i < sortKey.length; i++) {
            s += sortKey[i] + delim;
        }
        if(tag != undefined) {
            s += tag;
        }
        return s;
    }
}

interface DeferredPromiseResolver {
    resolve: any,
    reject: any
}

// //Promise that can be externally resolved
// class DeferredPromise<T> {
//     private promiseData: {
//         promise: Promise<T>,
//         resolve: any,
//         reject: any
//     };

//     then = Promise.prototype.then;
//     catch = Promise.prototype.catch;
//     finally = Promise.prototype.finally;
    
//     constructor() {
//         this.promiseData = {
//             promise: null,
//             resolve: null,
//             reject: null
//         }
//         let executor = (resolve, reject) => {
//             this.promiseData.resolve = resolve;
//             this.promiseData.reject = reject;
//         }
//         this.promiseData.promise = new Promise<T>(executor);
//     }

//     resolve(data: T) {
//         if(this.promiseData.resolve == null) {
//             setTimeout(() => {
//                 this.resolve(data);
//             }, 0);
//         }
//         else {
//             this.promiseData.resolve(data)
//         }
//     }

//     reject(data: T) {
//         if(this.promiseData.reject == null) {
//             setTimeout(() => {
//                 this.reject(data);
//             }, 0);
//         }
//         else {
//             this.promiseData.reject(data)
//         }
//     }

//     // then(onfulfilled?: (value: T) => any, onrejected?: (value: T) => any): Promise<any> {
//     //     return this.promiseData.promise.then(onfulfilled, onrejected);
//     // }
// }

interface OutputState {
    chunkSize: number,
    lastRequest: Promise<[number, number]>,
    lastCall: Promise<CallData>
}

interface CallData {
    f: (...params) => Promise<DataRequestWrapper>,
    params: any[]
}

// interface CallTrace {
//     lastCall: [(...params) => Promise<DataRequestWrapper>, IArguments],
//     lastState: OutputState
// }

export interface DataRequestWrapper {
    range: [number, number]
    data: Metadata[]
}

class IndexManager {

}






//   generateChunkRetreivalPromise(filterHandle: FilterHandle, last: [number, number], current: [number, number]): Promise<ChunkController> {
//     let chunkData: ChunkController = {
//       last: last,
//       current: null
//     };

//     return new Promise<ChunkController>((resolve) => {
//       let subManager = new Subject();
//       this.statusPort
//       //make submanager global, store chunkdata outside and resolve in complete method so can be canceled
//       .pipe(takeUntil(merge(subManager, this.queryState.masterDataSubController)))
//       .subscribe((status: RequestStatus) => {
//         //cancellation should be accomplished by query cancellation pushing to masterDataSubController
//         // //error in query, return null, data will never be loaded unless retry
//         // if(status.status != 200) {
//         //   subManager.next();
//         // }
//         let ready: PollStatus = this.cache.pollData(filterHandle, this.queryState.query, current);
//         //if query ready resolve
//         if(ready == PollStatus.READY) {
//           subManager.next();
//           chunkData.current = current;     
//         }
//         //out of range, resolve with null
//         else if(ready == PollStatus.INVALID) {
//           subManager.next();
//         }
//         //not ready, wait for next set of data to arrive
//       },
//       null,
//       () => {
//         console.log("complete");
//         resolve(chunkData);
//       });
//     });
//   }

//   generateResultAndSetState(filterHandle: FilterHandle, port: DataPort, dataListener: Promise<ChunkController>): Promise<[number, number]> {
//     port.lastRequest = dataListener.then((chunkData: ChunkController) => {
//       //if next data is null then keep same state otherwise assign to the new state
//       return chunkData.current == null ? chunkData.last : chunkData.current;
//     });
//     return dataListener.then((chunkData: ChunkController) => {
//       //if null just return null to user, otherwise push data retreived from chunk range and return range
//       if(chunkData.current != null) {
//         let data = this.cache.retreiveData(filterHandle, this.queryState.query, chunkData.current);
//         port.source.next(Object.values(data));
//       }
//       return chunkData.current;
//     });
//   }