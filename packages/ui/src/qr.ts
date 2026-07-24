const version = 5;
const moduleSize = 17 + version * 4;
const dataCodewords = 108;
const errorCorrectionCodewords = 26;
const maxDataBytes = 106;
const quietZone = 4;

interface MatrixBuild {
  modules: boolean[][];
  reserved: boolean[][];
}

export interface QrMatrix {
  modules: boolean[];
  size: number;
}

export function createQrMatrix(text: string): QrMatrix {
  const bytes = Array.from(new TextEncoder().encode(text));

  if (bytes.length > maxDataBytes) {
    throw new Error(`QR data is too long. Maximum ${maxDataBytes} bytes.`);
  }

  const data = createDataCodewords(bytes);
  const errorCorrection = createErrorCorrectionCodewords(
    data,
    errorCorrectionCodewords
  );
  const bits = codewordsToBits([...data, ...errorCorrection]);
  let bestMatrix: boolean[][] | null = null;
  let bestPenalty = Number.POSITIVE_INFINITY;

  for (let mask = 0; mask < 8; mask += 1) {
    const matrix = buildMatrix(bits, mask);
    const penalty = calculatePenalty(matrix);

    if (penalty < bestPenalty) {
      bestMatrix = matrix;
      bestPenalty = penalty;
    }
  }

  return addQuietZone(bestMatrix ?? buildMatrix(bits, 0));
}

function createDataCodewords(bytes: number[]) {
  const bits: boolean[] = [];

  appendBits(bits, 0b0100, 4);
  appendBits(bits, bytes.length, 8);

  for (const byte of bytes) {
    appendBits(bits, byte, 8);
  }

  const capacityBits = dataCodewords * 8;
  const terminatorBits = Math.min(4, capacityBits - bits.length);

  appendBits(bits, 0, terminatorBits);

  while (bits.length % 8 !== 0) {
    bits.push(false);
  }

  const codewords: number[] = [];

  for (let index = 0; index < bits.length; index += 8) {
    codewords.push(bitsToNumber(bits.slice(index, index + 8)));
  }

  for (let padIndex = 0; codewords.length < dataCodewords; padIndex += 1) {
    codewords.push(padIndex % 2 === 0 ? 0xec : 0x11);
  }

  return codewords;
}

function appendBits(output: boolean[], value: number, length: number) {
  for (let index = length - 1; index >= 0; index -= 1) {
    output.push(((value >>> index) & 1) === 1);
  }
}

function bitsToNumber(bits: boolean[]) {
  return bits.reduce((value, bit) => (value << 1) | (bit ? 1 : 0), 0);
}

function codewordsToBits(codewords: number[]) {
  const bits: boolean[] = [];

  for (const codeword of codewords) {
    appendBits(bits, codeword, 8);
  }

  return bits;
}

function buildMatrix(dataBits: boolean[], mask: number) {
  const { modules, reserved } = createFunctionPatternMatrix();
  let bitIndex = 0;
  let upward = true;

  for (let right = moduleSize - 1; right >= 1; right -= 2) {
    if (right === 6) {
      right -= 1;
    }

    for (let vertical = 0; vertical < moduleSize; vertical += 1) {
      const y = upward ? moduleSize - 1 - vertical : vertical;

      for (let columnOffset = 0; columnOffset < 2; columnOffset += 1) {
        const x = right - columnOffset;

        if (reserved[y][x]) {
          continue;
        }

        let dark = dataBits[bitIndex] ?? false;
        bitIndex += 1;

        if (shouldMask(mask, x, y)) {
          dark = !dark;
        }

        modules[y][x] = dark;
      }
    }

    upward = !upward;
  }

  drawFormatBits(modules, reserved, mask);

  return modules;
}

function createFunctionPatternMatrix(): MatrixBuild {
  const modules = createSquareMatrix(false);
  const reserved = createSquareMatrix(false);

  const setFunctionModule = (x: number, y: number, dark: boolean) => {
    if (!isInBounds(x, y)) {
      return;
    }

    modules[y][x] = dark;
    reserved[y][x] = true;
  };

  drawFinderPattern(setFunctionModule, 0, 0);
  drawFinderPattern(setFunctionModule, moduleSize - 7, 0);
  drawFinderPattern(setFunctionModule, 0, moduleSize - 7);
  drawAlignmentPattern(setFunctionModule, 30, 30);
  drawTimingPatterns(setFunctionModule);
  drawFormatBits(modules, reserved, 0);

  setFunctionModule(8, moduleSize - 8, true);

  return { modules, reserved };
}

function createSquareMatrix<T>(value: T) {
  return Array.from({ length: moduleSize }, () =>
    Array.from({ length: moduleSize }, () => value)
  );
}

function drawFinderPattern(
  setFunctionModule: (x: number, y: number, dark: boolean) => void,
  left: number,
  top: number
) {
  for (let y = -1; y <= 7; y += 1) {
    for (let x = -1; x <= 7; x += 1) {
      const isPattern = x >= 0 && x <= 6 && y >= 0 && y <= 6;
      const isDark =
        isPattern &&
        (x === 0 ||
          x === 6 ||
          y === 0 ||
          y === 6 ||
          (x >= 2 && x <= 4 && y >= 2 && y <= 4));

      setFunctionModule(left + x, top + y, isDark);
    }
  }
}

function drawAlignmentPattern(
  setFunctionModule: (x: number, y: number, dark: boolean) => void,
  centerX: number,
  centerY: number
) {
  for (let y = -2; y <= 2; y += 1) {
    for (let x = -2; x <= 2; x += 1) {
      const distance = Math.max(Math.abs(x), Math.abs(y));
      setFunctionModule(centerX + x, centerY + y, distance === 0 || distance === 2);
    }
  }
}

function drawTimingPatterns(
  setFunctionModule: (x: number, y: number, dark: boolean) => void
) {
  for (let index = 8; index < moduleSize - 8; index += 1) {
    const dark = index % 2 === 0;
    setFunctionModule(index, 6, dark);
    setFunctionModule(6, index, dark);
  }
}

function drawFormatBits(
  modules: boolean[][],
  reserved: boolean[][],
  mask: number
) {
  const bits = getFormatBits(mask);
  const set = (x: number, y: number, index: number) => {
    modules[y][x] = ((bits >>> index) & 1) === 1;
    reserved[y][x] = true;
  };

  for (let index = 0; index <= 5; index += 1) {
    set(8, index, index);
  }

  set(8, 7, 6);
  set(8, 8, 7);
  set(7, 8, 8);

  for (let index = 9; index < 15; index += 1) {
    set(14 - index, 8, index);
  }

  for (let index = 0; index < 8; index += 1) {
    set(moduleSize - 1 - index, 8, index);
  }

  for (let index = 8; index < 15; index += 1) {
    set(8, moduleSize - 15 + index, index);
  }
}

function getFormatBits(mask: number) {
  const lowErrorCorrectionBits = 1;
  const data = (lowErrorCorrectionBits << 3) | mask;
  let remainder = data;

  for (let index = 0; index < 10; index += 1) {
    remainder = (remainder << 1) ^ (((remainder >>> 9) & 1) * 0x537);
  }

  return ((data << 10) | (remainder & 0x3ff)) ^ 0x5412;
}

function shouldMask(mask: number, x: number, y: number) {
  switch (mask) {
    case 0:
      return (x + y) % 2 === 0;
    case 1:
      return y % 2 === 0;
    case 2:
      return x % 3 === 0;
    case 3:
      return (x + y) % 3 === 0;
    case 4:
      return (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0;
    case 5:
      return ((x * y) % 2) + ((x * y) % 3) === 0;
    case 6:
      return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
    case 7:
      return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
    default:
      return false;
  }
}

function calculatePenalty(modules: boolean[][]) {
  const lines = [
    ...modules,
    ...Array.from({ length: moduleSize }, (_, x) =>
      Array.from({ length: moduleSize }, (_, y) => modules[y][x])
    )
  ];
  let penalty = 0;

  for (const line of lines) {
    let runColor = line[0];
    let runLength = 1;

    for (let index = 1; index < line.length; index += 1) {
      if (line[index] === runColor) {
        runLength += 1;
      } else {
        if (runLength >= 5) {
          penalty += 3 + runLength - 5;
        }

        runColor = line[index];
        runLength = 1;
      }
    }

    if (runLength >= 5) {
      penalty += 3 + runLength - 5;
    }

    penalty += countFinderLikePatterns(line) * 40;
  }

  for (let y = 0; y < moduleSize - 1; y += 1) {
    for (let x = 0; x < moduleSize - 1; x += 1) {
      const color = modules[y][x];

      if (
        modules[y][x + 1] === color &&
        modules[y + 1][x] === color &&
        modules[y + 1][x + 1] === color
      ) {
        penalty += 3;
      }
    }
  }

  const darkCount = modules.flat().filter(Boolean).length;
  const totalCount = moduleSize * moduleSize;
  penalty += Math.floor(Math.abs(darkCount * 20 - totalCount * 10) / totalCount) * 10;

  return penalty;
}

function countFinderLikePatterns(line: boolean[]) {
  const patternA = [true, false, true, true, true, false, true, false, false, false, false];
  const patternB = [false, false, false, false, true, false, true, true, true, false, true];
  let count = 0;

  for (let index = 0; index <= line.length - 11; index += 1) {
    const segment = line.slice(index, index + 11);

    if (matchesPattern(segment, patternA) || matchesPattern(segment, patternB)) {
      count += 1;
    }
  }

  return count;
}

function matchesPattern(segment: boolean[], pattern: boolean[]) {
  return pattern.every((value, index) => segment[index] === value);
}

function addQuietZone(modules: boolean[][]): QrMatrix {
  const size = moduleSize + quietZone * 2;
  const output = Array.from({ length: size * size }, () => false);

  for (let y = 0; y < moduleSize; y += 1) {
    for (let x = 0; x < moduleSize; x += 1) {
      const outputX = x + quietZone;
      const outputY = y + quietZone;
      output[outputY * size + outputX] = modules[y][x];
    }
  }

  return { modules: output, size };
}

function isInBounds(x: number, y: number) {
  return x >= 0 && x < moduleSize && y >= 0 && y < moduleSize;
}

const exponentTable = new Array<number>(512);
const logTable = new Array<number>(256);

let value = 1;

for (let index = 0; index < 255; index += 1) {
  exponentTable[index] = value;
  logTable[value] = index;
  value <<= 1;

  if (value & 0x100) {
    value ^= 0x11d;
  }
}

for (let index = 255; index < exponentTable.length; index += 1) {
  exponentTable[index] = exponentTable[index - 255];
}

function createErrorCorrectionCodewords(data: number[], degree: number) {
  const generator = createReedSolomonGenerator(degree);
  const result = Array.from({ length: degree }, () => 0);

  for (const byte of data) {
    const factor = byte ^ (result.shift() ?? 0);
    result.push(0);

    for (let index = 0; index < generator.length; index += 1) {
      result[index] ^= multiplyGalois(generator[index], factor);
    }
  }

  return result;
}

function createReedSolomonGenerator(degree: number) {
  const result = Array.from({ length: degree }, () => 0);
  result[degree - 1] = 1;
  let root = 1;

  for (let index = 0; index < degree; index += 1) {
    for (let coefficient = 0; coefficient < degree; coefficient += 1) {
      result[coefficient] = multiplyGalois(result[coefficient], root);

      if (coefficient + 1 < degree) {
        result[coefficient] ^= result[coefficient + 1];
      }
    }

    root = multiplyGalois(root, 2);
  }

  return result;
}

function multiplyGalois(left: number, right: number) {
  if (left === 0 || right === 0) {
    return 0;
  }

  return exponentTable[logTable[left] + logTable[right]];
}
