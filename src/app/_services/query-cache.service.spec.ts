import { TestBed } from '@angular/core/testing';

import { QueryCacheService } from './query-cache.service';

describe('QueryCacheService', () => {
  beforeEach(() => TestBed.configureTestingModule({}));

  it('should be created', () => {
    const service: QueryCacheService = TestBed.get(QueryCacheService);
    expect(service).toBeTruthy();
  });
});
