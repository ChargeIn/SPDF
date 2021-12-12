/**
 * This decorator caches the results of a getter or method such that
 * the results are lazily computed once, and then cached.
 * @private
 */
export function cache(target, key, descriptor) {
  if (descriptor.get) {
    const get = descriptor.get;
    descriptor.get = function () {
      const value = get.call(this);
      Object.defineProperty(this, key, { value });
      return value;
    };
  } else if (typeof descriptor.value === 'function') {
    const fn = descriptor.value;

    return {
      get() {
        const cacheMap = new Map();
        function memoized(...args) {
          const k = args.length > 0 ? args[0] : 'value';
          if (cacheMap.has(k)) {
            return cacheMap.get(k);
          }

          const result = fn.apply(this, args);
          cacheMap.set(k, result);
          return result;
        }

        Object.defineProperty(this, key, { value: memoized });
        return memoized;
      },
    };
  }
}
