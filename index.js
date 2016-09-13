// var LocalStorage = require('node-localstorage').LocalStorage;
// var localStorage = new LocalStorage('./tmp')


function busyLoop (ms) {
  var start = new Date().getTime();
  for (var i = 0; i < 1e7; i++) {
    if ((new Date().getTime() - start) > ms) {
      break;
    }
  }
}

function randomId () {
  return Math.random() * 1000000000 + '';
}

function resolveWithStats (resolve, stats) {
  stats.endTime = new Date().getTime();
  stats.timeToAcquire = stats.endTime - stats.startTime;
  resolve(stats);
}

class FastMutex {
  constructor ({ localStorageKey, id = randomId(), x = '_MUTEX_LOCK_X', y = '_MUTEX_LOCK_Y', localStorage }) {
    this.lsKey = localStorageKey
    this.id = id
    this.x = `${x}_${localStorageKey}`;
    this.y = `${y}_${localStorageKey}`;
    this.localStorage = localStorage || window.localStorage
    this.lockStats = {
      restartCount: 0,
      locksLost: 0,
      contentionCount: 0,
      timeToAcquire: 0,
      startTime: null
    };
  }

  // TODO: should record number of runs, locks, contentions, etc and return in stats property of promise resolution
  lock (key, id, localStorage) {
    localStorage = localStorage || this.localStorage;
    id = id || 'randomId';

    if (!this.lockStats.startTime) {
      this.lockStats.startTime = new Date().getTime();
    }

    return new Promise((resolve, reject) => {
      let x = `mutexlock_x_${key}`;
      let y = `mutexlock_y_${key}`;

      // console.log('acquireLock', key, localStorage.getItem(x));
      localStorage.setItem(x, id);

      // if y exists, another client is getting a lock, so retry in a bit
      let lsY = localStorage.getItem(y);
      if (lsY) {
        console.error('locked.  restarting...', lsY);
        this.lockStats.restartCount++;
        setTimeout(() => this.lock(key, id, localStorage).then(resolve));
        return;
      }

      // ask for inner lock
      localStorage.setItem(y, id);

      // if x was changed, another client is contending for an inner lock
      let lsX = localStorage.getItem(x);
      if (lsX !== id) {
        this.lockStats.contentionCount++;
        console.log('lsx !== id', lsX, id);
        // Give enough time for critical section:
        setTimeout(() => {
          if (localStorage.getItem(y) !== id) {
            this.lockStats.restartCount++;
            this.lockStats.locksLost++;
            console.log('lock was lost, restarting...');
            // we lost the lock, restart the process again
            setTimeout(() => this.lock(key, id, localStorage).then(resolve));
            return;
          } else {
            // we have a lock
            resolveWithStats(resolve, this.lockStats)
            console.log('we gots a lock');
          }
        }, 50);
        return;
      }

      // no contention:
      console.log('aquired lock without contention');
      resolveWithStats(resolve, this.lockStats);
    })
  }

  release (key) {
    let y = `mutexlock_y_${key}`;
    return new Promise((resolve, reject) => {
      return this.localStorage.setItem(key, 0);
    });
  }

}

module.exports = FastMutex;

// setTimeout(() => {
//   document.body.innerHTML = 'BUSYLOOP';
//   busyLoop(1000);
//   document.body.innerHTML = 'BUSYLOOP2';
//
//   var syncedVal = new FastMutex({ localStorageKey: 'clientId' });
//   syncedVal.sync(Math.ceil(randomId()));
//   // var body = document.body.innerHTML = localStorage.getItem('clientId')
//   var body = document.body.innerHTML = syncedVal.id;
// });
