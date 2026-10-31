// Unit tests must never reach the real TinyFish API (it would spend credits).
// Live tests use vitest.live.config.ts, which does not load this file.
delete process.env.TINYFISH_API_KEY;
