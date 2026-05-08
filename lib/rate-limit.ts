import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

type RateLimitResult = { success: boolean; reset: number };

// No-op limiter used when Upstash env vars are absent (local dev).
const noopLimiter = {
  limit: async (_key: string): Promise<RateLimitResult> => ({
    success: true,
    reset: 0,
  }),
};

function createLimiter() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    return noopLimiter;
  }

  const redis = new Redis({ url, token });

  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(10, "1 m"),
    prefix: "ratelimit:chat",
  });
}

export const chatRateLimiter = createLimiter();
