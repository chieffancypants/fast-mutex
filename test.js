var FastMutex = require('./');

var sinon = require('sinon');
var chai = require('chai');
chai.use(require('chai-as-promised'));
var expect = chai.expect;

var LocalStorage = require('node-localstorage').LocalStorage;
var localStorage = new LocalStorage('./tmp');

// TODO: Fulfilled promise value should have more properties

describe('FastMutex', () => {
  let sandbox;
  beforeEach(() => {
    sandbox = sinon.sandbox.create()
    localStorage.clear();
  });
  afterEach(() => {
    sandbox.restore();
    let len = localStorage.length;
    localStorage.clear();
    console.log('localStorage cleared');
    expect(localStorage.length).to.equal(0);
  });

  it('should immediately establish a lock when there is no contention', () => {
    var fm1 = new FastMutex({ localStorageKey: 'test', localStorage: localStorage });
    var fm2 = new FastMutex({ localStorageKey: 'test', localStorage: localStorage });

    return fm1.lock('clientId').then((stats) => {
      expect(stats.restartCount).to.be.equal(0);
      expect(stats.locksLost).to.be.equal(0);
      expect(stats.contentionCount).to.be.equal(0);
    })
  });

  it('When another client has a lock (Y is not 0), it should restart to acquire a lock at a later time', function () {
    var fm1 = new FastMutex({ localStorageKey: 'test', localStorage: localStorage });
    let spy = sandbox.spy(fm1, 'lock');
    const key = 'clientId';
    localStorage.setItem(`mutexlock_y_${key}`, 'abcd');

    setTimeout(() => {
      console.log('reset Y');
      localStorage.removeItem(`mutexlock_y_${key}`);
    }, 10);

    return fm1.lock(key).then((stats) => {
      expect(stats.restartCount).to.be.equal(spy.callCount - 1);
      expect(stats.locksLost).to.be.equal(0);
      expect(stats.contentionCount).to.be.equal(0);
      expect(stats.timeToAcquire).to.be.above(10);
      expect(spy.callCount).to.be.at.least(3);
    });
  });

  it('when contending for a lock and ultimately losing, it should restart', () => {
    const key = 'clientId';
    var stub = sandbox.stub(localStorage, 'getItem')

    // Set up scenario for lock contention where we lost Y
    stub.onCall(0).returns(null)  // getItem Y
    stub.onCall(1).returns('lockcontention')  // getItem X
    stub.onCall(2).returns('youLostTheLock')  // getItem Y

    // fastmutex should have restarted, so let's free up the lock:
    stub.onCall(3).returns(null)
    stub.onCall(4).returns('randomId')

    const fm = new FastMutex({ localStorageKey: 'test', localStorage: localStorage, id: 'uniqueId' });
    var spy = sandbox.spy(fm, 'lock');

    return fm.lock(key).then((stats) => {
      expect(stats.restartCount).to.be.equal(1);
      expect(stats.locksLost).to.be.equal(1);
      expect(stats.contentionCount).to.be.equal(1);
      expect(stats.timeToAcquire).to.be.above(50);
      expect(spy.callCount).to.be.equal(2);
    });
  });

  it.only('When contending for a lock and ultimately winning, it should not restart', () => {
    const key = 'clientId';
    var stub = sandbox.stub(localStorage, 'getItem')

    // Set up scenario for lock contention where we lost Y
    stub.onCall(0).returns(null)  // getItem Y
    stub.onCall(1).returns('lockContention');
    stub.onCall(2).returns('randomId');

    const fm = new FastMutex({ localStorageKey: 'test', localStorage: localStorage, id: 'uniqueId' });
    var spy = sandbox.spy(fm, 'lock');

    return fm.lock(key).then((stats) => {
      expect(stats.restartCount).to.be.equal(0);
      expect(stats.locksLost).to.be.equal(0);
      expect(stats.contentionCount).to.be.equal(1);
      expect(stats.timeToAcquire).to.be.above(50);
      expect(spy.callCount).to.be.equal(1);
    });
  });

});
