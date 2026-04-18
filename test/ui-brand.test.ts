import { describe, expect, test } from 'bun:test';
import { getOpenMetaWordmarkLines } from '../src/infra/ui/brand.js';

describe('ui brand wordmark', () => {
  test('renders the canonical OpenMeta ascii wordmark', () => {
    expect(getOpenMetaWordmarkLines()).toEqual([
      ' ######   #######   ########  ##    ##  ##    ##  ########  ########   ######',
      '##    ##  ##    ##  ##        ###   ##  ###  ###  ##           ##     ##    ##',
      '##    ##  ##    ##  ##        ####  ##  ########  ##           ##     ##    ##',
      '##    ##  #######   ######    ## ## ##  ## ## ##  ######       ##     ########',
      '##    ##  ##        ##        ##  ####  ##    ##  ##           ##     ##    ##',
      '##    ##  ##        ##        ##   ###  ##    ##  ##           ##     ##    ##',
      ' ######   ##        ########  ##    ##  ##    ##  ########     ##     ##    ##',
    ]);
  });
});
