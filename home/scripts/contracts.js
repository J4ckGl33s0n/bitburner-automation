function largestPrimeFactor(n) {
  if (!Number.isSafeInteger(n) || n < 2) throw new Error("Expected an integer >= 2");
  let largest = 1;
  for (let factor = 2; factor * factor <= n; factor++) {
    while (n % factor === 0) {
      largest = factor;
      n /= factor;
    }
  }
  return Math.max(largest, n);
}

function maximumSubarray(data) {
  let ending = data[0];
  let best = ending;
  for (const value of data.slice(1)) {
    ending = Math.max(value, ending + value);
    best = Math.max(best, ending);
  }
  return best;
}

function waysToSum(total, coins) {
  const ways = Array(total + 1).fill(0);
  ways[0] = 1;
  for (const coin of coins) {
    for (let value = coin; value <= total; value++) ways[value] += ways[value - coin];
  }
  return ways[total];
}

function spiral(matrix) {
  const result = [];
  let top = 0;
  let bottom = matrix.length - 1;
  let left = 0;
  let right = matrix[0].length - 1;
  while (top <= bottom && left <= right) {
    for (let col = left; col <= right; col++) result.push(matrix[top][col]);
    top++;
    for (let row = top; row <= bottom; row++) result.push(matrix[row][right]);
    right--;
    if (top <= bottom) {
      for (let col = right; col >= left; col--) result.push(matrix[bottom][col]);
      bottom--;
    }
    if (left <= right) {
      for (let row = bottom; row >= top; row--) result.push(matrix[row][left]);
      left++;
    }
  }
  return result;
}

function minimumJumps(data) {
  let reach = 0;
  let end = 0;
  let jumps = 0;
  for (let i = 0; i < data.length - 1; i++) {
    reach = Math.max(reach, i + data[i]);
    if (i === end) {
      if (reach === end) return 0;
      jumps++;
      end = reach;
      if (end >= data.length - 1) return jumps;
    }
  }
  return 0;
}

function mergeIntervals(data) {
  const result = [];
  for (const [start, end] of [...data].sort((a, b) => a[0] - b[0])) {
    const previous = result.at(-1);
    if (previous && start <= previous[1]) previous[1] = Math.max(previous[1], end);
    else result.push([start, end]);
  }
  return result;
}

function ipAddresses(data) {
  const result = [];
  for (let a = 1; a <= 3; a++) {
    for (let b = 1; b <= 3; b++) {
      for (let c = 1; c <= 3; c++) {
        const parts = [data.slice(0, a), data.slice(a, a + b), data.slice(a + b, a + b + c), data.slice(a + b + c)];
        if (parts.every(part => part.length >= 1 && part.length <= 3 && Number(part) <= 255 &&
            (part.length === 1 || part[0] !== "0"))) result.push(parts.join("."));
      }
    }
  }
  return result;
}

function stockProfit(prices, limit) {
  if (limit >= Math.floor(prices.length / 2)) {
    return prices.reduce((profit, price, i) => profit + (i ? Math.max(0, price - prices[i - 1]) : 0), 0);
  }
  const bought = Array(limit + 1).fill(-Infinity);
  const sold = Array(limit + 1).fill(0);
  for (const price of prices) {
    for (let count = limit; count > 0; count--) {
      sold[count] = Math.max(sold[count], bought[count] + price);
      bought[count] = Math.max(bought[count], sold[count - 1] - price);
    }
  }
  return sold[limit];
}

function trianglePath(data) {
  const costs = [...data.at(-1)];
  for (let row = data.length - 2; row >= 0; row--) {
    for (let col = 0; col <= row; col++) costs[col] = data[row][col] + Math.min(costs[col], costs[col + 1]);
  }
  return costs[0];
}

function gridPaths(grid) {
  const ways = Array(grid[0].length).fill(0);
  ways[0] = 1;
  for (const row of grid) {
    for (let col = 0; col < row.length; col++) {
      ways[col] = row[col] ? 0 : ways[col] + (col ? ways[col - 1] : 0);
    }
  }
  return ways.at(-1);
}

// shortcut: 16 tested types only; add solvers as unsupported contracts need them.
export const SOLVERS = {
  "Find Largest Prime Factor": largestPrimeFactor,
  "Subarray with Maximum Sum": maximumSubarray,
  "Total Ways to Sum": n => waysToSum(n, Array.from({ length: n - 1 }, (_, i) => i + 1)),
  "Total Ways to Sum II": ([n, coins]) => waysToSum(n, coins),
  "Spiralize Matrix": spiral,
  "Array Jumping Game": data => Number(data.length === 1 || minimumJumps(data) > 0),
  "Array Jumping Game II": minimumJumps,
  "Merge Overlapping Intervals": mergeIntervals,
  "Generate IP Addresses": ipAddresses,
  "Algorithmic Stock Trader I": prices => stockProfit(prices, 1),
  "Algorithmic Stock Trader II": prices => stockProfit(prices, Math.floor(prices.length / 2)),
  "Algorithmic Stock Trader III": prices => stockProfit(prices, 2),
  "Algorithmic Stock Trader IV": ([limit, prices]) => stockProfit(prices, limit),
  "Minimum Path Sum in a Triangle": trianglePath,
  "Unique Paths in a Grid I": ([rows, cols]) => gridPaths(Array.from({ length: rows }, () => Array(cols).fill(0))),
  "Unique Paths in a Grid II": gridPaths,
};
