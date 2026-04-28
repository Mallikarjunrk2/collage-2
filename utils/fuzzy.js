// simple similarity score
export function similarity(a, b) {
  a = a.toLowerCase();
  b = b.toLowerCase();

  let matches = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i] === b[i]) matches++;
  }

  return matches / Math.max(a.length, b.length);
}

// find best match
export function findBestMatch(input, options = []) {
  let best = null;
  let bestScore = 0;

  for (const opt of options) {
    const score = similarity(input, opt);

    if (score > bestScore) {
      bestScore = score;
      best = opt;
    }
  }

  return bestScore > 0.4 ? best : null;
}
