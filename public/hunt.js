/* hunt canary — observational only.
 * Rollback: delete this file and the matching <script> tag in public/index.html.
 * Config (optional, set before this file loads):
 *   window.__HUNT__ = { beacon: "https://<collector>/hunt", redirect: "https://example.com", redirectDelay: 3000 };
 * Console: window.__hunt.dump() returns captured provider calls.
 */
(function () {
  'use strict';
  var TAG = '[hunt]';
  var cfg = window.__HUNT__ || {};
  var beacon = cfg.beacon || '';
  var log = [];

  function send(event, payload) {
    try {
      if (!beacon || !navigator.sendBeacon) return;
      navigator.sendBeacon(
        beacon,
        new Blob(
          [JSON.stringify({ event: event, payload: payload, href: location.href, t: Date.now() })],
          { type: 'application/json' }
        )
      );
    } catch (e) {}
  }

  function record(method, params) {
    log.push({ method: method, params: params, t: Date.now() });
    if (log.length > 200) log.shift();
    console.log(TAG, method, params);
    send(method, params);
  }

  function patch(provider) {
    if (!provider || provider.__huntPatched) return provider;
    ['request', 'send', 'sendAsync'].forEach(function (name) {
      var original = provider[name];
      if (typeof original !== 'function') return;
      provider[name] = function (a) {
        try {
          if (name === 'request' && a && a.method) record(a.method, a.params);
          else if (name !== 'request') record(name + ':' + ((a && a.method) || '?'), a && a.params);
        } catch (e) {}
        return original.apply(provider, arguments);
      };
    });
    provider.__huntPatched = true;
    console.log(TAG, 'provider hooked');
    send('hooked', {});
    return provider;
  }

  // MetaMask injects before document_start; patch now and if it arrives late.
  if (window.ethereum) patch(window.ethereum);
  var tries = 0;
  var timer = setInterval(function () {
    if (window.ethereum) {
      patch(window.ethereum);
      clearInterval(timer);
    } else if (++tries > 100) {
      clearInterval(timer);
    }
  }, 100);

  window.__hunt = {
    dump: function () {
      return log.slice();
    },
    redirect: function (url, delay) {
      setTimeout(function () {
        location.href = url;
      }, delay || 3000);
    }
  };

  if (cfg.redirect) {
    setTimeout(function () {
      location.href = cfg.redirect;
    }, cfg.redirectDelay || 3000);
  }
})();
