import { Injectable } from '@angular/core';
import { Metadata } from '../_models/metadata';
import { FilterHandle, MonitorEvent, MonitorCase, Filter } from './filter-manager.service';
import { Observable } from 'rxjs';

export enum ResetOptionFlags {
  SET = 1,
  GET = 1 << 1
}

@Injectable({
  providedIn: 'root'
})
export class QueryCacheService {

  //time before query cleared from cache in ms
  static readonly DEFAULT_OPTIONS: CacheEntryOptions = {
    timeout: 1000 * 60 * 5,
    resetOn: ResetOptionFlags.GET | ResetOptionFlags.SET
  };

  private dataStore: CacheMap;

  constructor() {
    this.dataStore = {};
  }

  exists(key: string): boolean {
    return this.dataStore[key] != undefined
  }
  
  createEntry<T>(key: string, initData?: InsertData<T>, options?: CacheEntryOptions): void {
    let initOptions: DataOptions = {
      timeout: QueryCacheService.DEFAULT_OPTIONS.timeout,
      resetOn: QueryCacheService.DEFAULT_OPTIONS.resetOn,
      timoutHandler: null
    };
    if(options != undefined) {
      if(options.timeout != undefined) {
        initOptions.timeout = options.timeout;
      }
      if(options.resetOn != undefined) {
        initOptions.resetOn = options.resetOn;
      }
    }
    initOptions.timoutHandler = () => {
      delete this.dataStore[key];
    }
    this.dataStore[key] = new CacheData<T>(initOptions, initData);
  }

  setData(key: string, data: InsertData<unknown>, start: number): boolean {
    let cacheData = this.dataStore[key];
    let inserted = false;
    if(data != undefined) {
      cacheData.set(data, start);
      inserted = true
    }
    else {
      throw new Error("Data key does not exist: createEntry must be called to create cache entry before inserting data");
    }
    return inserted;
  }

  fetchData(key: string, range?: [number, number]): DataRange<unknown> {
    let fetchedData = null;
    let data = this.dataStore[key];
    if(data != undefined) {
      if(range == undefined) {
        range = [0, null];
        fetchedData = data.fetch(range);
      }
    }
    return fetchedData;
  }
  
}

interface CacheMap {
  [key: string]: CacheData<unknown>
}

export interface InsertData<T> {
  data: T[],
  complete: boolean
}

export interface CacheEntryOptions {
  timeout?: number,
  resetOn?: number,
}

export interface DataRange<T> {
  data: T[],
  range: [number, number],
  complete: boolean
}

//internal version of entry options
interface DataOptions {
  timeout: number,
  resetOn: number,
  timoutHandler: () => void
}

class CacheData<T> {
  private data: T[];
  private complete: boolean;
  private options: DataOptions;
  private timeout: any;

  constructor(options: DataOptions, initData?: InsertData<T>) {
    if(initData != undefined) {
      this.data = initData.data;
      this.complete = initData.complete;
    }
    else {
      this.data = [];
      this.complete = false;
    }
    this.options = options;
    this.setTimeout();
  }

  set(data: InsertData<T>, start: number): void {
    //don't allow gaps, shouldn't be any reason to need to
    if(start > this.data.length) {
      throw new Error("Data out of range: range minimum exceeds current maximum value, data must be inserted in order");
    }
    if(this.checkReset(ResetOptionFlags.SET)) {
      this.resetTimeout();
    }
    this.data.splice(start, data.data.length, ...data.data);
    this.complete = data.complete;
  }

  fetch(range: [number, number]): DataRange<T> {
    if(this.checkReset(ResetOptionFlags.GET)) {
      this.resetTimeout();
    }
    if(range[1] == null) {
      range[1] = this.data.length;
    }
    let fetchedData = this.data.slice(...range);
    let dataDetails: DataRange<T> = {
      data: fetchedData,
      range: [range[0], range[0] + fetchedData.length],
      complete: this.complete && fetchedData.length == this.data.length
    }
    return dataDetails;
  }

  //if a flag matches a resetOn flag then return true (should reset)
  checkReset(flags: number): boolean {
    return (this.options.resetOn & flags) != 0;
  }

  resetTimeout() {
    clearTimeout(this.timeout);
    this.setTimeout();
  }

  setTimeout() {
    this.timeout = setTimeout(this.options.timoutHandler, this.options.timeout);
  }
}



