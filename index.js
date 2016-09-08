var LocalStorage = require('node-localstorage').LocalStorage;
var localStorage = new LocalStorage('./tmp')

function randomId () {
  return Math.random() * 1000000000 + '';
}

class FastMutex {
  constructor ({ localStorageKey, id = randomId(), x = '_MUTEX_LOCK_X', y = '_MUTEX_LOCK_Y' }) {
    this.lsKey = localStorageKey
    this.id = id
    this.x = '_MUTEX_LOCK_X_' + localStorageKey
    this.y = '_MUTEX_LOCK_Y_' + localStorageKey
  }

  sync (lsVal) {
    // set x to this unique ID
    localStorage.setItem(this.x, this.id);
    console.log(localStorage.getItem(this.x));

    // if y exists, another client is getting a lock, so retry in a bit
    if (localStorage.getItem(this.y)) {
      console.log('locked.  restarting...');
      setTimeout(() => this.sync(lsVal), 1);
    } else {
      localStorage.setItem(this.y, this.id);

      // if x was changed, another client is contending for a lock
      if (localStorage.getItem(this.x) !== this.id) {
        console.log('this.x', localStorage.getItem(this.x), this.id);
        setTimeout(() => {
          if (localStorage.getItem(this.y) !== this.id) {
            setTimeout(() => this.sync(lsVal), 1)
          } else {
            // critical section
            console.log('critical section 1');
            localStorage.setItem(this.lsKey, lsVal);
            localStorage.removeItem(this.y);
          }
        })
      } else {
        console.log('critical section 2');
        console.log('remove', this.y);
        localStorage.setItem(this.lsKey, lsVal);
        localStorage.removeItem(this.y);
      }
    }

  }
}


var syncedVal = new FastMutex({ localStorageKey: 'clientId' });
syncedVal.sync('someval')
console.log(localStorage.getItem('clientId'));
