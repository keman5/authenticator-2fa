/* Authenticator - 2FA · content script: receives FILL_CODE from the popup
   and types the code into the page's verification-code input. */
(function () {
  'use strict';
  if (window.__auth2faContent) return;
  window.__auth2faContent = true;

  function setNativeValue(el, value) {
    var proto = el instanceof HTMLTextAreaElement
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
    var setter = Object.getOwnPropertyDescriptor(proto, 'value');
    if (setter && setter.set) setter.set.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function findTarget() {
    var ae = document.activeElement;
    if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) return ae;
    var byAuto = document.querySelector('input[autocomplete="one-time-code"]');
    if (byAuto) return byAuto;
    var inputs = Array.prototype.slice.call(document.querySelectorAll('input'));
    var cand = inputs.filter(function (i) {
      var t = (i.type || 'text').toLowerCase();
      if (['hidden', 'password', 'checkbox', 'radio', 'submit', 'button', 'file'].indexOf(t) >= 0) return false;
      var hint = ((i.name || '') + ' ' + (i.id || '') + ' ' + (i.placeholder || '') + ' ' + (i.getAttribute('aria-label') || '')).toLowerCase();
      return /otp|code|2fa|totp|verify|verification|验证码|認証|確認/.test(hint);
    });
    if (cand.length) return cand[0];
    var visible = inputs.filter(function (i) {
      var t = (i.type || 'text').toLowerCase();
      return ['text', 'tel', 'number', ''].indexOf(t) >= 0 && i.offsetParent !== null;
    });
    return visible[0] || null;
  }

  chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    if (!msg || msg.type !== 'FILL_CODE') return;
    var target = findTarget();
    if (!target) { sendResponse({ ok: false, reason: 'no-input' }); return; }
    target.focus();
    setNativeValue(target, msg.code);
    sendResponse({ ok: true });
  });
})();
