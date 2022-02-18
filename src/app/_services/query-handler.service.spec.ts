import { TestBed } from '@angular/core/testing';

import { QueryHandlerService } from './query-handler.service';

describe('QueryHandlerService', () => {
  beforeEach(() => TestBed.configureTestingModule({}));

  it('should be created', () => {
    const service: QueryHandlerService = TestBed.get(QueryHandlerService);
    expect(service).toBeTruthy();
  });
});
