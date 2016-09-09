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

class FastMutex {
  constructor ({ localStorageKey, id = randomId(), x = '_MUTEX_LOCK_X', y = '_MUTEX_LOCK_Y', localStorage }) {
    this.lsKey = localStorageKey
    this.id = id
    this.x = `${x}_${localStorageKey}`;
    this.y = `${y}_${localStorageKey}`;
    this.localStorage = localStorage || window.localStorage
  }

  lock (lsVal, fn) {
    return new Promise((resolve, reject) => {
      if (this.localStorage.getItem(this.lsKey)) {
        console.log('Already set. Skipping...');
        return resolve(this.localStorage.getItem(this.lsKey));
      }

      // set x to this unique ID
      this.localStorage.setItem(this.x, this.id);

      // if y exists, another client is getting a lock, so retry in a bit
      if (this.localStorage.getItem(this.y)) {
        console.error('locked.  restarting...');
        setTimeout(() => this.lock(lsVal).then(resolve));
      } else {
        this.localStorage.setItem(this.y, this.id);

        // if x was changed, another client is contending for a lock
        if (this.localStorage.getItem(this.x) !== this.id) {
          console.log('another client is contending for a lock');
          setTimeout(() => {
            if (this.localStorage.getItem(this.y) !== this.id) {
              setTimeout(() => this.lock(lsVal), 1)
            } else {
              // critical section
              console.error('critical section 1');
              this.localStorage.setItem(this.lsKey, lsVal);
              this.localStorage.removeItem(this.y);
              return resolve(this.lsVal);
            }
          }, 500)
        } else {
          console.log('critical section 2');
          console.log('remove', this.y);
          this.localStorage.setItem(this.lsKey, lsVal);
          this.localStorage.removeItem(this.y);
          return resolve(lsVal);
        }
      }
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
