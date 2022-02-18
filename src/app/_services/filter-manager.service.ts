import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class FilterManagerService {
  
  filterMonitor = new Subject<MonitorEvent>();

  private filterManager: {[handle in FilterHandle]: Filter} = {};

  private freeHandles: {
    freed: FilterHandle[],
    next: FilterHandle
  };

  constructor() {
    this.freeHandles = {
      freed: [],
      next: 0
    }
  }

  private getHandle(): FilterHandle {
    if(this.freeHandles.freed.length > 0) {
      return this.freeHandles.freed.pop();
    }
    else {
      let next = this.freeHandles.next;
      this.freeHandles.next++;
      return next;
    }
  }

  private freeHandle(handle: FilterHandle): void {
    this.freeHandles.freed.push(handle);
  }

  registerFilter(conditions?: Condition[], sorter?: (a, b) => number): FilterHandle {
    let handle = this.getHandle();
    this.filterManager[handle] = new Filter(conditions, sorter);
    this.filterMonitor.next({handle: handle, case: MonitorCase.CREATED});
    return handle;
  }

  removeFilter(handle: FilterHandle): void {
    delete this.filterManager[handle];
    this.filterMonitor.next({handle: handle, case: MonitorCase.DESTROYED});
    this.freeHandle(handle);
  }

  addFilterCondition(handle: FilterHandle, condition: Condition): void {
    this.filterManager[handle].addCondition(condition);
    this.filterMonitor.next({handle: handle, case: MonitorCase.ADD_COND});
  }

  removeFilterCondition(handle: FilterHandle, condition: (data) => boolean): void {
    this.filterManager[handle].removeCondition(condition);
    this.filterMonitor.next({handle: handle, case: MonitorCase.REMOVE_COND});
  }

  //only one sort can be registered per tracked filter
  setFilterSorter(handle: FilterHandle, sortFunction: (a, b) => number): void {
    this.filterManager[handle].setSorter(sortFunction);
    this.filterMonitor.next({handle: handle, case: MonitorCase.UPDATE_SORTER});
  }

  getFilter(handle: FilterHandle) {
    return this.filterManager[handle];
  }
}

export type FilterHandle = number;
export type Condition = (data: any) => boolean;

export class Filter {

  private conditions: Condition[];
  private sorter: (a: any, b: any) => number;

  constructor(conditions?: Condition[], sorter?: (a, b) => number) {
    this.conditions = conditions == undefined ? []: conditions;
    this.sorter = sorter == undefined ? null: sorter;
  }

  addCondition(condition: Condition): void {
    this.conditions.push(condition);
  }

  removeCondition(condition: Condition): void {
    let index = this.conditions.indexOf(condition);
    if(index >= 0) {
      this.conditions.splice(index, 1);
    }
  }

  setSorter(sortFunction: (a, b) => number): void {
    this.sorter = sortFunction;
  }

  getConditions(): Condition[] {
    return this.conditions;
  }

  getSorter(): (a: any, b: any) => number {
    return this.sorter;
  }

  generateFilterFunct(mode: FilterMode): (data: any[]) => any[] {
    let condFunct = (data: any[]) => {
      return data.filter((datum) => {
        let pass = true;
        let i;
        for(i = 0; i < this.conditions.length; i++) {
          pass = pass && this.conditions[i](datum);
        }
        return pass;
      });
    }
    let sortFunct = (data: any[]) => {
      return this.sorter == null ? data : data.sort(this.sorter);
    }
    let allFunct = (data: any[]) => {
      let condFilter = condFunct(data);
      return sortFunct(condFilter);
    }
    switch(mode) {
      case FilterMode.COND: {
        return condFunct;
      }
      case FilterMode.SORT: {
        return sortFunct;
      }
      case FilterMode.COND_SORT: {
        return allFunct;
      }
      default: {
        throw new Error("Invalid mode");
      }
    }
  }
}

export enum FilterMode {
  COND = 0,
  SORT = 1,
  COND_SORT = 2
}

export enum MonitorCase {
  CREATED = 0,
  DESTROYED = 1,
  ADD_COND = 2,
  REMOVE_COND = 3,
  UPDATE_SORTER = 4
}

export interface MonitorEvent {
  handle: FilterHandle,
  case: MonitorCase
}

