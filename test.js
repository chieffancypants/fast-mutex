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
    let len = localStorage.length;
    localStorage.clear();
    expect(localStorage.length).to.equal(0);
  });

  it('should immediately establish a lock when there is no contention', () => {
    var fm1 = new FastMutex({ localStorageKey: 'test', localStorage: localStorage });
    var fm2 = new FastMutex({ localStorageKey: 'test', localStorage: localStorage });

    return fm1.lock('clientId').then(() => {
      console.log(localStorage);
    })
  });

  it.only('When another client has a lock (Y is not 0), it should restart to acquire a lock at a later time', function () {
    this.timeout(10000)
    var fm1 = new FastMutex({ localStorageKey: 'test', localStorage: localStorage });
    let key = 'clientId';
    localStorage.setItem(`mutexlock_y_${key}`, 'abcd');

    setTimeout(() => {
      console.log('reset Y');
      localStorage.removeItem(`mutexlock_y_${key}`);
    }, 10);

    const lockPromise = fm1.lock(key);
    return expect(lockPromise).to.eventually.be.fulfilled;
  });


    //
    // return fm1.lock('clientId').then((boop) => {
    //   console.log('lock then', boop);
    //   return new Promise((resolve, reject) => {
    //     setTimeout(() => {
    //       // wait for a while so we can try and write something while we've acquired the lock
    //       // localStorage.setItem('mutexlock_y_clientId')
    //       fm2.lock('clientId').then((boopy) => {
    //         console.log('ooooey', boopy);
    //       })
    //       resolve();
    //     },1000);
    //   });
    // }).then((ret) => {
    //   return new Promise((resolve, reject) => {
    //     setTimeout(() => {
    //       console.log('Releasing lock...', ret);
    //       fm1.release();
    //     }, 1000)
    //   })
    // })

    // fm.lock('clientId', () => {
    //   // do stuff now that we have a lock
    //   if (!localStorage.getItem('clientId')) {
    //     localStorage.setItem('clientId', 'randomId');
    //   }
    // }).then(() => {
    //   // clean up anything now that the lock has been released
    // });


    // TODO: not async:
    // fm.sync('hooray');
    // expect(localStorage.getItem('test')).to.equal('hooray');
  // });

  describe('When another client has a lock (Y is not 0)', () => {
    it('should restart', () => {
      localStorage.setItem('_MUTEX_LOCK_Y_test', 'abcd');
      const fm = new FastMutex({ localStorageKey: 'test', localStorage: localStorage });
      const promise = fm.sync('hooray');
      localStorage.setItem('')
      localStorage.removeItem('_MUTEX_LOCK_Y_test');
      return expect(promise).to.eventually.be.fulfilled;
    });
  });

  describe('When ', () => {
    it('should ', () => {
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
