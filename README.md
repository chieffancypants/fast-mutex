# FastMutex
Implementation of FastMutex for mutual exclusion locks using LocalStorage.  Uses promises to make it more readable, especially when used with async/await.

### Installation

NPM:
```
$ npm install fast-mutex --save
```

Bower:
```
$ bower install fast-mutex --save
```


### Why is this necessary?
Mutual Exclusion locks are generally not necessary in javascript applications as they are single threaded. There are, however, exceptions. WebWorkers, multiple tabs (and perhaps iframes in the future) give us the ability to run multiple concurrent javascript processes, and therefore, may require the locking of resources to prevent race conditions.

Imagine the following scenario:

1. A user opens your webapp, starts a session which gets saved to localStorage
1. As they browse, they continue to open new tabs to various URLs within your application
1. The user exits the browser long enough for the session to expire
1. User launches the browser again, which restores the previous browser state, relaunching all the previous tabs
1. All open tabs on your webapp compete in attempting to create a new session at the same time

As contrived as this example sounds, it was the actual use-case for writing this library. That said, there are many scenarios where acquiring locks is required both in the Browser and in Node.

### Usage Example:
Using the previous scenario, let's assume we want to create a single session, that all browser tabs will share.

```js
import FastMutex from 'fast-mutex'

const mutex = new FastMutex()
mutex.lock('sessionId')
  .then(() => {
    // a lock has now been acquired

    if (localStorage.getItem('sessionId')) {
      // another process already established the session, so we can set that
      // somewhere within the webapp...
    } else {
      // no other process has established a session yet, so we'll create it now.
      // Because we have an exclusive lock, no other tabs/processes can create
      // a session, so they'll fall into the `if` condition above, and simply
      // re-use the session we create now:
      const sessionId = SessionAPI.create({ ... });
      localStorage.setItem('sessionId', sessionId);
    }

    // release the lock when you're done.
    return mutex.release('sessionId');
  }).catch((err) => {
    // ...
  })
```

## API
This is a promised-based API.  Both methods (`lock` and `release`) fulfill the promise with statistics about the lock acquisition process.  You can safely ignore these stats, or for extra credit, report it to your analytics/metrics service

```js
mutex.lock('sessionId').then((stats) => {
  // stats object contains:
  {
    restartCount: 0, // the number of times the lock process restarted
    locksLost: 0, // the number of times the lock lost to another process
    contentionCount: 0, // the number of times contending for a lock
    acquireStart: 1473872633183, // timestamp when acquisition request started
    acquireEnd: 1473872633186, // timestamp when acquisition request fulfilled
    acquireDuration: 3, // the total time taken to acquire the lock (in ms)
  }
  return mutex.release('sessionId');
}).then((stats) => {
  // lock release stats contains everything above:
  {
    restartCount: 0,
    locksLost: 0,
    contentionCount: 0,
    acquireStart: 1473872633183,
    acquireEnd: 1473872633186,
    acquireDuration: 3,

    // and also contains lock duration stats:
    lockStart: 1473872633186, // timestamp when lock was acquired
    lockEnd: 1473872633189, // timestamp when lock was released
    lockDuration: 3 // the total time the lock was held (in ms)
  }
});
```

### new FastMutex([opts])
Most options here won't be useful for most people, and are mostly useful for unit tests.  With ES6 destructuring, the options are pretty easy to see in the source, but here's a bit more detail about them:

```js
constructor ({
  clientId = randomId(),
  xPrefix = '_MUTEX_LOCK_X_',
  yPrefix = '_MUTEX_LOCK_Y_',
  timeout = 5000,
  localStorage
})
```

`opts` includes the following defaults:

- `clientId`:  Randomly Generated  
 Override the randomly generated ID.  Mostly useful for testing.

- `xPrefix`: "\_MUTEX\_LOCK\_X\_"  
 Set the prefix for the localStorage key when acquiring the outer lock (X)

- `yPrefix`: "\_MUTEX\_LOCK\_Y\_"  
 Set the prefix for the localStorage key when acquiring the inner lock (Y)

- `timeout`: 5000ms  
 Set the maximum time a lock can be held. This is necessary if the process exits prematurely while it held a lock (it was killed, crashed, the tab was closed, etc). Make sure whatever work you're doing takes less time than this

- `localStorage`: window.localStorage  
 Useful for testing in node (where there is no localStorage), and could also be used to replace the default localStorage with a library as long as the interface is the same.


### FastMutex.prototype.lock(key) -> Promise
Fulfills the promise when it acquires an exclusive lock. The `key` name is arbitrary, so just stay consistent and establish some convention.  A couple examples:

```js
// if you're trying to acquire a lock for a particular localStorage key, you
// can use the same key name:
fastMutex.lock('sessionId').then(() => {
  localStorage.setItem('sessionId', '1234');
});

// or separate it into domains:
fastMutex.lock('app:component:lock').then(() => {
  // ...
});
```


### FastMutex.prototype.release(key) -> Promise
Returns a promise that gets fulfilled once the lock on `key` is released.
