var FastMutex = require('./');

var sinon = require('sinon');
var chai = require('chai');
chai.use(require('chai-as-promised'));
var expect = chai.expect;

var LocalStorage = require('node-localstorage').LocalStorage;
var localStorage = new LocalStorage('./tmp');

// TODO: Fulfilled promise value should have more properties

describe('FastMutex', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    console.log('cleared');
    let len = localStorage.length;
    localStorage.clear();
    expect(localStorage.length).to.equal(0);
  });

  it('should immediately establish a lock when there is no contention', () => {
    var fm = new FastMutex({ localStorageKey: 'test', localStorage: localStorage });

    // TODO: not async:
    fm.sync('hooray');
    expect(localStorage.getItem('test')).to.equal('hooray');
  });

  describe('When another client has a lock (Y is not 0)', () => {
    it('should restart', () => {
      console.log('wtf');
      localStorage.setItem('_MUTEX_LOCK_Y_test', '1234');
      const fm = new FastMutex({ localStorageKey: 'test', localStorage: localStorage });
      const promise = fm.sync('hooray');
      localStorage.removeItem('_MUTEX_LOCK_Y_test');
      return expect(promise).to.eventually.be.fulfilled;
    });
  });

  describe('When ', () => {
    it.only('should ', () => {
      var stub = sinon.stub(localStorage, 'getItem')
      stub.onCall(0).returns(null)
      stub.onCall(1).returns(null)
      stub.onCall(2).returns('lockcontention')
      stub.onCall(3).returns('uniqueId')
      stub.returns('nomo')
      const fm = new FastMutex({ localStorageKey: 'test', localStorage: localStorage, id: 'uniqueId' });
      const promise = fm.sync('hooray');
      return promise

    });
  });
});
