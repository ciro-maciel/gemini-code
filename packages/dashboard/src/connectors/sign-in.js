/** Opens the provider's sign-in in a window that closes itself on return. */
export function openSignIn(url) {
  return window.open(url, 'assistant-sign-in', 'width=560,height=760');
}

/** When the sign-in window closes, calls `done`: the person finished, cancelled or just closed it. */
export function whenClosed(popup, done) {
  if (!popup) return done();
  const timer = setInterval(() => {
    if (!popup.closed) return;
    clearInterval(timer);
    done();
  }, 600);
}
