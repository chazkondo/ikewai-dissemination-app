export class HandleGenerator<T extends number> {
    private freeHandles: {
        freed: T[],
        next: T
    };

    getHandle(): T {
        if(this.freeHandles.freed.length > 0) {
          return this.freeHandles.freed.pop();
        }
        else {
          let next = this.freeHandles.next;
          this.freeHandles.next++;
          return next;
        }
      }
    
    freeHandle(handle: T): void {
        this.freeHandles.freed.push(handle);
    }
}
