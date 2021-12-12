export function binarySearch(arr, cmp) {
  let min = 0;
  let max = arr.length - 1;
  while (min <= max) {
    const mid = (min + max) >> 1;
    const res = cmp(arr[mid]);

    if (res < 0) {
      max = mid - 1;
    } else if (res > 0) {
      min = mid + 1;
    } else {
      return mid;
    }
  }

  return -1;
}

export function range(index, end) {
  const r = [];
  while (index < end) {
    r.push(index++);
  }
  return r;
}
