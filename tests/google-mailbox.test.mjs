import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceMailbox} from '../server/google/mailbox.js';

test('source identity uses the actual single mailbox and ignores display text',()=>{
  assert.equal(sourceMailbox('Actual <actual@example.com>'),'actual@example.com');
  assert.equal(sourceMailbox('"victim@example.com" <actual@example.com>'),'actual@example.com');
  assert.equal(sourceMailbox('"Name, Team" <ACTUAL@example.com>'),'actual@example.com');
  assert.equal(sourceMailbox(' actual@example.com '),'actual@example.com');
});
test('ambiguous, malformed and injected sender headers provide no identity',()=>{
  for(const value of ['a@example.com, b@example.com','a@example.com, Name <b@example.com>',
    'a@example.com; b@example.com','Name <a@example.com> <b@example.com>',
    'a@example.com\r\nFrom: victim@example.com','Name <bad>','undisclosed-recipients:;',null])
    assert.equal(sourceMailbox(value),null,String(value));
});
