/** Temporary entry point while an incompatible database migration is applied. */
export default {
  fetch() {
    return new Response("系統維護中，請稍後重新整理。", {
      status: 503,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Retry-After": "120",
        "Cache-Control": "no-store",
      },
    });
  },
};
