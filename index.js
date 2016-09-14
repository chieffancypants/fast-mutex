
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
  const currentTime = new Date().getTime();
  stats.acquireEnd = currentTime;
  stats.acquireDuration = stats.acquireEnd - stats.acquireStart;
  stats.lockStart = currentTime;
  resolve(stats);
};


class FastMutex {
  constructor ({ clientId = randomId(), xPrefix = '_MUTEX_LOCK_X_', yPrefix = '_MUTEX_LOCK_Y_', timeout = 5000, localStorage }) {
    this.clientId = clientId;
    this.xPrefix = xPrefix;
    this.yPrefix = yPrefix;
    this.timeout = timeout;

    this.localStorage = localStorage || window.localStorage;
    this.lockStats = {
      restartCount: 0,
      locksLost: 0,
      contentionCount: 0,
      acquireDuration: 0,
      acquireStart: null
    };
  }

  lock (key) {
    debug('Attempting to acquire Lock on "%s" using FastMutex instance "%s"', key, this.clientId);
    const x = this.xPrefix + key;
    const y = this.yPrefix + key;

    if (!this.lockStats.acquireStart) {
      this.lockStats.acquireStart = new Date().getTime();
    }

    return new Promise((resolve, reject) => {
      const elapsedTime = new Date().getTime() - this.lockStats.acquireStart;
      if (elapsedTime >= this.timeout) {
        debug('Lock on "%s" could not be acquired by FastMutex client "%s"', key, this.clientId);
        return reject(new Error(`Lock could not be acquired within ${this.timeout}ms`));
      }

      this.setItem(x, this.clientId);

      // if y exists, another client is getting a lock, so retry in a bit
      let lsY = this.getItem(y);
      if (lsY) {
        debug('Lock exists on Y (%s), restarting...', lsY);
        this.lockStats.restartCount++;
        setTimeout(() => this.lock(key).then(resolve).catch(reject));
        return;
      }

      // ask for inner lock
      this.setItem(y, this.clientId);

      // if x was changed, another client is contending for an inner lock
      let lsX = this.getItem(x);
      if (lsX !== this.clientId) {
        this.lockStats.contentionCount++;
        debug('Lock contention detected. X="%s"', lsX);

        // Give enough time for critical section:
        setTimeout(() => {
          lsY = this.getItem(y);
          if (lsY === this.clientId) {
            // we have a lock
            debug('FastMutex client "%s" won the lock contention on "%s"', this.clientId, key);
            resolveWithStats(resolve, this.lockStats);
          } else {
            // we lost the lock, restart the process again
            this.lockStats.restartCount++;
            this.lockStats.locksLost++;
            debug('FastMutex client "%s" lost the lock contention on "%s" to another process (%s). Restarting...', this.clientId, key, lsY);
            setTimeout(() => this.lock(key).then(resolve).catch(reject));
          }
        }, 50);
        return;
      }

      // no contention:
      debug('FastMutex client "%s" acquired a lock on "%s" with no contention', this.clientId, key);
      resolveWithStats(resolve, this.lockStats);
    });
  }

  release (key) {
    debug('FastMutex client "%s" is releasing lock on "%s"', this.clientId, key);
    const y = this.yPrefix + key;
    return new Promise((resolve) => {
      this.localStorage.removeItem(y);
      this.lockStats.lockEnd = new Date().getTime();
      this.lockStats.lockDuration = this.lockStats.lockEnd - this.lockStats.lockStart;
      resolve(this.lockStats);
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
    const item = this.localStorage.getItem(key);
    if (!item) return null;

    const parsed = JSON.parse(item);
    if (new Date().getTime() - parsed.expiresAt >= this.timeout) {
      debug('FastMutex client "%s" removed an expired record on "%s"', this.clientId, key);
      this.localStorage.removeItem(key);
      return null;
    }

    return JSON.parse(item).value;
  }

}

module.exports = FastMutex;
