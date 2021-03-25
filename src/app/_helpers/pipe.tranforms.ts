import {Pipe, PipeTransform } from '@angular/core';

@Pipe({name: 'replaceCommas'})
export class ReplaceCommas implements PipeTransform {
  transform(value: string): string {
    return value.replace(/,/g, ', ');
  }
}

@Pipe({name: 'toJsonString'})
export class ToJsonString implements PipeTransform {
  transform(value: any): any {
    return JSON.stringify(value);
  }
}
