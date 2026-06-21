(function () {
  const g = typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : this;

  try {
    if (g && g.crypto && typeof g.crypto.randomUUID === "function") {
      return;
    }

    const hasGetRandomValues = !!(g && g.crypto && typeof g.crypto.getRandomValues === "function");

    const getRandomBytes = (buf) => {
      if (hasGetRandomValues) {
        return g.crypto.getRandomValues(buf);
      }
      for (let i = 0; i < buf.length; i++) buf[i] = Math.floor(Math.random() * 256);
      return buf;
    };

    const randomUUIDPolyfill = () => {
      const bytes = new Uint8Array(16);
      getRandomBytes(bytes);
      // Per RFC4122 v4
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0"));
      return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex
        .slice(6, 8)
        .join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10, 16).join("")}`;
    };

    if (!g.crypto) {
      try {
        // Try to create crypto object if not present
        Object.defineProperty(g, "crypto", {
          value: {},
          configurable: true,
          enumerable: false,
          writable: true,
        });
      } catch (err) {
        // ignore
      }
    }

    if (g.crypto && typeof g.crypto.randomUUID !== "function") {
      try {
        Object.defineProperty(g.crypto, "randomUUID", {
          value: randomUUIDPolyfill,
          configurable: true,
          writable: true,
        });
      } catch (err) {
        // fallback assignment
        try {
          g.crypto.randomUUID = randomUUIDPolyfill;
        } catch (er) {
          // give up silently
        }
      }
    }
  } catch (e) {
    // no-op
  }
})();
