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

function shortestPath(grid) {
  if (grid[0][0] || grid.at(-1).at(-1)) return "";
  const queue = [[0, 0, ""]];
  const seen = new Set(["0,0"]);
  for (let i = 0; i < queue.length; i++) {
    const [row, col, path] = queue[i];
    if (row === grid.length - 1 && col === grid[0].length - 1) return path;
    for (const [dr, dc, step] of [[-1, 0, "U"], [1, 0, "D"], [0, -1, "L"], [0, 1, "R"]]) {
      const r = row + dr;
      const c = col + dc;
      const key = `${r},${c}`;
      if (r >= 0 && r < grid.length && c >= 0 && c < grid[0].length && !grid[r][c] && !seen.has(key)) {
        seen.add(key);
        queue.push([r, c, path + step]);
      }
    }
  }
  return "";
}

function graphColors([count, edges]) {
  const adjacent = Array.from({ length: count }, () => []);
  for (const [a, b] of edges) { adjacent[a].push(b); adjacent[b].push(a); }
  const colors = Array(count).fill(-1);
  for (let start = 0; start < count; start++) {
    if (colors[start] !== -1) continue;
    colors[start] = 0;
    const queue = [start];
    for (let i = 0; i < queue.length; i++) {
      const node = queue[i];
      for (const next of adjacent[node]) {
        if (colors[next] === colors[node]) return [];
        if (colors[next] === -1) {
          colors[next] = 1 - colors[node];
          queue.push(next);
        }
      }
    }
  }
  return colors;
}

function sanitizeParentheses(text) {
  let left = 0;
  let right = 0;
  for (const char of text) {
    if (char === "(") left++;
    if (char === ")") { if (left) left--; else right++; }
  }
  const answers = new Set();
  function visit(index, balance, removeLeft, removeRight, result) {
    if (index === text.length) {
      if (!balance && !removeLeft && !removeRight) answers.add(result);
      return;
    }
    const char = text[index];
    if (char === "(") {
      if (removeLeft) visit(index + 1, balance, removeLeft - 1, removeRight, result);
      visit(index + 1, balance + 1, removeLeft, removeRight, result + char);
    } else if (char === ")") {
      if (removeRight) visit(index + 1, balance, removeLeft, removeRight - 1, result);
      if (balance) visit(index + 1, balance - 1, removeLeft, removeRight, result + char);
    } else visit(index + 1, balance, removeLeft, removeRight, result + char);
  }
  visit(0, 0, left, right, "");
  return [...answers];
}

function mathExpressions([digits, target]) {
  const answers = [];
  function visit(index, expression, total, last) {
    if (index === digits.length) {
      if (expression && total === target) answers.push(expression);
      return;
    }
    for (let end = index + 1; end <= digits.length; end++) {
      if (end > index + 1 && digits[index] === "0") break;
      const token = digits.slice(index, end);
      const value = Number(token);
      if (index === 0) visit(end, token, value, value);
      else {
        visit(end, `${expression}+${token}`, total + value, value);
        visit(end, `${expression}-${token}`, total - value, -value);
        visit(end, `${expression}*${token}`, total - last + last * value, last * value);
      }
    }
  }
  visit(0, "", 0, 0);
  return answers;
}

function hammingEncode(value) {
  const data = value.toString(2);
  let parity = 0;
  while (2 ** parity < data.length + parity + 1) parity++;
  const bits = Array(data.length + parity + 1).fill(0);
  let next = 0;
  for (let i = 1; i < bits.length; i++) {
    if ((i & (i - 1)) !== 0) bits[i] = Number(data[next++]);
  }
  let syndrome = 0;
  for (let i = 1; i < bits.length; i++) if (bits[i]) syndrome ^= i;
  for (let i = 0; i < parity; i++) bits[2 ** i] = (syndrome >> i) & 1;
  bits[0] = bits.reduce((sum, bit) => sum + bit, 0) % 2;
  return bits.join("");
}

function hammingDecode(text) {
  const bits = [...text].map(Number);
  let syndrome = 0;
  for (let i = 1; i < bits.length; i++) if (bits[i]) syndrome ^= i;
  if (syndrome) bits[syndrome] ^= 1;
  const data = bits.filter((_, i) => i > 0 && (i & (i - 1)) !== 0).join("");
  return parseInt(data, 2);
}

function rleCompress(text) {
  let result = "";
  for (let i = 0; i < text.length;) {
    let length = 1;
    while (length < 9 && text[i + length] === text[i]) length++;
    result += `${length}${text[i]}`;
    i += length;
  }
  return result;
}

function lzDecompress(text) {
  let result = "";
  let literal = true;
  for (let i = 0; i < text.length; literal = !literal) {
    const length = Number(text[i++]);
    if (!Number.isInteger(length) || length < 0 || length > 9) throw new Error("Invalid LZ chunk length");
    if (length === 0) continue;
    if (literal) {
      if (i + length > text.length) throw new Error("Truncated LZ literal");
      result += text.slice(i, i + length);
      i += length;
    } else {
      const distance = Number(text[i++]);
      if (!Number.isInteger(distance) || distance < 1 || distance > 9 || distance > result.length) {
        throw new Error("Invalid LZ back-reference");
      }
      for (let j = 0; j < length; j++) result += result[result.length - distance];
    }
  }
  return result;
}

function lzCompress(text) {
  const best = Array.from({ length: text.length + 1 }, () => [null, null]);
  best[0][0] = "";
  function keep(position, mode, encoded) {
    if (best[position][mode] === null || encoded.length < best[position][mode].length) best[position][mode] = encoded;
  }
  for (let position = 0; position <= text.length; position++) {
    // A zero chunk switches mode without consuming input; two switches cannot improve length.
    for (let mode = 0; mode < 2; mode++) {
      if (best[position][mode] !== null) keep(position, 1 - mode, best[position][mode] + "0");
    }
    for (let length = 1; length <= 9 && position + length <= text.length; length++) {
      if (best[position][0] !== null) keep(position + length, 1, best[position][0] + length + text.slice(position, position + length));
      if (best[position][1] === null) continue;
      for (let distance = 1; distance <= 9 && distance <= position; distance++) {
        if (Array.from({ length }, (_, i) => text[position + i] === text[position + i - distance]).every(Boolean)) {
          keep(position + length, 0, best[position][1] + length + distance);
        }
      }
    }
  }
  return best[text.length].filter(value => value !== null).sort((a, b) => a.length - b.length)[0];
}

function caesarCipher([text, shift]) {
  return [...text].map(char => char === " " ? char : String.fromCharCode(65 + (char.charCodeAt(0) - 65 - shift + 26) % 26)).join("");
}

function vigenereCipher([text, key]) {
  return [...text].map((char, i) => String.fromCharCode(65 + (char.charCodeAt(0) + key.charCodeAt(i % key.length) - 130) % 26)).join("");
}

function squareRoot(value) {
  if (typeof value !== "bigint" || value < 0n) throw new Error("Expected a nonnegative BigInt");
  if (value < 2n) return value.toString();
  let root = 1n << BigInt(Math.ceil(value.toString(2).length / 2));
  while (true) {
    const next = (root + value / root) / 2n;
    if (next >= root) break;
    root = next;
  }
  return (value - root * root > root ? root + 1n : root).toString();
}

function primeCount([low, high]) {
  const composite = new Uint8Array(high + 1);
  for (let prime = 2; prime * prime <= high; prime++) {
    if (composite[prime]) continue;
    for (let value = prime * prime; value <= high; value += prime) composite[value] = 1;
  }
  let count = 0;
  for (let value = Math.max(2, low); value <= high; value++) if (!composite[value]) count++;
  return count;
}

function largestRectangle(grid) {
  const heights = Array(grid[0].length).fill(0);
  let area = 0;
  let corners = null;
  for (let row = 0; row < grid.length; row++) {
    for (let col = 0; col < heights.length; col++) heights[col] = grid[row][col] ? 0 : heights[col] + 1;
    for (let left = 0; left < heights.length; left++) {
      let height = heights[left];
      for (let right = left; right < heights.length; right++) {
        height = Math.min(height, heights[right]);
        if (height * (right - left + 1) > area) {
          area = height * (right - left + 1);
          corners = [[row - height + 1, left], [row, right]];
        }
      }
    }
  }
  if (!corners) throw new Error("Matrix has no empty rectangle");
  return corners;
}

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
  "Shortest Path in a Grid": shortestPath,
  "Sanitize Parentheses in Expression": sanitizeParentheses,
  "Find All Valid Math Expressions": mathExpressions,
  "HammingCodes: Integer to Encoded Binary": hammingEncode,
  "HammingCodes: Encoded Binary to Integer": hammingDecode,
  "Proper 2-Coloring of a Graph": graphColors,
  "Compression I: RLE Compression": rleCompress,
  "Compression II: LZ Decompression": lzDecompress,
  "Compression III: LZ Compression": lzCompress,
  "Encryption I: Caesar Cipher": caesarCipher,
  "Encryption II: Vigenère Cipher": vigenereCipher,
  "Square Root": squareRoot,
  "Total Number of Primes": primeCount,
  "Largest Rectangle in a Matrix": largestRectangle,
};
