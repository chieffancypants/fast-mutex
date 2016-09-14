
const debug = require('debug')('FastMutex');

/**
 * Helper function to create a randomId to distinguish between different
 * FastMutex clients.  localStorage uses strings, so explicitly cast to string:
 */
const randomId = () => Math.random() + '';

/**
 * Helper function to calculate the endTime, lock acquisition time, and then
 * resolve the promise with all the lock stats
 */
const resolveWithStats = (resolve, stats) => {
  stats.endTime = new Date().getTime();
  stats.timeToAcquire = stats.endTime - stats.startTime;
  resolve(stats);
}


// TODO: Rename ID to clientId
class FastMutex {
  constructor ({ id = randomId(), xPrefix = '_MUTEX_LOCK_X_', yPrefix = '_MUTEX_LOCK_Y_', timeout = 5000, localStorage }) {
    this.id = id
    this.xPrefix = xPrefix;
    this.yPrefix = yPrefix;
    this.timeout = timeout;

    this.localStorage = localStorage || window.localStorage
    this.lockStats = {
      restartCount: 0,
      locksLost: 0,
      contentionCount: 0,
      timeToAcquire: 0,
      startTime: null
    };
  }

  lock (key) {
    debug('Attempting to acquire Lock on "%s" using FastMutex instance "%s"', key, this.id)
    const x = this.xPrefix + key;
    const y = this.yPrefix + key;

    if (!this.lockStats.startTime) {
      this.lockStats.startTime = new Date().getTime();
    }

    return new Promise((resolve, reject) => {
      const elapsedTime = new Date().getTime() - this.lockStats.startTime;
      if (elapsedTime >= this.timeout) {
        debug('Lock on "%s" could not be acquired by FastMutex client "%s"', key, this.id);
        return reject(`Lock could not be acquired within ${this.timeout}ms`);
      }

      this.localStorage.setItem(x, this.id);

      // if y exists, another client is getting a lock, so retry in a bit
      let lsY = this.localStorage.getItem(y);
      if (lsY) {
        debug('Lock exists on Y (%s), restarting...', lsY);
        this.lockStats.restartCount++;
        setTimeout(() => this.lock(key).then(resolve).catch(reject));
        return;
      }

      // ask for inner lock
      this.localStorage.setItem(y, this.id);

      // if x was changed, another client is contending for an inner lock
      let lsX = this.localStorage.getItem(x);
      if (lsX !== this.id) {
        this.lockStats.contentionCount++;
        debug('Lock contention detected. X="%s"', lsX);

        // Give enough time for critical section:
        setTimeout(() => {
          lsY = this.localStorage.getItem(y);
          if (lsY !== this.id) {
            // we lost the lock, restart the process again
            this.lockStats.restartCount++;
            this.lockStats.locksLost++;
            debug('FastMutex client "%s" lost the lock contention on "%s" to another process (%s). Restarting...', this.id, key, lsY)
            setTimeout(() => this.lock(key).then(resolve).catch(reject));
            return;
          } else {
            // we have a lock
            debug('FastMutex client "%s" won the lock contention on "%s"', this.id, key);
            resolveWithStats(resolve, this.lockStats)
          }
        }, 50);
        return;
      }

      // no contention:
      debug('FastMutex client "%s" acquired a lock on "%s" with no contention', this.id, key);
      resolveWithStats(resolve, this.lockStats);
    })
  }

  release (key) {
    debug('FastMutex client "%s" is releasing lock on "%s"', this.id, key);
    const y = this.yPrefix + key;
    return new Promise((resolve, reject) => {
      this.localStorage.removeItem(y);
      resolve();
    });
  }

  /**
   * Helper function to wrap all values in an object that includes the time (so
   * that we can expire it in the future) and json.stringify's it
   */
  setItem (key, value) {
    return this.localStorage.setItem(key, JSON.stringify({
      expiresAt: new Date().getTime() + this.timeout,
      value
    }));
  }

  /**
   * Helper function to parse JSON encoded values set in localStorage
   */
  getItem (key) {
    return JSON.parse(this.localStorage.getItem(key));
  }

}

module.exports = FastMutex;
