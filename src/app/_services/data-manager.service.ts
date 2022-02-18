import { Injectable } from '@angular/core';
import { RequestStatus, QueryResponse } from './query-handler.service';
import { Observable, Subject, BehaviorSubject } from 'rxjs';
import { Metadata } from "../_models/metadata";
import { Filter } from "./filter-manager.service"
import { Meta } from '@angular/platform-browser';

@Injectable({
  providedIn: 'root'
})
export class DataManagerService {

    constructor() { }

    //registerDataStream(stream: Observable<QueryResponse>): DataController {
    //    return new DataController(stream);
    //}


}

export class DataController {

    private data: Metadata[];
    private state: OutputState

    //provide filter and order (e.g. 1 or -1), instead of having separate filters for different orders
    //have data retreival methods here, have filter as an input, add index manager to deal with indices

    constructor(defaultChunkSize: number) {
        this.state = {
            chunkSize: defaultChunkSize,
            lastRequest: null
        };
    }

    addData(data: Metadata[]) {
        data.concat(data);
    }

    //stateless data request
    requestDataRange(filter: Filter, range: [number, number]): Metadata[] {
        
        let data = this.data.slice(range[0], range[-1]);
        return data;
    }

    //data manager shouldn't care about future changes, only its current state
    //have refresh data method that resends the last requested set of data, can be used to update state of sorted data when more data added, or if chunk incomplete
    //return promise so can generate index async if new sorter

    //should entry index by filter or default order? should have option for either? can make EntryDetails interface
    //make sure data refresh follows the request pattern, if requesting a specific item then make sure to lock focus on this item

    //stateful data request, retreives data in chunks
    requestChunk(filter: Filter, order: boolean, entry: number, chunkSize?: number): Promise<Metadata[]> {
        if(chunkSize == undefined) {
            chunkSize = this.state.chunkSize;
        }
        var local_data: Metadata[];
        let lower = Math.floor(entry / chunkSize);
        let upper = lower + chunkSize;
        local_data = this.requestDataRange(filter, [lower, upper]);
        //this.state.lastRequest = Promise.resolve([lower, lower + local_data.length]);
        //for now no sorting/indexing, so return an immediately resolved promise
        return Promise.resolve(local_data);
    }


    next(filter: Filter): Promise<Metadata> {
        if(this.state.lastRequest == null) {
            throw new Error("next called before stream initialized: requestData must be called before stateful next or previous to initialize data position");
        }
        this.state.lastRequest.then((range: [number, number]) => {
            
        });
        return;
    }

   /* previous(filterHandle: FilterHandle): Promise<[number, number]> {
        let port = this.dataPorts[filterHandle];
        if(port == undefined) {
        throw new Error("Invalid filter handle: the filter handle does not have an associated data port");
        }
        if(port.lastRequest == null) {
        throw new Error("next called before stream initialized: requestData must be called before stateful next or previous to initialize stream state");
        }
        //don't try to get current request until last request is properly handled and returned to ensure ordering
        let dataListener = port.lastRequest.then((last: [number, number]) => {
        //if already at 0 lower bound just ignore and return null for current
        if(last[0] == 0) {
            return {
            last: last,
            current: null
            };
        }
        //if chunk size doesn't fit properly and lower bound less than 0, realign to 0 (failsafe, should never actually happen since requestData should align)
        let lower = Math.max(last[0] - port.chunkSize, 0);
        let upper = lower + port.chunkSize;
        let range: [number, number] = [lower, upper];

        return this.generateChunkRetreivalPromise(filterHandle, last, range);
        });

        return this.generateResultAndSetState(filterHandle, port, dataListener);
   }*/

    //use filter manager to define a set of sorters and their sorting functions globally
    //should only have one sorting function defined for each sorted element
    private sorterToString(sortTag: string[], delim?: string): string {
        if(delim == undefined) {
            delim = String.fromCharCode(0xff);
        }
        let s = "";
        let i: number;
        for(i = 0; i < sortTag.length; i++) {
            s += sortTag[i] + delim;
        }
        return s;
    }
    

}

interface OutputState {
    chunkSize: number,
    lastRequest: Promise<[number, number]>
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