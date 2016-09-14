var FastMutex = require('./');

var sinon = require('sinon');
var chai = require('chai');
chai.use(require('chai-as-promised'));
var expect = chai.expect;

var LocalStorage = require('node-localstorage').LocalStorage;
var localStorage = new LocalStorage('./tmp');

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
    expect(localStorage.length).to.equal(0);
  });

  it('should immediately establish a lock when there is no contention', () => {
    var fm1 = new FastMutex({ localStorage: localStorage });

    return fm1.lock('clientId').then((stats) => {
      expect(stats.restartCount).to.be.equal(0);
      expect(stats.locksLost).to.be.equal(0);
      expect(stats.contentionCount).to.be.equal(0);
    })
  });

  it('When another client has a lock (Y is not 0), it should restart to acquire a lock at a later time', function () {
    var fm1 = new FastMutex({ xPrefix: 'xPrefix_', yPrefix: 'yPrefix_', localStorage: localStorage });
    let spy = sandbox.spy(fm1, 'lock');

    const key = 'clientId';
    fm1.setItem(`yPrefix_${key}`, 'someOtherMutexId');

    setTimeout(() => {
      localStorage.removeItem(`yPrefix_${key}`);
    }, 20);

    return fm1.lock(key).then((stats) => {
      expect(stats.restartCount).to.be.equal(spy.callCount - 1);
      expect(stats.locksLost).to.be.equal(0);
      expect(stats.contentionCount).to.be.equal(0);
      expect(stats.timeToAcquire).to.be.at.least(20);
      expect(spy.callCount).to.be.at.least(3);
    });
  });

  it('when contending for a lock and ultimately losing, it should restart', () => {
    const key = 'clientId';
    const fm = new FastMutex({ localStorage: localStorage, id: 'uniqueId' });
    const stub = sandbox.stub(fm, 'getItem')

    // Set up scenario for lock contention where we lost Y
    stub.onCall(0).returns(null)  // getItem Y
    stub.onCall(1).returns('lockcontention')  // getItem X
    stub.onCall(2).returns('youLostTheLock')  // getItem Y

    // fastmutex should have restarted, so let's free up the lock:
    stub.onCall(3).returns(null)
    stub.onCall(4).returns('uniqueId')

    const spy = sandbox.spy(fm, 'lock');

    return fm.lock(key).then((stats) => {
      expect(stats.restartCount).to.be.equal(1);
      expect(stats.locksLost).to.be.equal(1);
      expect(stats.contentionCount).to.be.equal(1);
      expect(stats.timeToAcquire).to.be.above(50);
      expect(spy.callCount).to.be.equal(2);
    });
  });

  it('When contending for a lock and ultimately winning, it should not restart', () => {
    const key = 'clientId';
    const fm = new FastMutex({ localStorage: localStorage, id: 'uniqueId' });
    const stub = sandbox.stub(fm, 'getItem')

    // Set up scenario for lock contention where we lost Y
    stub.onCall(0).returns(null)  // getItem Y
    stub.onCall(1).returns('lockContention');
    stub.onCall(2).returns('uniqueId');

    const spy = sandbox.spy(fm, 'lock');

    return fm.lock(key).then((stats) => {
      expect(stats.restartCount).to.be.equal(0);
      expect(stats.locksLost).to.be.equal(0);
      expect(stats.contentionCount).to.be.equal(1);
      expect(stats.timeToAcquire).to.be.above(50);
      expect(spy.callCount).to.be.equal(1);
    });
  });

  // This is just to ensure that the internals of FastMutex have prefixes on the
  // X and Y locks such that two different FM clients can acquire locks on
  // different keys concurrently without clashing.
  it('should not clash with other fastMutex locks', function () {
    const yPrefix = 'yLock';
    const xPrefix = 'xLock';
    const opts = { localStorage, yPrefix, xPrefix };

    const fm1 = new FastMutex(opts);
    const fm2 = new FastMutex(opts);

    let lock1Acquired = false;
    let lock2Acquired = false;

    const lock1Promise = fm1.lock('lock1').then((stats) => {
      lock1Acquired = true;
      expect(localStorage.getItem(yPrefix + 'lock1')).to.not.be.null;
      return stats;
    });

    const lock2Promise = fm2.lock('lock2').then((stats) => {
      lock2Acquired = true;
      expect(localStorage.getItem(yPrefix + 'lock2')).to.not.be.null;
      return stats
    });

    return Promise.all([lock1Promise, lock2Promise])
      .then((stats) => {
        expect(lock1Acquired).to.be.true;
        expect(lock2Acquired).to.be.true;
        expect(stats[0].restartCount).to.be.equal(0);
        expect(stats[1].restartCount).to.be.equal(0);
      });
  });

  it('release() should remove the y lock in localStorage', () => {
    const key = 'clientId';
    const fm1 = new FastMutex({ localStorage: localStorage, id: 'releaseTestId', yPrefix: 'yLock' });
    return fm1.lock(key).then(() => {
      expect(fm1.getItem('yLock' + key)).to.be.equal('releaseTestId');
      return fm1.release(key);
    }).then(() => {
      expect(fm1.getItem('yLock' + key)).to.be.null;
    })
  });

  // this is essentially just a better way to test that two locks cannot get
  // an exclusive lock until the other releases.  It's a bit more accurate
  // than the test above ("release should remove the y lock in localstorage")
  it('two clients should never get locks at the same time', function () {
    const fm1 = new FastMutex({ localStorage: localStorage });
    const fm2 = new FastMutex({ localStorage: localStorage });
    let fm1LockReleased = false;
    const lockHoldTime = 10;

    return fm1.lock('clientId').then(() => {
      // before the lock is released, try to establish another lock:
      var lock2Promise = fm2.lock('clientId');
      expect(fm1LockReleased).to.be.false;

      // in a few milliseconds, release the lock
      setTimeout(() => {
        fm1.release('clientId').then(() => fm1LockReleased = true)
      }, lockHoldTime);

      return lock2Promise;
    }).then((lock2) => {
      // this will only execute once the other lock was released
      expect(fm1LockReleased).to.be.true;
      expect(lock2.restartCount).to.be.above(1);
      expect(lock2.timeToAcquire).to.be.above(lockHoldTime);
    });
  });

  it('should throw if lock is never acquired after set time period', function () {
    this.timeout(1000);
    this.slow(500);

    const fm1 = new FastMutex({ localStorage: localStorage, timeout: 50 });
    const fm2 = new FastMutex({ localStorage: localStorage, timeout: 50 });

    const p = fm1.lock('timeoutTest').then(() => {
      // fm2 will never get a lock as we're not releasing fm1's lock:
      return fm2.lock('timeoutTest')
    });

    return expect(p).to.eventually.be.rejected;
  });

  it('should ignore expired locks', () => {
    const fm1 = new FastMutex({ localStorage: localStorage, timeout: 5000, yPrefix: 'yLock', id: 'timeoutClient' });
    const expiredRecord = {
      expiresAt: new Date().getTime() - 5000,
      value: 'oldclient'
    };

    localStorage.setItem('yLocktimeoutTest', JSON.stringify(expiredRecord));
    expect(JSON.parse(localStorage.getItem('yLocktimeoutTest')).value).to.be.equal('oldclient');
    return expect(fm1.lock('timeoutTest')).to.eventually.be.fulfilled;
  });
});
